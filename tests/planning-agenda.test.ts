import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import PlanningView from '@/views/PlanningView.vue'
import { renderApp } from './helpers/renderApp'
import { planningBackend, sessionFixture } from './helpers/planningBackend'
import { today, addDays } from '@/utils/dates'
import * as dates from '@/utils/dates'
import type { StudySession } from '@/types/api'

function rows(count: number, date: string, offset = 0): StudySession[] {
  return Array.from({ length: count }, (_, i) => ({
    ...sessionFixture(offset + i + 1),
    starts_at: `${date}T${String(i + 6).padStart(2, '0')}:00:00Z`,
    ends_at: `${date}T${String(i + 6).padStart(2, '0')}:30:00Z`,
  }))
}
async function setup(a = 4, b = 7) {
  const backend = planningBackend()
  const date = today('Europe/Kyiv')
  backend.sessions = [...rows(a, date), ...rows(b, addDays(date, 1), 100)].reverse()
  const app = await renderApp<typeof backend>('/planning', backend)
  const cards = () => app.wrapper.findAll('.study-agenda > .card')
  const ids = (index: number) =>
    cards()
      [index]!.findAll('.session-title')
      .map((link) => link.attributes('href'))
  const next = async (index: number) => {
    await cards()
      [index]!.findAll('button')
      .find((button) => button.text() === 'Наступна')!
      .trigger('click')
    await flushPromises()
  }
  const reload = async () => {
    const view = app.wrapper.getComponent(PlanningView)
    await (view.vm as unknown as { sessions: { reload: () => Promise<void> } }).sessions.reload()
    await flushPromises()
  }
  return { ...app, backend, cards, ids, next, reload, date }
}

describe('planning home agenda', () => {
  it('keeps both page controls independent and sessions sorted, with boundary actions disabled', async () => {
    const { wrapper, cards, ids, next, backend, date } = await setup()
    expect(ids(0)).toEqual([1, 2, 3].map((id) => `/planning/sessions/${id}`))
    expect(ids(1)).toEqual([101, 102, 103].map((id) => `/planning/sessions/${id}`))
    expect(cards()[0]!.text()).toContain('Сторінка 1 із 2')
    expect(cards()[1]!.text()).toContain('Сторінка 1 із 3')
    expect(cards()[0]!.get('button').attributes('disabled')).toBeDefined()
    await next(1)
    await next(0)
    expect(ids(0)).toEqual(['/planning/sessions/4'])
    expect(ids(1)).toEqual([104, 105, 106].map((id) => `/planning/sessions/${id}`))
    expect(cards()[0]!.findAll('button')[1]!.attributes('disabled')).toBeDefined()
    await next(1)
    expect(ids(1)).toEqual(['/planning/sessions/107'])
    expect(cards()[1]!.findAll('button')[1]!.attributes('disabled')).toBeDefined()
    expect(backend.requests.filter((r) => r.path === '/api/study-sessions')).toHaveLength(1)
    const request = backend.requests.find((r) => r.path === '/api/study-sessions')!
    expect(JSON.stringify(request)).toContain(date)
    expect(wrapper.get('.page-heading a.primary').attributes('href')).toBe('/planning/preview')
    expect(wrapper.get('.page-heading a.secondary').attributes('href')).toBe('/ai')
    expect(wrapper.findAll('a').filter((a) => a.text() === 'Обговорити з AI')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Налаштувати навчання та змінити план')
    expect(wrapper.text()).toContain('Усі сесії та історія')
    expect(wrapper.find('.planning-shortcuts').exists()).toBe(true)
  })

  it('clamps to the last available page after reload, then handles empty lists', async () => {
    const { backend, cards, next, reload, ids, date } = await setup()
    await next(0)
    await next(1)
    await next(1)
    backend.sessions = [...rows(1, date), ...rows(4, addDays(date, 1), 100)]
    await reload()
    expect(ids(0)).toEqual(['/planning/sessions/1'])
    expect(cards()[0]!.find('nav.pagination').exists()).toBe(false)
    expect(cards()[1]!.text()).toContain('Сторінка 2 із 2')
    expect(ids(1)).toEqual(['/planning/sessions/104'])
    backend.sessions = []
    await reload()
    expect(cards().every((card) => !card.find('nav.pagination').exists())).toBe(true)
    expect(cards()[0]!.text()).toContain('На сьогодні самостійного навчання не заплановано')
    expect(cards()[1]!.text()).toContain('На інші дні цього тижня сесій немає')
  })

  it('filters statuses and uses the local date across UTC midnight', async () => {
    const { backend, reload, ids, date, cards } = await setup(0, 0)
    backend.sessions = [
      { ...sessionFixture(1), starts_at: `${addDays(date, -1)}T23:30:00Z` },
      { ...rows(1, date)[0]!, id: 2, status: 'completed' },
      { ...rows(1, date)[0]!, id: 3, status: 'cancelled' },
      ...rows(3, addDays(date, 1), 100),
    ]
    await reload()
    expect(ids(0)).toEqual(['/planning/sessions/1'])
    expect(ids(1)).toHaveLength(3)
    expect(cards().every((card) => !card.find('nav.pagination').exists())).toBe(true)
  })

  it('resets both pages when the local date range changes', async () => {
    const { auth, backend, next, cards, date } = await setup()
    await next(0)
    await next(1)
    const nextDate = addDays(date, 1)
    const clock = vi.spyOn(dates, 'today').mockReturnValue(nextDate)
    try {
      backend.sessions = [...rows(4, nextDate), ...rows(7, addDays(nextDate, 1), 100)]
      auth.user!.timezone = 'UTC'
      await flushPromises()
      expect(cards()[0]!.text()).toContain('Сторінка 1 із 2')
      expect(cards()[1]!.text()).toContain('Сторінка 1 із 3')
      const requests = backend.requests.filter((r) => r.path === '/api/study-sessions')
      expect(JSON.stringify(requests.at(-1))).toContain(nextDate)
    } finally {
      clock.mockRestore()
    }
  })
})
