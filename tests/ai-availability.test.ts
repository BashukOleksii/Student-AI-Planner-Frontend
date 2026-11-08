import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AiActionReview from '@/components/ai/AiActionReview.vue'
import {
  actionTypes,
  availabilityActionTypes,
  type AiAction,
  type AvailabilityPreview,
} from '@/types/ai'
import {
  actionLabels,
  toolLabels,
  reviewSupported,
  consentFields,
  receiptSessionIds,
} from '@/utils/ai'
import {
  availabilityPreview,
  availabilityReceipt,
  isAvailabilityAction,
} from '@/utils/aiAvailability'
import { aiApi } from '@/api/ai'
import { refreshAiDomains } from '@/api/aiRefresh'
import { ApiError } from '@/api/client'
import { weekdays } from '@/utils/planning'
import {
  availabilityActionFixture,
  availabilityReceiptFixture,
} from './helpers/aiAvailabilityFixtures'
import { actionFixture } from './helpers/aiBackend'
import { aiAvailabilityBackend } from './helpers/aiAvailabilityBackend'
import { json } from './fixtures'

async function component(action: AiAction) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/')
  return mount(AiActionReview, {
    props: {
      action,
      timezone: 'Pacific/Honolulu',
      consent: {},
      busy: false,
      blocked: false,
      needsProposal: false,
      uncertain: false,
      error: null,
      notice: '',
      domainError: null,
      domainBusy: false,
    },
    global: { plugins: [router] },
  })
}
function setup() {
  const backend = aiAvailabilityBackend()
  backend.ai.addConversation()
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const result = backend.handle(
      url,
      init.method,
      init.body ? JSON.parse(String(init.body)) : {},
      init.headers,
    )
    return result.status === 204
      ? new Response(null, { status: 204 })
      : json(result.body, result.status)
  })
  vi.stubGlobal('fetch', fetch)
  return { backend, fetch }
}

