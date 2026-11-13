import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { workCompletionBackend } from './helpers/workCompletionBackend'
import { sessionFixture } from './helpers/planningBackend'

const warning = 'Майбутні заплановані сесії буде скасовано, а час у плані звільниться.'
type Kind = 'task' | 'subtask'
const click = async (wrapper: VueWrapper, label: string) => {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === label)!
    .trigger('click')
  await flushPromises()
}
function backendFor(kind: Kind, future = false) {
  const backend = workCompletionBackend()
  if (kind === 'subtask')
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
  backend.sessions = [
    { ...sessionFixture(1), subtask_id: kind === 'subtask' ? 4 : null },
    ...(future
      ? [
          {
            ...sessionFixture(2),
            subtask_id: kind === 'subtask' ? 4 : null,
            starts_at: '2027-01-01T09:00:00Z',
            ends_at: '2027-01-01T09:30:00Z',
          },
        ]
      : []),
  ]
  return backend
}
async function open(kind: Kind, backend = backendFor(kind)) {
  const app = await renderApp(kind === 'task' ? '/tasks' : '/tasks/1', backend)
  if (kind === 'task') await click(app.wrapper, 'Завершити')
  else {
    await app.wrapper.get('[aria-label="Виконано: Розв’язати приклад"]').setValue(true)
    await flushPromises()
  }
  return { ...app, backend }
}
const postPaths = (fetch: Awaited<ReturnType<typeof renderApp>>['fetch']) =>
  fetch.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([url]) => new URL(url).pathname)
const pathFor = (kind: Kind) =>
  kind === 'task' ? '/api/tasks/1/complete' : '/api/tasks/1/subtasks/4/complete'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => vi.useRealTimers())

