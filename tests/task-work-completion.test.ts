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
  return app
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
    expect(
      (wrapper.get('input[name="work-completion-choice"]').element as HTMLInputElement).checked,
    ).toBe(true)
    expect(wrapper.find('#work-actual-minutes').exists()).toBe(false)
    await wrapper.get('input[type="radio"][value="1"]').setValue(true)
    await flushPromises()
    expect((wrapper.get('#work-actual-minutes').element as HTMLInputElement).value).toBe('')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(writes(fetch)).toHaveLength(0)
    await wrapper.get('#work-actual-minutes').setValue('17')
    await wrapper.get('dialog form').trigger('submit')
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
    expect(wrapper.findAll('input[type="radio"]').length).toBe(1)
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
    expect(wrapper.text()).toContain('Основне завдання залишиться у своєму стані')
    await wrapper.get('#work-actual-minutes').setValue('12')
    await wrapper.get('dialog form').trigger('submit')
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
      await wrapper.get('dialog form').trigger('submit')
      await flushPromises()
      expect(writes(fetch)).toHaveLength(0)
      expect(wrapper.text()).toContain('Запит не повторювався')
      await click(wrapper, 'Отримати новий огляд')
      await wrapper.get('input[type="radio"][value="1"]').setValue(true)
      await flushPromises()
      await wrapper.get('#work-actual-minutes').setValue('10')
      backend.failure = { path: /study-sessions\/1\/complete$/, method: 'POST', status: 503 }
      await wrapper.get('dialog form').trigger('submit')
      await flushPromises()
      await wrapper.get('dialog form').trigger('submit')
      await flushPromises()
      expect(writes(fetch)).toHaveLength(1)
      expect(backend.base.tasks[0]!.status).toBe('pending')
    },
  )
})
