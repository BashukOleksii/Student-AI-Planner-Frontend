import { expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { planningBackend, sessionFixture } from './helpers/planningBackend'
import { renderApp } from './helpers/renderApp'

it.each(['task', 'subtask'] as const)(
  'defaults to session only and labels optional %s completion',
  async (work_type) => {
    const backend = planningBackend()
  backend.sessions = [sessionFixture(1)]
    const original = backend.handle
    backend.handle = (url, method, body, headers) =>
      url.includes('/completion-review')
        ? {
            status: 200,
            body: {
              can_complete_work: true,
              work_type,
              completion_review: {
                future_sessions_count: 1,
                completion_token: 'exact',
                message: 'Ще 1 майбутня сесія',
              },
            },
          }
        : original(url, method, body, headers)
    const { wrapper } = await renderApp('/planning/sessions/1', backend)
    const checkbox = wrapper.get('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.text()).toContain(
      work_type === 'task'
        ? 'Також позначити завдання виконаним'
        : 'Також позначити підзавдання виконаним',
    )
    await wrapper.get('#actual-minutes').setValue('15')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((r) => r.path.endsWith('/complete'))?.body).toEqual({
      actual_minutes: 15,
    })
  },
)

it('reviews other sessions before one combined POST and does not repeat an unknown write', async () => {
  const backend = planningBackend()
  backend.sessions = [sessionFixture(1)]
  const original = backend.handle
  let posts = 0
  backend.handle = (url, method, body, headers) => {
    if (url.includes('/completion-review'))
      return {
        status: 200,
        body: {
          can_complete_work: true,
          work_type: 'subtask',
          completion_review: {
            future_sessions_count: 2,
            completion_token: 'exact',
            message: 'Ще 2 майбутні сесії',
          },
        },
      }
    if (url.endsWith('/complete')) {
      posts++
      expect(body).toEqual({ actual_minutes: 15, complete_work: true, completion_token: 'exact' })
      expect(window.confirm).toHaveBeenCalledWith('Ще 2 майбутні сесії')
      return { status: 503 }
    }
    return original(url, method, body, headers)
  }
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const { wrapper } = await renderApp('/planning/sessions/1', backend)
  await wrapper.get('input[type="checkbox"]').setValue(true)
  await wrapper.get('#actual-minutes').setValue('15')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(posts).toBe(1)
  expect(wrapper.text()).toContain('Запит не повторювався')
  expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
})