describe.each<Kind>(['task', 'subtask'])('adjacent %s completion', (kind) => {
  it.each([false, true])(
    'reviews before posting and warns only when future sessions exist (%s)',
    async (future) => {
      const { wrapper, backend, fetch } = await open(kind, backendFor(kind, future))
      const panel = wrapper.get('.completion-prompt')
      expect(wrapper.find('dialog').exists()).toBe(false)
      expect(panel.find('input,select,details,.card').exists()).toBe(false)
      expect(postPaths(fetch)).toEqual([])
      expect(panel.text().includes(warning)).toBe(future)
      if (future) expect(panel.text()).toContain('Сесій: 1')
      expect(
        fetch.mock.calls.some(([url]) => new URL(url).pathname.startsWith('/api/study-sessions')),
      ).toBe(false)
      expect(panel.html()).not.toContain('reviewed-state')
      if (kind === 'task')
        expect(wrapper.get('.task-row').find('.completion-prompt').exists()).toBe(true)
      else {
        expect(wrapper.get('.subtask-row').find('.completion-prompt').exists()).toBe(true)
        expect(
          (wrapper.get('[aria-label="Виконано: Розв’язати приклад"]').element as HTMLInputElement)
            .checked,
        ).toBe(false)
      }
      await click(wrapper, 'Підтвердити завершення')
      expect(postPaths(fetch)).toEqual([pathFor(kind)])
      const write = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!
      expect(JSON.parse(String(write[1]!.body))).toEqual({ completion_token: 'reviewed-state' })
      expect(window.confirm).not.toHaveBeenCalled()
      expect(backend.sessions[0]!.status).toBe('planned')
      if (future) {
        expect(backend.sessions[1]!.status).toBe('cancelled')
        expect(backend.sessions[1]!.actual_minutes).toBeNull()
      }
      expect(wrapper.find('.completion-prompt').exists()).toBe(false)
      if (kind === 'task') {
        expect(backend.base.tasks[0]!.status).toBe('completed')
        expect(wrapper.findAll('.task-row')).toHaveLength(0)
        await click(wrapper, 'Завершені')
        expect(wrapper.findAll('.task-row')).toHaveLength(1)
      } else {
        expect(backend.base.children[0]!.status).toBe('completed')
        expect(backend.base.tasks[0]!.status).toBe('pending')
      }
    },
  )
  it.each([false, true])('Back abandons the review without saving (%s future)', async (future) => {
    const { wrapper, backend, fetch } = await open(kind, backendFor(kind, future))
    await click(wrapper, 'Назад')
    expect(wrapper.find('.completion-prompt').exists()).toBe(false)
    expect(postPaths(fetch)).toEqual([])
    expect(backend.base.tasks[0]!.status).toBe('pending')
    expect(backend.sessions.every((session) => session.status === 'planned')).toBe(true)
    if (kind === 'subtask') expect(backend.base.children[0]!.status).toBe('pending')
  })
  it('shows an API failure next to the action without success or automatic replay', async () => {
    const { wrapper, backend, fetch } = await open(kind, backendFor(kind, true))
    backend.failure = { path: /\/complete$/, method: 'POST', status: 503 }
    await click(wrapper, 'Підтвердити завершення')
    expect(wrapper.get('.completion-prompt').text()).toContain('Запит не повторювався')
    expect(wrapper.find('.success-notice').exists()).toBe(false)
    expect(backend.base.tasks[0]!.status).toBe('pending')
    if (kind === 'subtask') expect(backend.base.children[0]!.status).toBe('pending')
    expect(backend.sessions.every((session) => session.status === 'planned')).toBe(true)
    await wrapper.get('.completion-prompt form').trigger('submit')
    await flushPromises()
    expect(postPaths(fetch)).toEqual([pathFor(kind)])
  })
  it('does not enable confirmation when the server review cannot be loaded', async () => {
    const backend = backendFor(kind),
      original = backend.handle
    backend.handle = (url, method, body, headers) =>
      url.endsWith('/completion-review') ? { status: 503 } : original(url, method, body, headers)
    const { wrapper, fetch } = await open(kind, backend)
    expect(wrapper.find('.completion-prompt [role="alert"]').exists()).toBeTruthy()
    expect(
      wrapper
        .findAll('.completion-prompt button')
        .find((button) => button.text() === 'Підтвердити завершення')!
        .attributes('disabled'),
    ).toBeDefined()
    await click(wrapper, 'Назад')
    expect(postPaths(fetch)).toEqual([])
  })
  it('requires a fresh review after stale server consent', async () => {
    const { wrapper, backend, fetch } = await open(kind, backendFor(kind, true))
    backend.failure = { path: /\/complete$/, method: 'POST', status: 409 }
    await click(wrapper, 'Підтвердити завершення')
    await wrapper.get('.completion-prompt form').trigger('submit')
    await flushPromises()
    expect(postPaths(fetch)).toHaveLength(1)
    backend.failure = null
    await click(wrapper, 'Отримати новий огляд')
    expect(postPaths(fetch)).toHaveLength(1)
    await click(wrapper, 'Підтвердити завершення')
    expect(postPaths(fetch)).toHaveLength(2)
    expect(wrapper.find('.completion-prompt').exists()).toBe(false)
  })
})

it('detects a changed task before sending a completion', async () => {
  const { wrapper, backend, fetch } = await open('task')
  backend.base.tasks[0]!.title = 'Змінене завдання'
  await click(wrapper, 'Підтвердити завершення')
  expect(wrapper.get('.completion-prompt').text()).toContain('Завдання змінилося')
  expect(postPaths(fetch)).toEqual([])
})
it('does not accept a successful HTTP response with an unfinished status as completion', async () => {
  const backend = backendFor('task'),
    original = backend.handle
  backend.handle = (url, method, body, headers) =>
    method === 'POST' && url.endsWith('/complete')
      ? { status: 200, body: { data: { ...backend.base.tasks[0]!, status: 'pending' } } }
      : original(url, method, body, headers)
  const { wrapper } = await open('task', backend)
  await click(wrapper, 'Підтвердити завершення')
  expect(wrapper.get('.completion-prompt').text()).toContain('Сервер не підтвердив завершення')
  expect(wrapper.find('.success-notice').exists()).toBe(false)
})
it('does not send duplicate writes while completion is pending', async () => {
  const { wrapper, fetch } = await open('task'),
    original = globalThis.fetch
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/complete')) await hold
      return original(url, init)
    }),
  )
  await wrapper.get('.completion-prompt form').trigger('submit')
  await wrapper.get('.completion-prompt form').trigger('submit')
  await flushPromises()
  release()
  await flushPromises()
  expect(postPaths(fetch)).toHaveLength(1)
})
