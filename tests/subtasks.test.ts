import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { f2Backend } from './helpers/f2Backend'
import SubtaskForm from '@/components/domain/SubtaskForm.vue'
import type { Subtask } from '@/types/api'
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
    expect(wrapper.text()).toContain('Позиція 4')
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
    const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
    await button('Завершити підзавдання').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('100%')
    expect(backend.tasks[0]?.status).toBe('pending')
    await button('Відновити підзавдання').trigger('click')
    await flushPromises()
    expect(wrapper.get('progress').attributes('value')).toBe('0')
    expect(backend.requests.filter((r) => r.method === 'POST').map((r) => r.path)).toEqual([
      '/api/tasks/1/subtasks/8/complete',
      '/api/tasks/1/subtasks/8/reopen',
    ])
  })
  it('displays authoritative partial percentage and keeps completed parent independent', async () => {
    const backend = f2Backend()
    backend.tasks[0]!.status = 'completed'
    backend.children = [child(2, 1), child(3, 2), child(4, 3)]
    backend.progressOverride = {
      task_id: 1,
      total_subtasks: 3,
      completed_subtasks: 2,
      progress_percent: 67,
    }
    const { wrapper } = await renderApp('/tasks/1', backend)
    expect(wrapper.get('progress').attributes('value')).toBe('67')
    expect(wrapper.text()).toContain('Виконано 2 із 3')
    expect(backend.children.every((c) => c.status === 'pending')).toBe(true)
  })
  it('keeps a completed parent with pending children at the server-provided 0%', async () => {
    const backend = f2Backend()
    backend.tasks[0]!.status = 'completed'
    backend.children = [child(8, 1)]
    const { wrapper } = await renderApp('/tasks/1', backend)
    expect(wrapper.get('progress').attributes('value')).toBe('0')
    expect(wrapper.get('.task-detail-meta').text()).toContain('Виконано')
    expect(wrapper.get('.subtask-row .badge').text()).toBe('До виконання')
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
    expect(wrapper.text()).toContain('Позиція 3')
    expect(backend.requests.filter((r) => r.path.endsWith('/progress'))).toHaveLength(2)
  })
  it('confirms and cancels deletion; deleted-only list has null progress', async () => {
    const backend = f2Backend()
    backend.children = [child(8, 1)]
    const { wrapper } = await renderApp('/tasks/1', backend)
    await wrapper.get('[aria-label="Видалити підзавдання: Крок 8"]').trigger('click')
    await wrapper.get('dialog button.secondary').trigger('click')
    expect(backend.requests.some((r) => r.method === 'DELETE')).toBe(false)
    await wrapper.get('[aria-label="Видалити підзавдання: Крок 8"]').trigger('click')
    await wrapper.get('dialog button.danger').trigger('click')
    await flushPromises()
    expect(wrapper.find('progress').exists()).toBe(false)
    expect(wrapper.text()).toContain('Підзавдань поки немає')
    expect(backend.requests.filter((r) => r.method === 'DELETE')).toHaveLength(1)
  })
  it.each([422, 409, 419])(
    'handles %s without changing order or replaying a mutation',
    async (status) => {
      const backend = f2Backend()
      backend.children = [child(8, 1), child(9, 2)]
      backend.failure = {
        path: /reorder$/,
        method: 'POST',
        status,
        fields: { subtask_ids: ['Оновіть склад підзавдань.'] },
      }
      const { wrapper } = await renderApp('/tasks/1', backend)
      await wrapper.get('[aria-label="Перемістити вниз: Крок 8"]').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Оновіть склад підзавдань')
      expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(1)
      expect(wrapper.findAll('.subtask-row h3')[0]?.text()).toBe('Крок 8')
    },
  )
  it('maps backend parent-deadline validation to the form', async () => {
    const backend = f2Backend()
    backend.failure = {
      path: /subtasks$/,
      method: 'POST',
      status: 422,
      fields: { deadline_at: ['Дедлайн пізніше завдання.'] },
    }
    const { wrapper } = await renderApp('/tasks/1', backend)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Додати підзавдання')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#subtask-title').setValue('Крок')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#subtask-deadline').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Дедлайн пізніше завдання.')
  })
  it('does not write twice while an existing subtask is being completed', async () => {
    const backend = f2Backend()
    backend.children = [child(8, 1)]
    const { wrapper, fetch } = await renderApp('/tasks/1', backend)
    let resolve: ((response: Response) => void) | undefined
    const delayed = vi.fn((url: string, init?: RequestInit) =>
      url.endsWith('/complete')
        ? new Promise<Response>((r) => {
            resolve = r
          })
        : fetch(url, init),
    )
    vi.stubGlobal('fetch', delayed)
    const button = wrapper.findAll('button').find((b) => b.text() === 'Завершити підзавдання')!
    await button.trigger('click')
    await button.trigger('click')
    expect(button.attributes('disabled')).toBeDefined()
    expect(delayed.mock.calls.filter((c) => c[0].endsWith('/complete'))).toHaveLength(1)
    resolve?.(new Response(JSON.stringify({ data: child(8, 1) })))
    await flushPromises()
  })
  it('aborts a stale detail read when navigating away', async () => {
    const backend = f2Backend()
    backend.children = [child(8, 1)]
    const { wrapper, router, fetch } = await renderApp('/tasks/1', backend)
    let signal: AbortSignal | null | undefined
    let resolve: ((response: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        url.endsWith('/subtasks/8')
          ? new Promise<Response>((r) => {
              signal = init?.signal
              resolve = r
            })
          : fetch(url, init),
      ),
    )
    await wrapper.get('[aria-label="Редагувати підзавдання: Крок 8"]').trigger('click')
    await flushPromises()
    await router.push('/profile')
    await flushPromises()
    expect(signal?.aborted).toBe(true)
    resolve?.(new Response(JSON.stringify({ data: child(8, 1) })))
    await flushPromises()
    expect(wrapper.find('#subtask-title').exists()).toBe(false)
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
    expect(wrapper.get('#subtask-deadline').attributes('min')).toBeUndefined()
    expect(wrapper.get('#subtask-deadline').attributes('max')).toBeUndefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[1]?.[0]).toMatchObject({ deadline_at: null })
  })
})