describe('Availability public review validation', () => {
  it('supports all 21 proposals and all 10 reads while preserving earlier reviews', () => {
    expect(new Set(actionTypes).size).toBe(21)
    expect(Object.keys(toolLabels)).toHaveLength(31)
    for (const type of actionTypes) expect(reviewSupported(actionFixture(type))).toBe(true)
    expect(availabilityActionTypes.map((type) => actionLabels[type])).toEqual([
      'Створити інтервал доступності',
      'Змінити інтервал доступності',
      'Видалити інтервал доступності',
    ])
    expect(toolLabels.list_study_availability_windows).toBe('Перегляд навчальної доступності')
    const unknown = { ...availabilityActionFixture(), type: 'propose_availability_bulk_delete' }
    expect(reviewSupported(unknown)).toBe(false)
    expect(isAvailabilityAction(unknown.type)).toBe(false)
    expect(availabilityPreview(unknown.preview, unknown.type)).toBeNull()
  })
  it.each(availabilityActionTypes)(
    'accepts exact %s semantics with no planning consent',
    (type) => {
      const action = availabilityActionFixture(type)
      expect(reviewSupported(action)).toBe(true)
      expect(consentFields(action)).toEqual([])
      expect(
        availabilityReceipt(availabilityReceiptFixture(action), type, action.id),
      ).not.toBeNull()
      expect(reviewSupported({ ...action, confirmation_required: false })).toBe(false)
    },
  )
  it.each([undefined, null, '', '   ', 123, false])(
    'rejects missing/invalid timezone %s',
    (timezone) => {
      const action = availabilityActionFixture()
      action.preview.timezone = timezone as never
      expect(reviewSupported(action)).toBe(false)
      const receipt = availabilityReceiptFixture(availabilityActionFixture())
      expect(availabilityReceipt({ ...receipt, timezone }, action.type, action.id)).toBeNull()
    },
  )
  it.each([0, 8, 1.5, '1', null, undefined, true])('rejects invalid weekday %s', (day_of_week) => {
    const action = availabilityActionFixture()
    Object.assign(action.preview.after!, { day_of_week })
    expect(reviewSupported(action)).toBe(false)
  })
  it.each([0, -1, 1.5, '12', undefined, true, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid persisted ID %s',
    (id) => {
      const action = availabilityActionFixture('propose_availability_delete')
      Object.assign(action.preview.before!, { id })
      expect(reviewSupported(action)).toBe(false)
    },
  )
  it.each([
    '9:00:00',
    '09:00',
    '09:00:60',
    '24:00:01',
    '25:00:00',
    '09:00:00Z',
    '09:00:00.1',
    ' 09:00:00',
    '2026-11-08T09:00:00Z',
    null,
    undefined,
    900,
  ])('rejects invalid local clock %s', (clock) => {
    for (const key of ['starts_at', 'ends_at']) {
      const action = availabilityActionFixture()
      Object.assign(action.preview.after!, { [key]: clock })
      expect(reviewSupported(action)).toBe(false)
    }
  })
  it('allows 24:00:00 only as end; validates complete material, null/identity and confirmation semantics', () => {
    const edits: ((p: AvailabilityPreview) => void)[] = [
      (p) => {
        p.after!.starts_at = '24:00:00'
      },
      (p) => {
        Reflect.deleteProperty(p, 'before')
      },
      (p) => {
        Reflect.deleteProperty(p.after!, 'ends_at')
      },
      (p) => {
        p.after!.id = 12
      },
      (p) => {
        p.before = { id: 12, day_of_week: 1, starts_at: '09:00:00', ends_at: '10:00:00' }
      },
      (p) => {
        p.after = null
      },
      (p) => {
        Object.assign(p, { confirmation_required: false })
      },
      (p) => {
        Object.assign(p, { type: 'propose_availability_delete' })
      },
      (p) => {
        Object.assign(p, { required_consent: ['accept_partial'] })
      },
      (p) => {
        Object.assign(p, { required_consent: null })
      },
      (p) => {
        Object.assign(p.after!, { extra_material: true })
      },
    ]
    for (const edit of edits) {
      const action = availabilityActionFixture()
      edit(action.preview as AvailabilityPreview)
      expect(reviewSupported(action)).toBe(false)
    }
    for (const type of ['propose_availability_update', 'propose_availability_delete'] as const) {
      for (const before of [
        null,
        {},
        { ...(availabilityActionFixture(type).preview.before as object), id: null },
      ]) {
        const action = availabilityActionFixture(type)
        Object.assign(action.preview, { before })
        expect(reviewSupported(action)).toBe(false)
      }
    }
    const updated = availabilityActionFixture('propose_availability_update')
    Object.assign(updated.preview.after!, { id: 99 })
    expect(reviewSupported(updated)).toBe(false)
    Object.assign(updated.preview.after!, { id: 12 })
    updated.preview.after = structuredClone(updated.preview.before!)
    expect(reviewSupported(updated)).toBe(true) // Backend permits explicit no-op updates.
    const removed = availabilityActionFixture('propose_availability_delete')
    removed.preview.after = structuredClone(removed.preview.before!)
    expect(reviewSupported(removed)).toBe(false)
  })
  it.each(availabilityActionTypes)('validates every documented effect of %s', (type) => {
    const action = availabilityActionFixture(type)
    for (const [key, value] of Object.entries(action.preview.effects!)) {
      for (const wrong of [undefined, null, !value, String(value), 0]) {
        const bad = structuredClone(action)
        Object.assign(bad.preview.effects!, { [key]: wrong })
        expect(reviewSupported(bad)).toBe(false)
        const receipt = availabilityReceiptFixture(action)
        expect(
          availabilityReceipt(
            { ...receipt, effects: { ...receipt.effects, [key]: wrong } },
            type,
            action.id,
          ),
        ).toBeNull()
      }
    }
    const bad = structuredClone(action)
    Object.assign(bad.preview.effects!, { deletes_all: false })
    expect(reviewSupported(bad)).toBe(false)
    bad.preview.effects = []
    expect(reviewSupported(bad)).toBe(false)
  })
  it('validates receipt UUID/type, persisted ID and exact null semantics', () => {
    for (const type of availabilityActionTypes) {
      const action = availabilityActionFixture(type),
        receipt = availabilityReceiptFixture(action)
      for (const patch of [
        { action_id: crypto.randomUUID() },
        { type: 'propose_task_create' },
        { window: undefined },
        { deleted_window: undefined },
        { window: null, deleted_window: null },
      ])
        expect(availabilityReceipt({ ...receipt, ...patch }, type, action.id)).toBeNull()
      const key = type === 'propose_availability_delete' ? 'deleted_window' : 'window'
      expect(
        availabilityReceipt({ ...receipt, [key]: { ...receipt[key], id: null } }, type, action.id),
      ).toBeNull()
    }
  })
})

describe('Availability exact review and historical receipt presentation', () => {
  it.each(availabilityActionTypes)(
    'renders %s with stored timezone and local seconds; no mutation on render',
    async (type) => {
      const action = availabilityActionFixture(type),
        wrapper = await component(action)
      const review = wrapper.get('.ai-availability-review')
      expect(review.text()).toContain('Europe/Kyiv')
      expect(review.text()).not.toContain('Pacific/Honolulu')
      expect(review.text()).toContain('Понеділок (1)')
      expect(review.text()).toContain('потребує явного підтвердження')
      expect(review.text()).toContain('не переплановуються')
      expect(review.text()).toContain('числові вподобання планування не змінюються')
      if (type === 'propose_availability_create')
        expect(review.text()).toContain('ID буде призначено після збереження')
      if (type !== 'propose_availability_delete') {
        expect(review.text()).toContain('20:00:03')
        expect(review.text()).toContain('24:00:00')
      }
      if (type !== 'propose_availability_create') {
        expect(review.text()).toContain('№12')
        expect(review.text()).toContain('16:00:01')
        expect(review.text()).toContain('20:00:02')
      }
      if (type === 'propose_availability_update') {
        expect(review.findAll('.ai-field-changed')).toHaveLength(2)
        expect(review.text()).toContain('Без змін')
      }
      if (type === 'propose_availability_delete')
        expect(review.text()).toContain('лише один запис конфігурації')
      expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
      expect(wrapper.emitted('decision')).toBeUndefined()
      wrapper.unmount()
    },
  )
  it.each(weekdays)('renders ISO weekday %s without date conversion', async (label) => {
    const action = availabilityActionFixture()
    Object.assign(action.preview.after!, { day_of_week: weekdays.indexOf(label) + 1 })
    const wrapper = await component(action)
    expect(wrapper.get('.ai-availability-review').text()).toContain(label)
    wrapper.unmount()
  })
  it('escapes invalid/unknown material, blocks confirmation and permits rejection', async () => {
    const action = availabilityActionFixture()
    Object.assign(action.preview.after!, { starts_at: '<img src=x onerror=alert(1)>' })
    const wrapper = await component(action)
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Підтвердити зміни')!
        .attributes('disabled'),
    ).toBeDefined()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Відхилити пропозицію')!
      .trigger('click')
    expect(wrapper.emitted('decision')).toEqual([['reject']])
  })
  it.each(availabilityActionTypes)(
    'renders historical %s receipt and availability link despite read failure',
    async (type) => {
      const action = availabilityActionFixture(type)
      Object.assign(action, {
        status: 'executed',
        state: 'executed',
        confirmation_required: false,
        receipt: availabilityReceiptFixture(action),
      })
      const wrapper = await component(action)
      await wrapper.setProps({ domainError: new ApiError(503) })
      const receipt = wrapper.get('.ai-receipt')
      expect(receipt.text()).toContain('Europe/Kyiv')
      expect(receipt.text()).not.toContain('Pacific/Honolulu')
      expect(receipt.text()).toContain(
        type === 'propose_availability_delete' ? 'Видалений інтервал' : 'Збережений інтервал',
      )
      expect(receipt.text()).toContain(type === 'propose_availability_create' ? '№13' : '№12')
      expect(receipt.find('a[href="/planning/availability"]').exists()).toBe(true)
      expect(receipt.find('a[href^="/tasks"]').exists()).toBe(false)
      expect(receipt.find('a[href^="/schedule"]').exists()).toBe(false)
      expect(receipt.find('a[href^="/planning/sessions"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Дію виконано, але')
      expect(receiptSessionIds(action.receipt)).toEqual([])
      expect(wrapper.findAll('button').some((b) => b.text() === 'Підтвердити зміни')).toBe(false)
    },
  )
  it.each(['expired', 'rejected'] as const)('does not present %s as executed', async (status) => {
    const action = availabilityActionFixture()
    Object.assign(action, { status, state: status, confirmation_required: false })
    const wrapper = await component(action)
    expect(wrapper.find('.ai-receipt').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})

describe('Availability decisions and read refresh contract', () => {
  it.each(availabilityActionTypes)(
    'uses exact {} decisions for %s, CSRF and replay; historical receipt survives later reads',
    async (type) => {
      const { backend, fetch } = setup(),
        action = availabilityActionFixture(type)
      backend.ai.actions.push(action)
      document.cookie = 'XSRF-TOKEN=availability%2Bcsrf'
      await aiApi.action(1, action.id)
      expect(backend.executions).toBe(0)
      const result = await aiApi.decide(1, action.id, 'confirm')
      const receipt = structuredClone(result.data.receipt)
      expect(result.data.receipt).toEqual(availabilityReceiptFixture(action))
      expect((await aiApi.decide(1, action.id, 'confirm')).replayed).toBe(true)
      expect(backend.executions).toBe(1)
      const second = availabilityActionFixture(type, 2)
      backend.ai.actions.push(second)
      expect((await aiApi.decide(1, second.id, 'reject')).data.status).toBe('rejected')
      const writes = fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST')
      expect(writes).toHaveLength(3)
      for (const [, options] of writes) {
        expect(options!.body).toBe('{}')
        expect(options!.credentials).toBe('include')
        expect(new Headers(options!.headers).get('X-XSRF-TOKEN')).toBe('availability+csrf')
      }
      backend.windows.clear()
      const controller = new AbortController()
      await refreshAiDomains(result.data, 'Pacific/Honolulu', controller.signal)
      expect(fetch.mock.calls.at(-1)![0]).toMatch(/\/api\/study-availability-windows$/)
      expect(fetch.mock.calls.at(-1)![1]!.signal).toBe(controller.signal)
      expect(result.data.receipt).toEqual(receipt)
      expect(backend.requests.filter((r) => !r.path.startsWith('/api/ai/'))).toEqual([
        { path: '/api/study-availability-windows', method: 'GET', body: {} },
      ])
    },
  )
  it('requires verified executed receipt for refresh; pending reads occur only for explicit stale inspection', async () => {
    const { backend } = setup(),
      action = availabilityActionFixture()
    await refreshAiDomains(action, 'UTC')
    expect(backend.requests).toEqual([])
    await refreshAiDomains(action, 'UTC', undefined, true)
    expect(backend.requests).toHaveLength(1)
    await expect(
      refreshAiDomains({ ...action, status: 'executed', receipt: {} }, 'UTC'),
    ).rejects.toMatchObject({ status: 502 })
    expect(backend.requests).toHaveLength(1)
  })
  it('blocks malformed or foreign executed receipts at the API boundary', async () => {
    const action = availabilityActionFixture()
    Object.assign(action, {
      status: 'executed',
      state: 'executed',
      confirmation_required: false,
      receipt: { ...availabilityReceiptFixture(action), action_id: crypto.randomUUID() },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: action, replayed: false })))
    await expect(aiApi.action(1, action.id)).rejects.toMatchObject({ status: 502 })
    await expect(aiApi.decide(1, action.id, 'confirm')).rejects.toMatchObject({ status: 502 })
  })
})
