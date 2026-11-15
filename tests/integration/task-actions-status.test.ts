import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { task } from '../fixtures'
import { f2Backend } from '../helpers/f2Backend'
import { renderApp } from '../helpers/renderApp'
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
