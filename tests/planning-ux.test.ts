import { expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import WorkPicker from '@/components/planning/WorkPicker.vue'
import PlanningReview from '@/components/planning/PlanningReview.vue'
import { planningBackend } from './helpers/planningBackend'
import { renderApp } from './helpers/renderApp'

it('supports keyboard selection and literal title searching without a large native select', async () => {
  const wrapper = mount(WorkPicker, {
    props: {
      modelValue: null,
      search: '',
      label: 'Завдання',
      allLabel: 'Уся робота',
      options: [{ id: 42, title: 'Курсова' }],
    },
  })
  await wrapper.get('input').trigger('focus')
  await wrapper.get('input').setValue('Курс')
  expect(wrapper.emitted('update:search')?.[0]).toEqual(['Курс'])
  await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
  await wrapper.get('input').trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([42])
  expect(wrapper.find('select').exists()).toBe(false)
})

it('renders only user explanations and no arbitrary technical fields', () => {
  const wrapper = mount(PlanningReview, {
    props: {
      timezone: 'UTC',
      review: {
        sessions: [],
        summary: {
          requested_seconds: 3600,
          allocated_seconds: 0,
          unscheduled_seconds: 3600,
          fully_allocated: false,
        },
        work_results: [],
        excluded_items: [
          {
            task_id: 1,
            reason_codes: ['no_available_study_time'],
            explanations: ['Немає вільного часу.'],
          },
        ],
        warnings: [],
        user_summary: { next_step: 'Додайте доступні години.' },
        arbitrary_server_key: 'secret_debug_value',
      } as never,
    },
    global: { stubs: { RouterLink: true } },
  })
  expect(wrapper.text()).toContain('Немає вільного часу.')
  expect(wrapper.text()).toContain('Додайте доступні години.')
  expect(wrapper.text()).not.toMatch(
    /no_available_study_time|secret_debug_value|arbitrary_server_key|Повний огляд/,
  )
})

it('reports all completed steps compactly and does not offer their selection', async () => {
  const backend = planningBackend()
  backend.base.children = [
    {
      id: 4,
      task_id: 1,
      title: 'Готовий крок',
      status: 'completed',
      position: 1,
      description: null,
      estimated_minutes: 30,
      deadline_at: null,
      completed_at: '2026-11-01T10:00:00Z',
    },
  ]
  const { wrapper } = await renderApp('/planning/preview', backend)
  await wrapper.get('#scope-task').trigger('focus')
  const option = wrapper
    .findAll('[role="option"] button')
    .find((item) => item.text() === backend.base.tasks[0]!.title)!
  await option.trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Усі підзавдання виконано')
  expect(wrapper.find('#scope-subtask').exists()).toBe(false)
  expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
})

it('rechecks a step completed after selection without submitting a broadened preview', async () => {
  const backend = planningBackend()
  backend.base.children = [
    {
      id: 4,
      task_id: 1,
      title: 'Крок',
      status: 'pending',
      position: 1,
      description: null,
      estimated_minutes: 30,
      deadline_at: null,
      completed_at: null,
    },
  ]
  const { wrapper } = await renderApp('/planning/preview', backend)
  const pick = async (id: string, text: string) => {
    await wrapper.get(id).trigger('focus')
    await wrapper
      .findAll('[role="option"] button')
      .find((item) => item.text() === text)!
      .trigger('click')
    await flushPromises()
  }
  await pick('#scope-task', backend.base.tasks[0]!.title)
  await pick('#scope-subtask', 'Крок')
  backend.base.children[0]!.status = 'completed'
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('Вибрана робота вже завершена')
  expect(
    backend.requests.some(
      (request) => request.method === 'POST' && request.path.endsWith('/preview'),
    ),
  ).toBe(false)
})

it('does not turn an unmatched typed search into all-work selection on Enter', async () => {
  const wrapper = mount(WorkPicker, {
    props: {
      modelValue: 42,
      search: 'невідома назва',
      label: 'Завдання',
      allLabel: 'Уся робота',
      options: [{ id: 42, title: 'Курсова' }],
    },
  })
  await wrapper.get('input').trigger('focus')
  await wrapper.get('input').trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(wrapper.text()).toContain('Нічого не знайдено')
})
