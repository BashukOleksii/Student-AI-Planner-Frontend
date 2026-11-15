import { availabilityActionTypes, type AvailabilityPreview } from '@/types/ai'
import { consentFields, reviewSupported } from '@/utils/ai'
import { availabilityReceipt } from '@/utils/aiAvailability'
import { describe, expect, it } from 'vitest'
import {
  availabilityActionFixture,
  availabilityReceiptFixture,
} from '../helpers/aiAvailabilityFixtures'
describe('Availability public review validation', () => {
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
    expect(reviewSupported(updated)).toBe(true)
    const removed = availabilityActionFixture('propose_availability_delete')
    removed.preview.after = structuredClone(removed.preview.before!)
    expect(reviewSupported(removed)).toBe(false)
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
