import { expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { recoveryApi } from '@/api/recovery'
import { tasksApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { renderApp } from './helpers/renderApp'
import { recoveryCardsBackend } from './helpers/recoveryCardsBackend'

const banner = 'Не вдалося виконати дію. Спробуйте ще раз.'
const warning = 'Для частини роботи не вказано тривалість.'

it('opens with all HTTP 200 responses, focuses the inline heading and preserves the duration warning without an error', async () => {
  const backend = recoveryCardsBackend(1)
  backend.suggestions[0]!.review.unknown_duration_work = [{ task_id: 1 }]
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  const { wrapper, fetch } = await renderApp('/planning/suggestions', backend)
  await wrapper.get('#suggestion-toggle-card-0').trigger('click')
  await flushPromises()
  const detail = wrapper.get('.suggestion-details')
  expect(detail.text()).toContain(warning)
  expect(focus.mock.instances).toContain(detail.get('h2').element)
  expect(wrapper.find('.error-state').exists()).toBe(false)
  expect(wrapper.text()).not.toContain(banner)
  const responses = await Promise.all(fetch.mock.results.map((result) => result.value))
  expect(responses.every((response) => response.status === 200)).toBe(true)
  expect(backend.requests.every((request) => request.method === 'GET')).toBe(true)
  focus.mockRestore()
})

it.each([503, 200])(
  'shows a genuine detail failure beside its own card (HTTP %s), with a working retry',
  async (status) => {
    const backend = recoveryCardsBackend(2)
    let fail = true
    const mock = {
      handle(url: string, method = 'GET', body = {}) {
        if (new URL(url).pathname.endsWith('/card-0') && fail) return { status, body: {} }
        return backend.handle(url, method, body)
      },
    }
    const { wrapper } = await renderApp('/planning/suggestions', mock)
    await wrapper.get('#suggestion-toggle-card-0').trigger('click')
    await flushPromises()
    const cards = wrapper.findAll('.suggestion-card')
    expect(cards[0]!.get('.error-state').text()).toContain(
      status === 503 ? 'Сервіс тимчасово недоступний' : 'Сервер тимчасово недоступний',
    )
    expect(cards[1]!.find('.error-state').exists()).toBe(false)
    expect(wrapper.find('.suggestion-details').exists()).toBe(false)
    fail = false
    await cards[0]!.get('.error-state button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.suggestion-details').exists()).toBe(true)
    expect(wrapper.find('.error-state').exists()).toBe(false)
  },
)

it('does not promote an auxiliary work-label failure into an error opening the review', async () => {
  const backend = recoveryCardsBackend(1)
  backend.suggestions[0]!.review.unknown_duration_work = [{ task_id: 1 }]
  const getTask = vi.spyOn(tasksApi, 'get').mockRejectedValue(new ApiError(503))
  try {
    const { wrapper } = await renderApp('/planning/suggestions/card-0', backend)
    expect(getTask).toHaveBeenCalled()
    expect(wrapper.get('.suggestion-details').text()).toContain(warning)
    expect(wrapper.find('.error-state').exists()).toBe(false)
  } finally {
    getTask.mockRestore()
  }
})

it('keeps a real action error in its review and clears it on a successful switch or collapse', async () => {
  const backend = recoveryCardsBackend(2)
  const { wrapper, router } = await renderApp('/planning/suggestions/card-0', backend)
  await wrapper
    .findAll('.suggestion-details button')
    .find((button) => button.text() === 'Відхилити')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.get('.suggestion-details .error-state').text()).toContain('Дані змінилися')
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  await router.push('/planning/suggestions/card-1')
  await flushPromises()
  expect(wrapper.find('.error-state').exists()).toBe(false)
  expect(focus.mock.instances).toContain(wrapper.get('#suggestion-detail-card-1 h2').element)
  focus.mockRestore()
  await router.push('/planning/suggestions')
  await flushPromises()
  expect(wrapper.find('.error-state').exists()).toBe(false)
})

it.each(['switch', 'collapse'] as const)('ignores a late detail failure after %s', async (mode) => {
  const backend = recoveryCardsBackend(2)
  let reject: ((reason: unknown) => void) | undefined
  const normalGet = recoveryApi.get.bind(recoveryApi)
  const get = vi.spyOn(recoveryApi, 'get').mockImplementation((id, signal) =>
    id === 'card-0'
      ? new Promise((_resolve, fail) => {
          reject = fail
        })
      : normalGet(id, signal),
  )
  try {
    const { wrapper, router } = await renderApp('/planning/suggestions', backend)
    await wrapper.get('#suggestion-toggle-card-0').trigger('click')
    await flushPromises()
    expect(reject).toBeDefined()
    await router.push(mode === 'switch' ? '/planning/suggestions/card-1' : '/planning/suggestions')
    await flushPromises()
    reject!(new ApiError(503))
    await flushPromises()
    expect(wrapper.find('.error-state').exists()).toBe(false)
    expect(wrapper.find('.suggestion-details').exists()).toBe(mode === 'switch')
  } finally {
    get.mockRestore()
  }
})

it('does not reopen or focus a collapsed card when its successful response arrives late', async () => {
  const backend = recoveryCardsBackend(1)
  let resolve: ((value: { data: (typeof backend.suggestions)[0] }) => void) | undefined
  const get = vi.spyOn(recoveryApi, 'get').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  try {
    const { wrapper, router } = await renderApp('/planning/suggestions', backend)
    await wrapper.get('#suggestion-toggle-card-0').trigger('click')
    await flushPromises()
    await router.push('/planning/suggestions')
    await flushPromises()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    try {
      resolve!({ data: backend.suggestions[0]! })
      await flushPromises()
      expect(wrapper.find('.suggestion-details').exists()).toBe(false)
      expect(wrapper.find('.error-state').exists()).toBe(false)
      expect(focus).not.toHaveBeenCalled()
    } finally {
      focus.mockRestore()
    }
  } finally {
    get.mockRestore()
  }
})

it('shows a failed direct/off-page detail request even when its summary is absent from the feed', async () => {
  const backend = recoveryCardsBackend(1)
  const mock = {
    handle(url: string, method = 'GET', body = {}) {
      if (new URL(url).pathname.endsWith('/off-page')) return { status: 404, body: {} }
      return backend.handle(url, method, body)
    },
  }
  const { wrapper, router } = await renderApp('/planning/suggestions/off-page', mock)
  expect(wrapper.get('.suggestion-card .error-state').text()).toContain('Запис недоступний')
  await router.push('/planning/suggestions/card-0')
  await flushPromises()
  expect(wrapper.find('.error-state').exists()).toBe(false)
  expect(wrapper.find('.suggestion-details').exists()).toBe(true)
})

it('ignores a late action failure after opening another card', async () => {
  const backend = recoveryCardsBackend(2)
  let reject: ((reason: unknown) => void) | undefined
  const action = vi.spyOn(recoveryApi, 'reject').mockImplementation(
    () =>
      new Promise((_done, fail) => {
        reject = fail
      }),
  )
  try {
    const { wrapper, router } = await renderApp('/planning/suggestions/card-0', backend)
    await wrapper
      .findAll('.suggestion-details button')
      .find((button) => button.text() === 'Відхилити')!
      .trigger('click')
    await flushPromises()
    await router.push('/planning/suggestions/card-1')
    await flushPromises()
    reject!(new ApiError(503))
    await flushPromises()
    expect(wrapper.find('.error-state').exists()).toBe(false)
    expect(wrapper.find('#suggestion-detail-card-1').exists()).toBe(true)
  } finally {
    action.mockRestore()
  }
})
