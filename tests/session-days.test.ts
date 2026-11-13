import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { planningBackend, sessionFixture } from './helpers/planningBackend'
import { today, addDays, calendarLabel } from '@/utils/dates'
import type { StudySession } from '@/types/api'

const date = today('Europe/Kyiv')
function session(id: number, day: number, status: StudySession['status'] = 'planned', hour = '09') {
  return {
    ...sessionFixture(id),
    status,
    starts_at: `${addDays(date, day)}T${hour}:00:00Z`,
    ends_at: `${addDays(date, day)}T${hour}:30:00Z`,
  }
}
async function setup(sessions: StudySession[], query = '') {
  const backend = planningBackend()
  backend.sessions = sessions
  const app = await renderApp('/planning/sessions' + query, backend)
  const ids = () =>
    app.wrapper.findAll('.agenda-day .session-title').map((a) => a.attributes('href'))
  const click = async (text: string) => {
    await app.wrapper
      .findAll('button')
      .find((b) => b.text() === text)!
      .trigger('click')
    await flushPromises()
  }
  const heading = () => app.wrapper.get('.agenda-day h2').text()
  const filter = async (status: string) => {
    await app.wrapper.get('.session-status-field select').setValue(status)
    await flushPromises()
  }
  const search = async () => {
    await app.wrapper.get('form').trigger('submit')
    await flushPromises()
  }
  return { ...app, backend, ids, click, heading, filter, search }
}

describe('session day navigation', () => {
  it('starts at today and visits only populated days, sorting all sessions within a day', async () => {
    const app = await setup([
      session(5, 5),
      session(3, 2),
      session(1, -2),
      session(4, 0, 'planned', '11'),
      session(2, 0),
    ])
    expect(app.wrapper.findAll('.agenda-day')).toHaveLength(1)
    expect(app.heading()).toBe(calendarLabel(date))
    expect(app.ids()).toEqual(['/planning/sessions/2', '/planning/sessions/4'])
    await app.click('Попередній день')
    expect(app.heading()).toBe(calendarLabel(addDays(date, -2)))
    expect(app.wrapper.get('nav.pagination button').attributes('disabled')).toBeDefined()
    await app.click('Наступний день')
    await app.click('Наступний день')
    expect(app.ids()).toEqual(['/planning/sessions/3'])
    await app.click('Наступний день')
    expect(app.heading()).toBe(calendarLabel(addDays(date, 5)))
    expect(app.wrapper.findAll('nav.pagination button')[1]!.attributes('disabled')).toBeDefined()
    expect(app.backend.requests.filter((r) => r.path === '/api/study-sessions')).toHaveLength(1)
  })

  it('retains an available day through status changes and otherwise selects today or the earliest day', async () => {
    const app = await setup([
      session(1, -2, 'missed'),
      session(2, 0, 'completed'),
      session(3, 2),
      session(4, 2, 'completed'),
    ])
    await app.filter('')
    await app.click('Наступний день')
    await app.filter('planned')
    expect(app.ids()).toEqual(['/planning/sessions/3'])
    expect(app.wrapper.find('nav.pagination').exists()).toBe(false)
    await app.filter('completed')
    expect(app.ids()).toEqual(['/planning/sessions/4'])
    await app.filter('missed')
    expect(app.ids()).toEqual(['/planning/sessions/1'])
    await app.filter('completed')
    expect(app.ids()).toEqual(['/planning/sessions/2'])
  })

  it('preserves the open date on period reload, then falls back when it disappears', async () => {
    const app = await setup([session(1, 0), session(2, 2), session(3, 5)])
    await app.click('Наступний день')
    const inputs = app.wrapper.findAll<HTMLInputElement>('input[type="date"]')
    await inputs[1]!.setValue(addDays(date, 7))
    await app.search()
    expect(app.ids()).toEqual(['/planning/sessions/2'])
    app.backend.sessions = [session(1, 0), session(3, 5)]
    await app.search()
    expect(app.ids()).toEqual(['/planning/sessions/1'])
    app.backend.sessions = [session(3, 5), session(4, 3)]
    await app.search()
    expect(app.ids()).toEqual(['/planning/sessions/4'])
  })

  it('shows an empty state without a day card or navigation and honors task filtering', async () => {
    const app = await setup([session(1, 0)])
    await app.filter('cancelled')
    expect(app.wrapper.text()).toContain('Сесій у цьому періоді немає')
    expect(app.wrapper.find('.agenda-day').exists()).toBe(false)
    expect(app.wrapper.find('nav.pagination').exists()).toBe(false)
    await app.filter('')
    expect(app.ids()).toEqual(['/planning/sessions/1'])
    await app.router.push('/planning/sessions?task_id=999')
    await flushPromises()
    expect(app.wrapper.find('.agenda-day').exists()).toBe(false)
    expect(app.wrapper.text()).toContain('Сесій у цьому періоді немає')
  })

  it('groups by API timezone across UTC midnight and shows every session in the day', async () => {
    const app = await setup([
      ...Array.from({ length: 5 }, (_, i) => session(i + 1, 0)),
      { ...session(6, -1), starts_at: `${addDays(date, -1)}T23:30:00Z` },
    ])
    expect(app.ids()).toHaveLength(6)
    expect(app.ids()[0]).toBe('/planning/sessions/6')
    expect(app.wrapper.find('nav.pagination').exists()).toBe(false)
  })
})

describe('session status defaults', () => {
  it('hides history by default and restores it on explicit request without changing after reload', async () => {
    const app = await setup([
      session(1, 0),
      session(2, 0, 'rescheduled'),
      session(3, 0, 'completed'),
    ])
    const selected = () => (app.wrapper.get('select').element as HTMLSelectElement).value
    expect(selected()).toBe('planned')
    expect(app.ids()).toEqual(['/planning/sessions/1'])
    await app.click('Показати всі стани')
    expect(selected()).toBe('')
    expect(app.ids()).toHaveLength(3)
    await app.search()
    expect(selected()).toBe('')
    expect(app.ids()).toHaveLength(3)
  })

  it('keeps planned selected when empty and explains how to see history', async () => {
    const app = await setup([session(1, 0, 'completed')])
    expect(app.wrapper.text()).toContain('Запланованих сесій у цьому періоді немає')
    expect(app.wrapper.find('.agenda-day').exists()).toBe(false)
    await app.search()
    expect((app.wrapper.get('select').element as HTMLSelectElement).value).toBe('planned')
    await app.click('Показати всі стани')
    expect(app.ids()).toEqual(['/planning/sessions/1'])
  })

  it.each(['completed', 'missed', 'cancelled', 'rescheduled', 'planned', 'all', ''])(
    'respects explicit supported status %s',
    async (status) => {
      const app = await setup([session(1, 0, 'completed'), session(2, 0)], '?status=' + status)
      expect((app.wrapper.get('select').element as HTMLSelectElement).value).toBe(
        status === 'all' ? '' : status,
      )
    },
  )

  it('defaults safely for unsupported query and skips days containing only history', async () => {
    const app = await setup(
      [session(1, 0), session(2, 1, 'completed'), session(3, 3)],
      '?status=invalid',
    )
    await app.click('Наступний день')
    expect(app.ids()).toEqual(['/planning/sessions/3'])
    await app.filter('completed')
    await app.search()
    expect((app.wrapper.get('select').element as HTMLSelectElement).value).toBe('completed')
    expect(app.ids()).toEqual(['/planning/sessions/2'])
  })
})
