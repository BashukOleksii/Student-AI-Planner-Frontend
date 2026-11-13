import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { workCompletionBackend } from './helpers/workCompletionBackend'
import { sessionFixture } from './helpers/planningBackend'
const click = async (wrapper: VueWrapper, label: string) => {
  await wrapper
    .findAll('button')
    .find((b) => b.text() === label)!
    .trigger('click')
  await flushPromises()
}
async function open(backend = workCompletionBackend()) {
  const app = await renderApp('/tasks', backend)
  await click(app.wrapper, 'Завершити')
  return { ...app, backend }
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => vi.useRealTimers())
const writes = (fetch: Awaited<ReturnType<typeof renderApp>>['fetch']) =>
  fetch.mock.calls.filter(([, init]) => init?.method === 'POST')

describe('completion from tasks with the existing session contract', () => {
  it('completes work without a session and moves it from active to completed without resetting the switch', async () => {
    const { wrapper, fetch } = await open()
    await click(wrapper, 'Завершити тільки завдання')
    expect(writes(fetch).map(([url]) => new URL(url).pathname)).toEqual(['/api/tasks/1/complete'])
    expect(wrapper.findAll('.task-row')).toHaveLength(0)
    expect(wrapper.get('.task-status-filter [aria-pressed="true"]').text()).toBe('Активні')
    await click(wrapper, 'Завершені')
    expect(wrapper.findAll('.task-row')).toHaveLength(1)
    expect(wrapper.get('.task-row').text()).toContain('Переглянути')
  })
  it('requires an explicit session choice and actual minutes, then makes exactly one combined POST', async () => {
    const backend = workCompletionBackend()
    backend.sessions = [sessionFixture(1), sessionFixture(2)]
    const { wrapper, fetch } = await open(backend)
    expect(wrapper.findAll('.completion-candidates input[type="radio"]')).toHaveLength(2)
    expect(
      wrapper
        .findAll('.completion-candidates input[type="radio"]')
        .every((radio) => !(radio.element as HTMLInputElement).checked),
    ).toBe(true)
    expect(wrapper.find('#work-actual-minutes').exists()).toBe(false)
    await wrapper.get('input[type="radio"][value="1"]').setValue(true)
    await flushPromises()
    expect((wrapper.get('#work-actual-minutes').element as HTMLInputElement).value).toBe('')
    await wrapper.get('.completion-session-form').trigger('submit')
    await flushPromises()
    expect(writes(fetch)).toHaveLength(0)
    await wrapper.get('#work-actual-minutes').setValue('17')
    await wrapper.get('.completion-session-form').trigger('submit')
    await flushPromises()
    expect(writes(fetch).map(([url]) => new URL(url).pathname)).toEqual([
      '/api/study-sessions/1/complete',
    ])
    expect(JSON.parse(String(writes(fetch)[0]![1]?.body))).toEqual({
      actual_minutes: 17,
      complete_work: true,
      completion_token: 'reviewed-state',
    })
    expect(backend.sessions[0]!.actual_minutes).toBe(17)
    expect(backend.sessions[1]!.status).toBe('planned')
    expect(backend.base.tasks[0]!.status).toBe('completed')
  })
  it('never offers a future session as completed; work-only completion cancels it after existing consent', async () => {
    const backend = workCompletionBackend()
    backend.sessions = [
      { ...sessionFixture(1), starts_at: '2026-11-13T11:00:00Z', ends_at: '2026-11-13T12:00:00Z' },
    ]
    const { wrapper, fetch } = await open(backend)
    expect(wrapper.findAll('input[type="radio"]').length).toBe(0)
    expect(wrapper.get('.completion-work-only').text()).toContain('Майбутніх сесій: 1')
    expect(wrapper.get('.completion-work-only').text()).toContain(
      'Їх буде скасовано, а час звільниться',
    )
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await click(wrapper, 'Завершити тільки завдання')
    expect(writes(fetch)).toHaveLength(0)
    expect(backend.sessions[0]!.status).toBe('planned')
    await click(wrapper, 'Завершити тільки завдання')
    expect(window.confirm).toHaveBeenCalledWith('Буде скасовано майбутніх сесій: 1')
    expect(backend.sessions[0]!.status).toBe('cancelled')
    expect(backend.sessions[0]!.actual_minutes).toBeNull()
    expect(writes(fetch).map(([url]) => new URL(url).pathname)).toEqual(['/api/tasks/1/complete'])
  })
  it('completes only the linked subtask, leaving its parent active', async () => {
    const backend = workCompletionBackend()
    backend.base.children = [
      {
        id: 4,
        task_id: 1,
        title: 'Навчальний крок',
        description: null,
        deadline_at: null,
        estimated_minutes: 30,
        position: 1,
        status: 'pending',
        completed_at: null,
      },
    ]
    backend.sessions = [
      { ...sessionFixture(1), subtask_id: 4 },
      {
        ...sessionFixture(2),
        subtask_id: 4,
        starts_at: '2026-11-13T11:00:00Z',
        ends_at: '2026-11-13T12:00:00Z',
      },
      { ...sessionFixture(3), starts_at: '2026-11-13T11:00:00Z', ends_at: '2026-11-13T12:00:00Z' },
    ]
    const { wrapper, fetch } = await open(backend)
    await wrapper.get('input[type="radio"][value="1"]').setValue(true)
    await flushPromises()
    expect(wrapper.get('.completion-selected').text()).toContain(
      'Буде завершено підзавдання «Навчальний крок»',
    )
    expect(wrapper.text()).toContain('Основне завдання залишиться у своєму стані')
    await wrapper.get('#work-actual-minutes').setValue('12')
    await wrapper.get('.completion-session-form').trigger('submit')
    await flushPromises()
    expect(backend.sessions[1]!.status).toBe('cancelled')
    expect(backend.sessions[2]!.status).toBe('planned')
    expect(backend.base.children[0]!.status).toBe('completed')
    expect(backend.base.tasks[0]!.status).toBe('pending')
    expect(wrapper.findAll('.task-row')).toHaveLength(1)
    expect(writes(fetch)).toHaveLength(1)
  })
  it.each(['task', 'session'] as const)(
    'does not post after a detected %s edit and does not retry an uncertain combined write',
    async (changed) => {
      const backend = workCompletionBackend()
      backend.sessions = [sessionFixture(1)]
      const { wrapper, fetch } = await open(backend)
      await wrapper.get('input[type="radio"][value="1"]').setValue(true)
      await flushPromises()
      await wrapper.get('#work-actual-minutes').setValue('10')
      if (changed === 'task') backend.base.tasks[0]!.title = 'Змінена робота'
      else backend.sessions[0]!.ends_at = '2026-11-02T11:00:00Z'
      await wrapper.get('.completion-session-form').trigger('submit')
      await flushPromises()
      expect(writes(fetch)).toHaveLength(0)
      expect(wrapper.text()).toContain('Запит не повторювався')
      await click(wrapper, 'Отримати новий огляд')
      await wrapper.get('input[type="radio"][value="1"]').setValue(true)
      await flushPromises()
      await wrapper.get('#work-actual-minutes').setValue('10')
      backend.failure = { path: /study-sessions\/1\/complete$/, method: 'POST', status: 503 }
      await wrapper.get('.completion-session-form').trigger('submit')
      await flushPromises()
      await wrapper.get('.completion-session-form').trigger('submit')
      await flushPromises()
      expect(writes(fetch)).toHaveLength(1)
      expect(backend.base.tasks[0]!.status).toBe('pending')
    },
  )
})

