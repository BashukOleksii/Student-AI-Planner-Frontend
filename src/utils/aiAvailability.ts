import {
  availabilityActionTypes,
  type AvailabilityActionType,
  type AvailabilityEffects,
  type AvailabilityPreview,
  type AvailabilityReceipt,
  type AvailabilitySnapshot,
} from '@/types/ai'

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const id = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
const timezone = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0
export const isAvailabilityAction = (type: string): type is AvailabilityActionType =>
  availabilityActionTypes.some((name) => name === type)
const clock = (value: unknown, end = false): value is string =>
  typeof value === 'string' &&
  (/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value) || (end && value === '24:00:00'))

// Lexical public shape only: interval/overlap/business validation belongs to Backend.
export function isAvailabilitySnapshot(value: unknown): value is AvailabilitySnapshot {
  return (
    object(value) &&
    Object.keys(value).length === 4 &&
    (value.id === null || id(value.id)) &&
    Number.isInteger(value.day_of_week) &&
    Number(value.day_of_week) >= 1 &&
    Number(value.day_of_week) <= 7 &&
    clock(value.starts_at) &&
    clock(value.ends_at, true)
  )
}
function effects(value: unknown, type: AvailabilityActionType): value is AvailabilityEffects {
  if (!object(value)) return false
  const expected: AvailabilityEffects = {
    changes_recurring_availability: true,
    removes_availability_window: type === 'propose_availability_delete',
    reschedules_existing_sessions: false,
    changes_planning_preferences: false,
    deletes_tasks: false,
    deletes_lessons: false,
    deletes_study_sessions: false,
    changes_reminders: false,
  }
  return (
    Object.keys(value).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, flag]) => value[key] === flag)
  )
}
export function availabilityPreview(value: unknown, type: string): AvailabilityPreview | null {
  if (
    !isAvailabilityAction(type) ||
    !object(value) ||
    value.type !== type ||
    value.confirmation_required !== true ||
    !timezone(value.timezone) ||
    !effects(value.effects, type) ||
    (value.required_consent !== undefined &&
      (!Array.isArray(value.required_consent) || value.required_consent.length !== 0))
  )
    return null
  const before = value.before,
    after = value.after
  if (type === 'propose_availability_create') {
    if (before !== null || !isAvailabilitySnapshot(after) || after.id !== null) return null
  } else {
    if (!isAvailabilitySnapshot(before) || !id(before.id)) return null
    if (type === 'propose_availability_delete') {
      if (after !== null) return null
    } else if (!isAvailabilitySnapshot(after) || after.id !== before.id) return null
  }
  return value as AvailabilityPreview
}
export function availabilityReceipt(
  value: unknown,
  type: string,
  actionId: string,
): AvailabilityReceipt | null {
  if (
    !isAvailabilityAction(type) ||
    !object(value) ||
    value.type !== type ||
    value.action_id !== actionId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actionId) ||
    !timezone(value.timezone) ||
    !effects(value.effects, type)
  )
    return null
  const removed = type === 'propose_availability_delete'
  const snapshot = removed ? value.deleted_window : value.window
  if (
    !isAvailabilitySnapshot(snapshot) ||
    !id(snapshot.id) ||
    (removed ? value.window : value.deleted_window) !== null
  )
    return null
  return value as AvailabilityReceipt
}
