import { localizedEffects } from '@/utils/aiEffects'
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import StudyProposal from '@/components/planning/StudyProposal.vue'
import WorkLink from '@/components/planning/WorkLink.vue'
import FormField from '@/components/ui/FormField.vue'
import { useWorkLabels } from '@/composables/useWorkLabels'
import { renderApp } from './helpers/renderApp'
import { planningBackend } from './helpers/planningBackend'
import { semesterBackend } from './helpers/semesterBackend'
import { task, json } from './fixtures'

describe('Student page content', () => {
  it('translates known backend effects completely and preserves unknown evidence without mutating it', () => {
    const input = [
      'Complete the task and cancel dependent scheduled reminders. Subtask and study-session statuses are preserved.',
      'Additional material effect from a future server',
      { cancel_reminders: true },
    ]
    const result = localizedEffects(input)
    expect(result).toEqual([
      'Завдання буде завершено, а залежні заплановані нагадування — скасовано. Стани підзавдань і навчальних сесій залишаться без змін.',
      input[1],
      input[2],
    ])
    expect(input[0]).toContain('Complete the task')
    expect(result).not.toBe(input)
  })
  it('resolves referenced work once and renders a safe fallback for unavailable work without writes', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/1') ? json({ data: task }) : json({ message: 'Not found' }, 404),
    )
    vi.stubGlobal('fetch', fetch)
    const source = ref([{ task_id: 1 }, { task_id: 1 }, { task_id: 2 }])
    const parent = defineComponent({
      components: { WorkLink },
      setup() {
        useWorkLabels(() => source.value)
        return {}
      },
      template: '<WorkLink :task-id="1"/><WorkLink :task-id="2"/>',
    })
    const wrapper = mount(parent, {
      global: { stubs: { RouterLink: { template: '<a><slot/></a>' } } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain(task.title)
    expect(wrapper.text()).toContain('Самостійна робота')
    source.value = [...source.value, { task_id: 1 }]
    await flushPromises()
    expect(fetch.mock.calls.map(([url]) => url)).toHaveLength(2)
    expect(wrapper.text()).not.toContain('№2')
  })
  it('shows the unchanged session honestly and keeps unplaced duration visible in minutes', () => {
    const wrapper = mount(StudyProposal, {
      props: {
        timezone: 'Europe/Kyiv',
        review: {
          session_results: [
            {
              task_id: 1,
              classification: 'valid',
              original: { starts_at: '2026-11-02T09:00:00Z', ends_at: '2026-11-02T09:30:00Z' },
              replacement: null,
              untransferred_seconds: 0,
            },
            {
              task_id: 1,
              classification: 'requires_replanning',
              original: { starts_at: '2026-11-02T10:00:00Z', ends_at: '2026-11-02T10:30:00Z' },
              replacement: null,
              untransferred_seconds: 1800,
            },
          ],
        },
      },
      global: { stubs: { RouterLink: { template: '<a><slot/></a>' } } },
    })
    const rows = wrapper.findAll('.proposal-row')
    expect(rows[0]!.text()).toContain('Час залишається без змін')
    expect(rows[1]!.text()).toContain('Новий час не запропоновано')
    expect(rows[1]!.text()).toContain('Без нового часу: 30 хв')
  })
  it('keeps both the hint and every validation error connected to the input', () => {
    const wrapper = mount(FormField, {
      props: {
        id: 'test',
        label: 'Дедлайн',
        hint: 'Місцевий час',
        errors: ['Перевірте дату', 'Укажіть час'],
      },
      slots: {
        default:
          '<template #default="f"><input :id="f.id" :aria-describedby="f.describedby" :aria-invalid="f.invalid" /></template>',
      },
    })
    expect(wrapper.get('input').attributes('aria-describedby')).toBe(
      'test-hint test-error-0 test-error-1',
    )
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
  })
  it('adds availability to the selected day and sends the canonical backend interval', async () => {
    const backend = planningBackend()
    const existing = { id: 10, day_of_week: 1, starts_at: '09:00:00', ends_at: '10:00:00' }
    backend.windows = [existing]
    const { wrapper } = await renderApp('/planning/availability', backend)
    await wrapper.get('[aria-label="Додати час: Середа"]').trigger('click')
    expect((wrapper.get('#availability-day').element as HTMLSelectElement).value).toBe('3')
    await wrapper.get('#availability-start').setValue('18:30:00')
    await wrapper.get('#availability-end').setValue('20:00')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((r) => r.method === 'POST')?.body).toEqual({
      day_of_week: 3,
      starts_at: '18:30:00',
      ends_at: '20:00:00',
    })
    expect(backend.windows).toContainEqual(existing)
  })
  it('previews the complete resulting date while preserving copy_base and replace request semantics', async () => {
    const backend = semesterBackend(),
      { wrapper } = await renderApp('/schedule/semesters/1/dates/2026-11-02', backend)
    expect(wrapper.get('[aria-label="Після збереження"]').text()).toContain('Семестрова математика')
    const cancel = wrapper.get('[aria-label="Прибрати пару 1"]')
    await cancel.trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const first = backend.requests.find((r) => r.method === 'PUT')!
    expect(first.body).toMatchObject({
      mode: 'copy_base',
      changes: [{ weekly_lesson_rule_id: 11, cancelled: true }],
    })
    expect(first.body).not.toHaveProperty('preview_token')
    expect(wrapper.text()).toContain('Після збереження')
  })
})
