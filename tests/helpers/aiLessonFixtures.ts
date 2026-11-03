import type {
  AiAction,
  LessonActionType,
  LessonPreview,
  LessonReceipt,
  LessonSnapshot,
} from '@/types/ai'

// Exact public shapes from Backend eab1f25 LessonActionService/Presenter (no executable arguments).
export const lessonSnapshot = (id: number | null = 9): LessonSnapshot => ({
  id,
  subject_id: 7,
  teacher_id: 8,
  academic_period_id: 4,
  subject: { id: 7, name: 'Алгоритми' },
  teacher: { id: 8, name: 'Демо-викладач' },
  academic_period: { id: 4, name: 'Осінній семестр' },
  type: 'lecture',
  room: '301',
  starts_at: '2026-11-12T07:00:00Z',
  ends_at: '2026-11-12T08:20:00Z',
  status: 'active',
  replaces_lesson_id: null,
  replacement_id: null,
})
export function lessonActionFixture(
  type: LessonActionType = 'propose_lesson_create',
  index = 1,
  conversationId = 1,
): AiAction {
  const before = type === 'propose_lesson_create' ? null : lessonSnapshot()
  const after =
    type === 'propose_lesson_create' || type === 'propose_lesson_replacement'
      ? {
          ...lessonSnapshot(null),
          teacher_id: null,
          teacher: null,
          academic_period_id: null,
          academic_period: null,
          room: null,
        }
      : { ...lessonSnapshot(), room: type === 'propose_lesson_update' ? null : '301' }
  if (type === 'propose_lesson_cancel') after.status = 'cancelled'
  if (type === 'propose_lesson_replacement') {
    after.replaces_lesson_id = 9
    after.starts_at = '2026-11-13T21:30:00Z'
    after.ends_at = '2026-11-13T23:30:00Z'
  }
  const preview: LessonPreview = {
    type,
    confirmation_required: true,
    before,
    after,
    effects: {
      original_becomes_replaced: type === 'propose_lesson_replacement',
      restores_original: false,
      study_sessions_rescheduled: false,
      import_identity_preserved: true,
    },
  }
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    conversation_id: conversationId,
    call_id: `call_${index}`,
    type,
    status: 'pending',
    state: 'confirmation_required',
    confirmation_required: true,
    preview,
    expires_at: '2099-11-12T12:00:00.000000Z',
    created_at: '2026-11-03T12:00:00.000000Z',
    resolved_at: null,
    receipt: null,
  }
}
export function lessonReceiptFixture(action: AiAction): LessonReceipt {
  const preview = action.preview as LessonPreview
  const lesson = { ...structuredClone(preview.after), id: preview.after.id ?? 20 }
  return {
    action_id: action.id,
    type: preview.type,
    lesson,
    original:
      preview.type === 'propose_lesson_replacement'
        ? {
            ...structuredClone(preview.before!),
            id: preview.before!.id!,
            status: 'replaced',
            replacement_id: lesson.id,
          }
        : null,
  }
}
