import SubtaskForm from '@/components/domain/SubtaskForm.vue'
import type { Subtask } from '@/types/api'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { f2Backend } from '../helpers/f2Backend'
import { renderApp } from '../helpers/renderApp'
const child = (id: number, position: number): Subtask => ({
  id,
  task_id: 1,
  title: `Крок ${id}`,
  description: null,
  position,
  status: 'pending',
  estimated_minutes: null,
  deadline_at: null,
  completed_at: null,
})
describe('nested task workspace', () => {
  it('shows null progress for no children, creates a child and refreshes server progress', async () => {
    const { wrapper, backend } = await renderApp('/tasks/1')
    expect(wrapper.text()).toContain('Прогрес ще не визначено')
    expect(wrapper.find('progress').exists()).toBe(false)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Додати підзавдання')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#subtask-title').setValue('Прочитати')
    await wrapper.get('#subtask-deadline').setValue('2026-11-10T12:30')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Прочитати')
    expect(wrapper.text()).toContain('0%')
    expect(backend.requests.find((r) => r.method === 'POST')?.body).toEqual({
      title: 'Прочитати',
      description: null,
      estimated_minutes: null,
      deadline_at: '2026-11-10T10:30:00Z',
    })
    expect(backend.requests.filter((r) => r.path.endsWith('/progress'))).toHaveLength(2)
  })
  it('uses detail GET and minimal nested PATCH; complete and reopen do not change the parent', async () => {
    const backend = f2Backend()
    backend.children = [child(8, 4)]
    const { wrapper } = await renderApp('/tasks/1', backend)
    expect(wrapper.text()).toContain('Крок 4')
    await wrapper.get('[aria-label="Редагувати підзавдання: Крок 8"]').trigger('click')
    await flushPromises()
    await wrapper.get('#subtask-title').setValue('Оновлений крок')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((r) => r.method === 'PATCH')).toEqual({
      path: '/api/tasks/1/subtasks/8',
      method: 'PATCH',
      body: { title: 'Оновлений крок' },
    })
    await wrapper.get('[aria-label="Виконано: Оновлений крок"]').setValue(true)
    await flushPromises()
    await wrapper.get('.completion-prompt form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('100%')
    expect(backend.tasks[0]?.status).toBe('pending')
    await wrapper.get('[aria-label="Виконано: Оновлений крок"]').setValue(false)
    await flushPromises()
    expect(wrapper.get('progress').attributes('value')).toBe('0')
    expect(backend.requests.filter((r) => r.method === 'POST').map((r) => r.path)).toEqual([
      '/api/tasks/1/subtasks/8/complete',
      '/api/tasks/1/subtasks/8/reopen',
    ])
  })
  it('rejects a missing or mismatched nested child detail without exposing an editable form', async () => {
    const backend = f2Backend()
    backend.children = [child(8, 1)]
    backend.failure = { method: 'GET', path: /subtasks\/8$/, status: 404 }
    const { wrapper } = await renderApp('/tasks/1', backend)
    await wrapper.get('[aria-label="Редагувати підзавдання: Крок 8"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('dialog').text()).toContain('Запис недоступний')
    expect(wrapper.find('#subtask-title').exists()).toBe(false)
    expect(backend.requests.some((r) => r.path === '/api/tasks/1/subtasks/8')).toBe(true)
  })
  it('sends the full active ID permutation and displays returned positions', async () => {
    const backend = f2Backend()
    backend.children = [child(8, 2), child(9, 5), { ...child(10, 9), status: 'completed' }]
    const { wrapper } = await renderApp('/tasks/1', backend)
    await wrapper.get('[aria-label="Перемістити вниз: Крок 8"]').trigger('click')
    await flushPromises()
    expect(backend.requests.find((r) => r.path.endsWith('/reorder'))?.body).toEqual({
      subtask_ids: [9, 8, 10],
    })
    expect(wrapper.findAll('.subtask-row h3').map((h) => h.text())).toEqual([
      'Крок 9',
      'Крок 8',
      'Крок 10',
    ])
    expect(wrapper.text()).toContain('Крок 3')
    expect(backend.requests.filter((r) => r.path.endsWith('/progress'))).toHaveLength(2)
  })
})
describe('Subtask deadline form', () => {
  it('preserves an unchanged ambiguous UTC instant and rejects a new ambiguous local time', async () => {
    const original = { ...child(8, 1), deadline_at: '2026-10-25T01:30:00Z' }
    const wrapper = mount(SubtaskForm, {
      props: {
        subtask: original,
        parentDeadline: null,
        timezone: 'Europe/Kyiv',
        errors: {},
        busy: false,
      },
    })
    expect(wrapper.get('#subtask-deadline').attributes('min')).toBe('1000-01-01T00:00')
    await wrapper.get('#subtask-title').setValue('Змінена назва')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ deadline_at: original.deadline_at })
    await wrapper.get('#subtask-deadline').setValue('2026-03-29T03:30')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#subtask-deadline').attributes('aria-invalid')).toBe('true')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    await wrapper.get('#subtask-deadline').setValue('')
    expect(wrapper.get('#subtask-deadline').attributes('min')).toBe('1000-01-01T00:00')
    expect(wrapper.get('#subtask-deadline').attributes('max')).toBe('9999-12-31T23:59:59')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[1]?.[0]).toMatchObject({ deadline_at: null })
  })
})
