import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AiActionReview from '@/components/ai/AiActionReview.vue'
import {
  lessonActionTypes,
  actionTypes,
  type AiAction,
  type LessonActionType,
  type LessonPreview,
} from '@/types/ai'
import {
  actionLabels,
  toolLabels,
  reviewSupported,
  receiptSessionIds,
  consentFields,
} from '@/utils/ai'
import { lessonPreview, lessonReceipt, samePublicValue } from '@/utils/aiLesson'
import { refreshAiDomains } from '@/api/aiRefresh'
import { aiApi } from '@/api/ai'
import { ApiError } from '@/api/client'
import {
  lessonActionFixture,
  lessonReceiptFixture,
  lessonSnapshot,
} from './helpers/aiLessonFixtures'
import { aiLessonBackend } from './helpers/aiLessonBackend'
import { json } from './fixtures'

function reviewed(
  type: LessonActionType = lessonActionTypes[0],
  edit?: (preview: LessonPreview) => void,
) {
  const action = lessonActionFixture(type)
  edit?.(action.preview as LessonPreview)
  return action
}
function setup() {
  const backend = aiLessonBackend()
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
async function component(action: AiAction) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/')
  const wrapper = mount(AiActionReview, {
    props: {
      action,
      timezone: 'Europe/Kyiv',
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
  return wrapper
}
describe('Lesson public review boundary', () => {
  it('matches the current Frontend action and tool allowlist', () => {
    expect(new Set(actionTypes).size).toBe(33)
    expect(Object.keys(toolLabels)).toHaveLength(50)
  })

  it.each(lessonActionTypes)(
    'accepts complete %s with independent immutable confirmation flag and no consent',
    (type) => {
      const action = reviewed(type)
      expect(reviewSupported(action)).toBe(true)
      expect(consentFields(action)).toEqual([])
      expect(actionLabels[type]).toMatch(/заняття/)
      for (const status of ['rejected', 'expired', 'executed'] as const)
        expect(
          reviewSupported({ ...action, status, state: status, confirmation_required: false }),
        ).toBe(true)
    },
  )
  it('accepts nullable references, inactive update, cancelled replacement and historical replacement ID reuse', () => {
    const updated = reviewed('propose_lesson_update', (p) => {
      p.before!.status = 'replaced'
      p.after.status = 'replaced'
      p.before!.replacement_id = 20
      p.after.replacement_id = 20
    })
    expect(reviewSupported(updated)).toBe(true)
    const cancellation = reviewed('propose_lesson_cancel', (p) => {
      for (const s of [p.before!, p.after]) {
        s.replaces_lesson_id = 5
        s.subject_id = null
        s.subject = null
        s.teacher_id = null
        s.teacher = null
        s.academic_period_id = null
        s.academic_period = null
        s.room = null
      }
    })
    expect(reviewSupported(cancellation)).toBe(true)
    const reused = reviewed('propose_lesson_replacement', (p) => {
      p.after.id = 22
    })
    expect(reviewSupported(reused)).toBe(true)
    expect(lessonReceipt(lessonReceiptFixture(reused), reused.type, reused.id)?.lesson.id).toBe(22)
  })
  it.each([
    [
      'wrong discriminator',
      (p: LessonPreview) => {
        p.type = 'propose_lesson_cancel'
      },
    ],
    [
      'confirmation flag',
      (p: LessonPreview) => {
        Object.assign(p, { confirmation_required: false })
      },
    ],
    [
      'missing field',
      (p: LessonPreview) => {
        Reflect.deleteProperty(p.after, 'room')
      },
    ],
    [
      'missing reference',
      (p: LessonPreview) => {
        Reflect.deleteProperty(p.after, 'teacher')
      },
    ],
    [
      'reference identity',
      (p: LessonPreview) => {
        p.after.subject!.id = 99
      },
    ],
    [
      'null mismatch',
      (p: LessonPreview) => {
        p.after.teacher_id = 8
      },
    ],
    [
      'unknown Lesson type',
      (p: LessonPreview) => {
        Object.assign(p.after, { type: 'unknown' })
      },
    ],
    [
      'unknown state',
      (p: LessonPreview) => {
        Object.assign(p.after, { status: 'pending' })
      },
    ],
    [
      'invalid calendar',
      (p: LessonPreview) => {
        p.after.starts_at = '2026-02-30T07:00:00Z'
      },
    ],
    [
      'offset',
      (p: LessonPreview) => {
        p.after.starts_at = '2026-11-12T07:00:00+00:00'
      },
    ],
    [
      'fraction',
      (p: LessonPreview) => {
        p.after.starts_at = '2026-11-12T07:00:00.000Z'
      },
    ],
    [
      'equal interval',
      (p: LessonPreview) => {
        p.after.ends_at = p.after.starts_at
      },
    ],
    [
      'ID string',
      (p: LessonPreview) => {
        Object.assign(p.after, { subject_id: '7' })
      },
    ],
    [
      'missing material effects',
      (p: LessonPreview) => {
        Reflect.deleteProperty(p.effects, 'restores_original')
      },
    ],
    [
      'wrong side effect',
      (p: LessonPreview) => {
        Object.assign(p.effects, { study_sessions_rescheduled: true })
      },
    ],
    [
      'unknown side effect',
      (p: LessonPreview) => {
        Object.assign(p.effects, { delete_original: true })
      },
    ],
    [
      'array side effects',
      (p: LessonPreview) => {
        Object.assign(p, { effects: ['changed'] })
      },
    ],
    [
      'planning consent',
      (p: LessonPreview) => {
        Object.assign(p, { required_consent: ['accept_partial'] })
      },
    ],
    [
      'create before',
      (p: LessonPreview) => {
        p.before = lessonSnapshot()
      },
    ],
    [
      'create persisted ID',
      (p: LessonPreview) => {
        p.after.id = 20
      },
    ],
  ])('blocks %s', (_name, edit) => {
    expect(reviewSupported(reviewed('propose_lesson_create', edit))).toBe(false)
  })
  it.each([
    [
      'update identity',
      'propose_lesson_update',
      (p: LessonPreview) => {
        p.after.id = 20
      },
    ],
    [
      'update lifecycle',
      'propose_lesson_update',
      (p: LessonPreview) => {
        p.after.status = 'cancelled'
      },
    ],
    [
      'update links',
      'propose_lesson_update',
      (p: LessonPreview) => {
        p.after.replacement_id = 20
      },
    ],
    [
      'cancel before missing',
      'propose_lesson_cancel',
      (p: LessonPreview) => {
        p.before = null
      },
    ],
    [
      'cancel inactive',
      'propose_lesson_cancel',
      (p: LessonPreview) => {
        p.before!.status = 'cancelled'
      },
    ],
    [
      'cancel changes room',
      'propose_lesson_cancel',
      (p: LessonPreview) => {
        p.after.room = '502'
      },
    ],
    [
      'replacement inactive',
      'propose_lesson_replacement',
      (p: LessonPreview) => {
        p.before!.status = 'cancelled'
      },
    ],
    [
      'replacement self',
      'propose_lesson_replacement',
      (p: LessonPreview) => {
        p.after.id = 9
      },
    ],
    [
      'replacement target',
      'propose_lesson_replacement',
      (p: LessonPreview) => {
        p.after.replaces_lesson_id = 12
      },
    ],
    [
      'replacement effect',
      'propose_lesson_replacement',
      (p: LessonPreview) => {
        p.effects.original_becomes_replaced = false
      },
    ],
  ] as const)('blocks %s', (_name, type, edit) => {
    expect(reviewSupported(reviewed(type, edit))).toBe(false)
  })
  it('compares unordered objects semantically and blocks unknown future action types', () => {
    const action = reviewed('propose_lesson_cancel')
    const preview = action.preview as LessonPreview
    preview.after = Object.fromEntries(
      Object.entries(preview.after).reverse(),
    ) as typeof preview.after
    expect(reviewSupported(action)).toBe(true)
    expect(samePublicValue(preview.before, { ...preview.before, room: 'changed' })).toBe(false)
    expect(reviewSupported({ ...action, type: 'propose_lesson_delete' })).toBe(false)
    expect(lessonPreview({}, action.type)).toBeNull()
    expect(reviewSupported({ ...reviewed(), confirmation_required: false })).toBe(false)
  })
})
describe('Lesson review presentation and domain links', () => {
  it.each(lessonActionTypes)(
    'renders %s with local dates, full references, safe text and explicit decisions',
    async (type) => {
      const action = reviewed(type, (p) => {
        p.after.room = '<img src=x onerror=alert(1)>'
      })
      // Cancellation cannot change room: use the same server-provided value in both snapshots.
      if (type === 'propose_lesson_cancel')
        (action.preview as LessonPreview).before!.room = (
          action.preview as LessonPreview
        ).after.room
      const wrapper = await component(action)
      expect(wrapper.text()).toContain(actionLabels[type])
      expect(wrapper.text()).toContain('Europe/Kyiv')
      expect(wrapper.text()).toContain('GMT+2')
      expect(wrapper.text()).toContain('2026 р.')
      expect(wrapper.findAll('details, code')).toHaveLength(0)
      expect(wrapper.text()).toContain('Алгоритми')
      expect(wrapper.find('img').exists()).toBe(false)
      expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
      expect(wrapper.emitted('decision')).toBeUndefined()
      const confirm = wrapper.findAll('button').find((b) => b.text() === 'Підтвердити зміни')!
      await confirm.trigger('click')
      expect(wrapper.emitted('decision')).toEqual([['confirm']])
      await wrapper.setProps({ busy: true })
      expect(wrapper.findAll('button').every((b) => b.attributes('disabled') !== undefined)).toBe(
        true,
      )
      wrapper.unmount()
    },
  )
  it('highlights only merged material changes and retains omitted optional context', async () => {
    const wrapper = await component(reviewed('propose_lesson_update'))
    expect(wrapper.findAll('.ai-field-changed')).toHaveLength(1)
    expect(wrapper.find('.ai-field-changed').text()).toContain('Аудиторія')
    expect(wrapper.text()).toContain('Демо-викладач')
    expect(wrapper.text()).toContain('Осінній семестр')
  })
  it.each(['rejected', 'expired'] as const)(
    'renders terminal %s without decisions',
    async (status) => {
      const action = reviewed()
      const wrapper = await component({
        ...action,
        status,
        state: status,
        confirmation_required: false,
      })
      expect(wrapper.findAll('button')).toHaveLength(0)
    },
  )
  it('allows rejection of a malformed review but never confirmation', async () => {
    const wrapper = await component({ ...reviewed(), preview: {} })
    const buttons = wrapper.findAll('button')
    expect(
      buttons.find((b) => b.text() === 'Підтвердити зміни')!.attributes('disabled'),
    ).toBeDefined()
    await buttons.find((b) => b.text() === 'Відхилити пропозицію')!.trigger('click')
    expect(wrapper.emitted('decision')).toEqual([['reject']])
  })
  it('renders receipt Lesson links, no Task fallback or misclassified StudySession, while a refresh fails', async () => {
    const action = reviewed('propose_lesson_replacement')
    action.status = 'executed'
    action.state = 'executed'
    action.confirmation_required = false
    action.receipt = lessonReceiptFixture(action)
    const wrapper = await component(action)
    await wrapper.setProps({ domainError: new ApiError(503) })
    expect(wrapper.find('a[href="/schedule/lessons/20"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/schedule/lessons/9"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/schedule/legacy"]').exists()).toBe(true)
    expect(wrapper.find('a[href^="/planning/sessions"]').exists()).toBe(false)
    expect(wrapper.find('a[href="/tasks"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Зміни застосовано')
    expect(wrapper.text()).toContain('Дію виконано, але')
    expect(receiptSessionIds(action.receipt)).toEqual([])
    expect(
      receiptSessionIds({
        original: { id: 90 },
        replacement: { id: 92 },
        type: 'propose_session_reschedule',
      }),
    ).toEqual([90, 92])
    const badReceipt = {
      ...action.receipt,
      original: { ...lessonSnapshot(), status: 'replaced', replacement_id: 33 },
    }
    expect(lessonReceipt(badReceipt, action.type, action.id)).toBeNull()
  })
})
describe('Lesson API and authoritative refresh', () => {
  it.each(lessonActionTypes)(
    'uses only action endpoints and exact {} decisions for %s; replays one saved result',
    async (type) => {
      const { backend } = setup()
      const action = reviewed(type)
      backend.ai.actions.push(action)
      await aiApi.action(1, action.id)
      expect(backend.executions).toBe(0)
      const result = await aiApi.decide(1, action.id, 'confirm')
      expect(result.data.receipt).toEqual(lessonReceiptFixture(action))
      expect((await aiApi.decide(1, action.id, 'confirm')).replayed).toBe(true)
      expect(backend.executions).toBe(1)
      const second = lessonActionFixture(type, 2)
      backend.ai.actions.push(second)
      expect((await aiApi.decide(1, second.id, 'reject')).data.status).toBe('rejected')
      expect(
        backend.requests
          .filter((r) => r.method === 'POST')
          .every((r) => JSON.stringify(r.body) === '{}'),
      ).toBe(true)
      expect(
        backend.requests.some((r) => r.method !== 'GET' && r.path.startsWith('/api/lessons')),
      ).toBe(false)
    },
  )
  it.each([409, 410])('parses the documented terminal %s action envelope', async (status) => {
    const action = reviewed()
    Object.assign(action, {
      status: status === 410 ? 'expired' : 'rejected',
      state: status === 410 ? 'expired' : 'rejected',
      confirmation_required: false,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ data: action, replayed: false }, status)),
    )
    expect((await aiApi.decide(1, action.id, 'confirm')).data).toEqual(action)
  })
  it('rejects foreign or invalid terminal envelope identities and retains code errors', async () => {
    const action = reviewed()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ data: { ...action, conversation_id: 2 }, replayed: false }, 409),
      )
      .mockResolvedValueOnce(json({ code: 'action_stale' }, 409))
    vi.stubGlobal('fetch', fetch)
    await expect(aiApi.decide(1, action.id, 'confirm')).rejects.toMatchObject({ status: 502 })
    await expect(aiApi.decide(1, action.id, 'confirm')).rejects.toMatchObject({
      status: 409,
      code: 'action_stale',
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('refreshes both Lesson details and original/result local date boundaries without touching StudySessions', async () => {
    const { backend } = setup()
    const action = reviewed('propose_lesson_replacement', (p) => {
      p.before!.starts_at = '2026-11-11T21:30:00Z'
      p.before!.ends_at = '2026-11-11T23:30:00Z'
    })
    backend.ai.actions.push(action)
    const executed = (await aiApi.decide(1, action.id, 'confirm')).data
    await refreshAiDomains(executed, 'Europe/Kyiv')
    const paths = backend.requests.filter((r) => r.method === 'GET').map((r) => r.path)
    for (const path of [
      '/api/lessons/9',
      '/api/lessons/20',
      '/api/schedule/today',
      ...['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'].map(
        (date) => `/api/schedule/date/${date}`,
      ),
    ])
      expect(paths).toContain(path)
    expect(paths.some((path) => path.includes('study-sessions') || path.includes('tasks'))).toBe(
      false,
    )
    expect(executed.receipt).toEqual(lessonReceiptFixture(action))
  })
  it('refreshes authoritative current detail dates, excludes midnight endpoint day and retains receipt after failed detail reads', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T10:00:00Z'))
    const { backend, fetch } = setup()
    const action = reviewed('propose_lesson_create', (p) => {
      p.after.starts_at = '2026-11-13T20:00:00Z'
      p.after.ends_at = '2026-11-13T22:00:00Z'
    })
    backend.ai.actions.push(action)
    const result = await aiApi.decide(1, action.id, 'confirm')
    backend.lessons.set(20, {
      ...lessonSnapshot(20),
      starts_at: '2026-11-17T07:00:00Z',
      ends_at: '2026-11-17T08:00:00Z',
    })
    await refreshAiDomains(result.data, 'Europe/Kyiv')
    expect(backend.requests.some((r) => r.path === '/api/schedule/date/2026-11-17')).toBe(true)
    expect(backend.requests.some((r) => r.path === '/api/schedule/date/2026-11-14')).toBe(false)
    const receipt = structuredClone(result.data.receipt)
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) =>
        url.endsWith('/lessons/20') ? Promise.resolve(json({}, 503)) : fetch(url, init),
      ),
    )
    await expect(refreshAiDomains(result.data, 'Europe/Kyiv')).rejects.toMatchObject({
      status: 503,
    })
    expect(result.data.receipt).toEqual(receipt)
    await refreshAiDomains({ ...action, status: 'pending', receipt: null }, 'Europe/Kyiv')
    await flushPromises()
  })
})
