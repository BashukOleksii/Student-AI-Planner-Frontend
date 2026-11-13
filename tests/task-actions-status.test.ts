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
    expect(new URL(lastUrl).searchParams.get('status')).toBe('active')
    expect(new URL(lastUrl).searchParams.get('page')).toBe('2')
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
