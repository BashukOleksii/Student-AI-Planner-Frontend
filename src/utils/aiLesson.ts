import {
  lessonActionTypes,
  type LessonActionType,
  type LessonPreview,
  type LessonReceipt,
  type LessonSnapshot,
} from '@/types/ai'
import { lessonTypes, lessonStatuses } from './lessons'

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const id = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
const nullableId = (value: unknown) => value === null || id(value)
export const isLessonAction = (type: string): type is LessonActionType =>
  lessonActionTypes.some((name) => name === type)

// JSON objects are unordered; array ordering and every material value remain significant.
export function samePublicValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => samePublicValue(value, right[index]))
    )
  if (!object(left) || !object(right)) return false
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && samePublicValue(left[key], right[key]))
  )
}
export function lessonInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value))
    return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString().replace('.000Z', 'Z') === value
}
function namedReference(value: unknown, identity: unknown) {
  return identity === null
    ? value === null
    : object(value) && value.id === identity && typeof value.name === 'string'
}
export function isLessonSnapshot(value: unknown): value is LessonSnapshot {
  if (!object(value)) return false
  return (
    nullableId(value.id) &&
    ['subject', 'teacher', 'academic_period'].every(
      (key) => nullableId(value[`${key}_id`]) && namedReference(value[key], value[`${key}_id`]),
    ) &&
    typeof value.type === 'string' &&
    Object.hasOwn(lessonTypes, value.type) &&
    (value.room === null || typeof value.room === 'string') &&
    lessonInstant(value.starts_at) &&
    lessonInstant(value.ends_at) &&
    value.starts_at < value.ends_at &&
    typeof value.status === 'string' &&
    Object.hasOwn(lessonStatuses, value.status) &&
    nullableId(value.replaces_lesson_id) &&
    nullableId(value.replacement_id) &&
    (value.id === null ||
      (value.replaces_lesson_id !== value.id && value.replacement_id !== value.id))
  )
}
export function lessonPreview(value: unknown, type: string): LessonPreview | null {
  if (
    !isLessonAction(type) ||
    !object(value) ||
    value.type !== type ||
    value.confirmation_required !== true
  )
    return null
  const effects = value.effects
  if (
    !object(effects) ||
    effects.original_becomes_replaced !== (type === 'propose_lesson_replacement') ||
    effects.restores_original !== false ||
    effects.study_sessions_rescheduled !== false ||
    effects.import_identity_preserved !== true ||
    Object.keys(effects).some(
      (key) =>
        ![
          'original_becomes_replaced',
          'restores_original',
          'study_sessions_rescheduled',
          'import_identity_preserved',
        ].includes(key),
    )
  )
    return null
  if (
    value.required_consent !== undefined &&
    (!Array.isArray(value.required_consent) || value.required_consent.length)
  )
    return null
  const before = value.before,
    after = value.after
  if (!isLessonSnapshot(after)) return null
  if (type === 'propose_lesson_create') {
    if (
      before !== null ||
      after.id !== null ||
      after.status !== 'active' ||
      !id(after.subject_id) ||
      after.replaces_lesson_id !== null ||
      after.replacement_id !== null
    )
      return null
  } else {
    if (!isLessonSnapshot(before) || !id(before.id)) return null
    if (type === 'propose_lesson_replacement') {
      if (
        before.status !== 'active' ||
        before.replaces_lesson_id !== null ||
        before.replacement_id !== null ||
        after.status !== 'active' ||
        !id(after.subject_id) ||
        after.id === before.id ||
        after.replaces_lesson_id !== before.id ||
        after.replacement_id !== null
      )
        return null
    } else if (type === 'propose_lesson_cancel') {
      if (before.status !== 'active' || !samePublicValue({ ...before, status: 'cancelled' }, after))
        return null
    } else if (
      after.id !== before.id ||
      !id(after.subject_id) ||
      after.status !== before.status ||
      after.replaces_lesson_id !== before.replaces_lesson_id ||
      after.replacement_id !== before.replacement_id
    )
      return null
  }
  return value as LessonPreview
}
export function lessonReceipt(
  value: unknown,
  type: string,
  actionId: string,
): LessonReceipt | null {
  if (
    !isLessonAction(type) ||
    !object(value) ||
    value.type !== type ||
    value.action_id !== actionId ||
    !isLessonSnapshot(value.lesson) ||
    !id(value.lesson.id)
  )
    return null
  const lesson = value.lesson,
    original = value.original
  if (type === 'propose_lesson_replacement') {
    if (
      !isLessonSnapshot(original) ||
      !id(original.id) ||
      original.status !== 'replaced' ||
      original.replaces_lesson_id !== null ||
      original.replacement_id !== lesson.id ||
      lesson.replaces_lesson_id !== original.id ||
      lesson.id === original.id ||
      lesson.status !== 'active' ||
      lesson.replacement_id !== null
    )
      return null
  } else if (original !== null) return null
  if (type === 'propose_lesson_cancel' && lesson.status !== 'cancelled') return null
  if (
    type === 'propose_lesson_create' &&
    (lesson.status !== 'active' ||
      lesson.replaces_lesson_id !== null ||
      lesson.replacement_id !== null)
  )
    return null
  return value as LessonReceipt
}
