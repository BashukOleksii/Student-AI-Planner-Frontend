import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { f2Backend } from './helpers/f2Backend'
import { task } from './fixtures'

describe('task actions and server status groups', () => {
  it('requests all active statuses before pagination and keeps the filter on reload', async () => {
    const backend = f2Backend()
    backend.tasks.splice(
      0,
      backend.tasks.length,
      ...[
        ...Array.from({ length: 17 }, (_, i) => ({
          ...task,
          id: i + 1,
          title: `Активне ${i + 1}`,
          status: i % 2 ? ('missed' as const) : ('pending' as const),
        })),
        { ...task, id: 99, title: 'Готове', status: 'completed' as const },
      ],
    )
    const { wrapper, fetch } = await renderApp('/tasks', backend)
    expect(wrapper.get('.task-status-filter [aria-pressed="true"]').text()).toBe('Активні')
    expect(wrapper.findAll('.task-row')).toHaveLength(15)
    expect(wrapper.text()).not.toContain('Готове')
    expect(wrapper.text()).not.toContain('Інші дії')
    expect(wrapper.text()).not.toContain('Позначити невиконаним')
    expect(wrapper.text()).not.toContain('Повернути до виконання')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Далі →')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.task-row')).toHaveLength(2)
    const lastUrl = fetch.mock.calls
      .filter(([url]) => new URL(url).pathname === '/api/tasks')
      .at(-1)![0]
    expect(['pending', 'missed']).toContain(new URL(lastUrl).searchParams.get('status'))
    expect(
      fetch.mock.calls.some(([url]) => new URL(url).searchParams.get('status') === 'active'),
    ).toBe(false)
    await wrapper
      .findAll('.task-status-filter button')
      .find((b) => b.text() === 'Завершені')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.task-row')).toHaveLength(1)
    expect(wrapper.get('.task-row').text()).toContain('Переглянути')
    expect(wrapper.get('.task-row').text()).not.toContain('Завершити')
    expect(wrapper.get('.task-row').text()).not.toContain('Редагувати')
  })
  it('renders completed details read-only even at the direct form URL', async () => {
    const backend = f2Backend()
    backend.tasks[0]!.status = 'completed'
    const { wrapper } = await renderApp('/tasks/1?edit=1', backend)
    expect(wrapper.find('.task-readonly').exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Редагувати')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Зберегти зміни')).toBe(false)
    expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
  })
})

it('merges enough complete server prefixes beyond the first hundred records', async () => {
  const { vi } = await import('vitest')
  const { taskListPage } = await import('@/api/taskList')
  const backend = f2Backend()
  backend.tasks.splice(
    0,
    backend.tasks.length,
    ...Array.from({ length: 440 }, (_, i) => ({
      ...task,
      id: i + 1,
      status: i % 2 ? ('missed' as const) : ('pending' as const),
    })),
  )
  const fetch = vi.fn(async (url: string) => {
    const result = backend.handle(url)
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetch)
  const response = await taskListPage({ status: 'active', page: 8, per_page: 15 })
  expect(response.data.map((row) => row.id)).toEqual(Array.from({ length: 15 }, (_, i) => i + 106))
  expect(response.meta).toMatchObject({ total: 440, current_page: 8, last_page: 30 })
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(
    fetch.mock.calls.every(([url]) =>
      ['pending', 'missed'].includes(new URL(url).searchParams.get('status')!),
    ),
  ).toBe(true)
})

it('does not PATCH work completed after an edit form was opened', async () => {
  const backend = f2Backend()
  const { wrapper, fetch } = await renderApp('/tasks/1', backend)
  await wrapper.get('#task-title').setValue('Чернетка редагування')
  backend.tasks[0]!.status = 'completed'
  backend.tasks[0]!.completed_at = '2026-11-13T10:00:00Z'
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.find('.task-readonly').exists()).toBe(true)
  expect(wrapper.find('form').exists()).toBe(false)
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
})

it('keeps overdue independent of the API task status and describes deletion as cancellation', async () => {
  const backend = f2Backend()
  backend.tasks[0]!.status = 'pending'
  backend.tasks[0]!.deadline_at = '2000-01-01T00:00:00Z'
  backend.tasks.push({ ...task, id: 2, status: 'missed' }, { ...task, id: 3, status: 'completed' })
  const { wrapper } = await renderApp('/tasks', backend)
  await wrapper
    .findAll('.task-status-filter button')
    .find((button) => button.text() === 'Усі')!
    .trigger('click')
  await flushPromises()
  const rows = wrapper.findAll('.task-row')
  expect(rows[0]!.text()).toContain('Очікує виконання')
  expect(rows[0]!.text()).toContain('Прострочено')
  expect(rows[1]!.text()).toContain('Не виконано')
  expect(rows[2]!.text()).toContain('Завершено')
  expect(backend.tasks[0]!.status).toBe('pending')
  await rows[0]!
    .findAll('button')
    .find((button) => button.text() === 'Видалити')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.get('dialog').text()).toContain(
    'Майбутні заплановані сесії буде скасовано, а час звільниться',
  )
  expect(wrapper.get('dialog').text()).not.toContain('сесії буде завершено')
  expect(backend.requests.every((request) => request.method === 'GET')).toBe(true)
})
