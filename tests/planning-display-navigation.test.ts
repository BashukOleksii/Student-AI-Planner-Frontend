import { describe, expect, it } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import StudyProposal from '@/components/planning/StudyProposal.vue'
import { renderApp } from './helpers/renderApp'
import { planningBackend, sessionFixture } from './helpers/planningBackend'

async function click(wrapper: VueWrapper, text: string) {
  await wrapper
    .findAll('button')
    .find((b) => b.text() === text)!
    .trigger('click')
  await flushPromises()
}
const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    task_id: 1,
    subtask_id: null,
    starts_at: `2026-11-02T${String(i + 8).padStart(2, '0')}:00:00Z`,
    ends_at: `2026-11-02T${String(i + 8).padStart(2, '0')}:30:00Z`,
    duration_seconds: 1800,
  }))
describe('work time display pages', () => {
  it.each([0, 3, 5])(
    'shows compact chronological pages for %s sessions and resets on a new review',
    async (count) => {
      const review = {
        sessions: rows(count).reverse(),
        summary: { allocated_seconds: count * 1800 },
      }
      const wrapper = mount(StudyProposal, {
        props: { review, timezone: 'UTC' },
        global: { stubs: { WorkLink: true, RouterLink: true } },
      })
      expect(wrapper.findAll('.proposal-sessions .proposal-row')).toHaveLength(Math.min(count, 3))
      expect(wrapper.find('.pagination').exists()).toBe(count > 3)
      if (count > 3) {
        expect(wrapper.get('.pagination button').attributes('disabled')).toBeDefined()
        expect(wrapper.get('.proposal-sessions').text()).toContain('08:00')
        await click(wrapper, 'Наступна')
        expect(wrapper.findAll('.proposal-sessions .proposal-row')).toHaveLength(2)
        expect(wrapper.get('.proposal-sessions').text()).toContain('11:00')
        expect(wrapper.findAll('.pagination button')[1]!.attributes('disabled')).toBeDefined()
        expect(wrapper.get('.proposal-summary').text()).toContain('150 хв')
        await wrapper.setProps({ review: { ...review } })
        expect(wrapper.get('.pagination').text()).toContain('Сторінка 1 із 2')
      }
    },
  )
  it.each([1, 2])('confirms all sessions from display page %s', async (page) => {
    const backend = planningBackend()
    backend.plan = { ...backend.plan, sessions: rows(4) }
    const { wrapper } = await renderApp('/planning/preview', backend)
    await click(wrapper, 'Створити огляд')
    if (page === 2) await click(wrapper, 'Наступна')
    for (const checkbox of wrapper.findAll('input[type="checkbox"]')) await checkbox.setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.sessions).toHaveLength(4)
    expect(backend.requests.find((r) => r.path.endsWith('/study-plans/confirm'))?.body).toEqual({
      preview_token: backend.plan.preview_token,
      accept_partial: true,
    })
  })
})

describe('session return navigation', () => {
  it.each(['planned', 'completed'] as const)(
    'places one return link above session content for %s',
    async (status) => {
      const backend = planningBackend()
      backend.sessions = [{ ...sessionFixture(), status }]
      const { wrapper } = await renderApp('/planning/sessions/1', backend)
      expect(wrapper.findAll('.session-return a')).toHaveLength(1)
      expect(wrapper.get('.session-return a').attributes('href')).toBe('/planning/sessions')
      expect(wrapper.get('.session-overview').text().startsWith('Повернутися до сесій')).toBe(true)
      expect(wrapper.findAll('a').filter((a) => a.text() === 'Повернутися до сесій')).toHaveLength(
        1,
      )
      expect(wrapper.find('header .header-create').exists()).toBe(false)
    },
  )
  it.each(['miss', 'cancel', 'reschedule'] as const)(
    'returns with list context and fresh data only after saved %s',
    async (action) => {
      const backend = planningBackend()
      backend.sessions = [sessionFixture()]
      const path =
        '/planning/sessions?start_date=2026-11-01&end_date=2026-11-07&status=all&task_id=1'
      const { wrapper, router } = await renderApp(path, backend)
      await wrapper.get('.session-title').trigger('click')
      await flushPromises()
      expect(wrapper.get('.session-return a').attributes('href')).toBe(path)
      if (action === 'miss') await click(wrapper, 'Позначити пропущеною')
      if (action === 'cancel') {
        await click(wrapper, 'Скасувати сесію')
        expect(router.currentRoute.value.path).toBe('/planning/sessions/1')
        await click(wrapper, 'Підтвердити скасування')
      }
      if (action === 'reschedule') {
        await click(wrapper, 'Перенести сесію')
        expect(router.currentRoute.value.path).toBe('/planning/sessions/1')
        await wrapper.get('#session-start').setValue('2026-11-03T11:00:00')
        await wrapper.get('#session-end').setValue('2026-11-03T11:30:00')
        await wrapper.get('dialog form').trigger('submit')
        await flushPromises()
        expect(router.currentRoute.value.path).toBe('/planning/sessions/1')
        expect(backend.requests.some((r) => r.path.endsWith('/reschedule'))).toBe(false)
        await click(wrapper, 'Підтвердити перенесення')
      }
      expect(router.currentRoute.value.fullPath).toBe(path)
      expect(backend.requests.filter((r) => r.path === '/api/study-sessions')).toHaveLength(2)
      expect(wrapper.text()).not.toContain('Зміни збережено.')
      expect(wrapper.get('select').element.value).toBe('')
    },
  )
  it.each(['miss', 'cancel', 'reschedule'] as const)(
    'stays on detail after a failed %s',
    async (action) => {
      const backend = planningBackend()
      backend.sessions = [sessionFixture()]
      backend.failure = {
        path: new RegExp(action + '$'),
        method: 'POST',
        status: 422,
        fields: { session: ['Зміну відхилено.'] },
      }
      const { wrapper, router } = await renderApp('/planning/sessions/1', backend)
      if (action === 'miss') await click(wrapper, 'Позначити пропущеною')
      if (action === 'cancel') {
        await click(wrapper, 'Скасувати сесію')
        await click(wrapper, 'Підтвердити скасування')
      }
      if (action === 'reschedule') {
        await click(wrapper, 'Перенести сесію')
        await wrapper.get('#session-start').setValue('2026-11-03T11:00:00')
        await wrapper.get('#session-end').setValue('2026-11-03T11:30:00')
        await wrapper.get('dialog form').trigger('submit')
        await flushPromises()
        await click(wrapper, 'Підтвердити перенесення')
      }
      expect(router.currentRoute.value.path).toBe('/planning/sessions/1')
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    },
  )
})