describe('independent completion cards and period search', () => {
  it('keeps work-only independent of a selected session and never completes past sessions implicitly', async () => {
    const backend = workCompletionBackend()
    backend.sessions = [sessionFixture(1)]
    const { wrapper, fetch } = await open(backend)
    expect(wrapper.findAll('dialog .card')).toHaveLength(2)
    expect(wrapper.find('.completion-work-only input').exists()).toBe(false)
    expect(wrapper.find('.completion-work-only .completion-consequence').exists()).toBe(false)
    await wrapper.get('input[type="radio"][value="1"]').setValue(true)
    await flushPromises()
    expect((wrapper.get('#work-actual-minutes').element as HTMLInputElement).value).toBe('')
    await click(wrapper, 'Завершити тільки завдання')
    expect(writes(fetch).map(([url]) => new URL(url).pathname)).toEqual(['/api/tasks/1/complete'])
    expect(backend.sessions[0]!.status).toBe('planned')
    expect(backend.sessions[0]!.actual_minutes).toBeNull()
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('searches an older period on demand and completes the explicitly selected older session', async () => {
    const backend = workCompletionBackend()
    backend.sessions = [
      {
        ...sessionFixture(42),
        starts_at: '2026-09-10T09:00:00Z',
        ends_at: '2026-09-10T10:00:00Z',
        duration_seconds: 3600,
      },
    ]
    const { wrapper, fetch } = await open(backend)
    expect(wrapper.find('.completion-search').attributes('open')).toBeUndefined()
    expect(wrapper.get('.completion-empty').text()).toBe(
      'За цей період немає сесій, доступних для завершення',
    )
    expect(wrapper.find('#work-actual-minutes').exists()).toBe(false)
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(0)
    expect(
      wrapper
        .findAll('dialog button')
        .find((button) => button.text() === 'Завершити тільки завдання')!
        .attributes('disabled'),
    ).toBeUndefined()
    await wrapper.get('.completion-search summary').trigger('click')
    const dates = wrapper.findAll('.completion-search input[type="date"]')
    await dates[0]!.setValue('2026-09-01')
    await dates[1]!.setValue('2026-09-30')
    await wrapper.get('.completion-search form').trigger('submit')
    await flushPromises()
    const queries = fetch.mock.calls
      .filter(([url]) => new URL(url).pathname === '/api/study-sessions')
      .map(([url]) => new URL(url).search)
    expect(queries).toHaveLength(2)
    expect(queries[1]).toBe('?start_date=2026-09-01&end_date=2026-09-30')
    expect(writes(fetch)).toHaveLength(0)
    expect(
      (wrapper.get('input[type="radio"][value="42"]').element as HTMLInputElement).checked,
    ).toBe(false)
    await wrapper.get('input[type="radio"][value="42"]').setValue(true)
    await flushPromises()
    await wrapper.get('#work-actual-minutes').setValue('23')
    await wrapper.get('.completion-session-form').trigger('submit')
    await flushPromises()
    expect(writes(fetch).map(([url]) => new URL(url).pathname)).toEqual([
      '/api/study-sessions/42/complete',
    ])
    expect(backend.sessions[0]!.actual_minutes).toBe(23)
  })
  it.each(['empty', 'error', 'invalid'] as const)(
    'a %s session search does not block work-only completion',
    async (state) => {
      const { wrapper, backend, fetch } = await open()
      if (state === 'error')
        backend.failure = { path: /study-sessions$/, method: 'GET', status: 503 }
      const dates = wrapper.findAll('.completion-search input[type="date"]')
      await dates[0]!.setValue('2026-09-01')
      await dates[1]!.setValue(state === 'invalid' ? '2026-10-31' : '2026-09-30')
      await wrapper.get('.completion-search form').trigger('submit')
      await flushPromises()
      expect(
        wrapper
          .findAll('dialog button')
          .find((button) => button.text() === 'Завершити тільки завдання')!
          .attributes('disabled'),
      ).toBeUndefined()
      if (state === 'invalid')
        expect(wrapper.get('.completion-search .field-error').text()).toContain('31')
      await click(wrapper, 'Завершити тільки завдання')
      expect(writes(fetch).map(([url]) => new URL(url).pathname)).toEqual(['/api/tasks/1/complete'])
      expect(backend.base.tasks[0]!.status).toBe('completed')
    },
  )
  it('offers only started planned sessions linked to unfinished work', async () => {
    const backend = workCompletionBackend()
    backend.sessions = [
      sessionFixture(1),
      { ...sessionFixture(2), starts_at: '2026-11-14T09:00:00Z', ends_at: '2026-11-14T10:00:00Z' },
      { ...sessionFixture(3), status: 'completed' },
      { ...sessionFixture(4), status: 'missed' },
      { ...sessionFixture(5), status: 'cancelled' },
      { ...sessionFixture(6), task_id: 2 },
    ]
    const { wrapper } = await open(backend)
    expect(
      wrapper.findAll('.completion-candidates input').map((radio) => radio.attributes('value')),
    ).toEqual(['1'])
  })
  it('uses backend future counts even when the future session is outside the searched period', async () => {
    const backend = workCompletionBackend()
    backend.sessions = [
      { ...sessionFixture(1), starts_at: '2027-01-01T09:00:00Z', ends_at: '2027-01-01T10:00:00Z' },
    ]
    const { wrapper } = await open(backend)
    expect(wrapper.get('.completion-empty').text()).toContain('За цей період')
    expect(wrapper.get('.completion-work-only .completion-consequence').text()).toContain(
      'Майбутніх сесій: 1',
    )
  })
  it('names a subtask in both independent actions without completing the parent', async () => {
    const backend = workCompletionBackend()
    backend.base.children = [
      {
        id: 4,
        task_id: 1,
        title: 'Розв’язати приклад',
        description: null,
        deadline_at: null,
        estimated_minutes: 30,
        position: 1,
        status: 'pending',
        completed_at: null,
      },
    ]
    const { wrapper, fetch } = await renderApp('/tasks/1', backend)
    await wrapper.get('[aria-label="Виконано: Розв’язати приклад"]').setValue(true)
    await flushPromises()
    expect(wrapper.get('.completion-work-only h2').text()).toBe('Завершити тільки підзавдання')
    expect(wrapper.get('dialog').text()).toContain('Розв’язати приклад')
    await click(wrapper, 'Завершити тільки підзавдання')
    expect(writes(fetch).map(([url]) => new URL(url).pathname)).toEqual([
      '/api/tasks/1/subtasks/4/complete',
    ])
    expect(backend.base.tasks[0]!.status).toBe('pending')
  })
  it('does not show success or silently replay a failed work-only operation', async () => {
    const { wrapper, backend, fetch } = await open()
    backend.failure = { path: /tasks\/1\/complete$/, method: 'POST', status: 503 }
    await click(wrapper, 'Завершити тільки завдання')
    expect(wrapper.find('dialog').exists()).toBe(true)
    expect(wrapper.find('.success-notice').exists()).toBe(false)
    expect(wrapper.text()).toContain('Запит не повторювався')
    expect(backend.base.tasks[0]!.status).toBe('pending')
    await wrapper.get('.completion-work-only form').trigger('submit')
    await flushPromises()
    expect(writes(fetch)).toHaveLength(1)
  })
})
