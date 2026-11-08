import type {
  AiAction,
  AvailabilityActionType,
  AvailabilityPreview,
  AvailabilityReceipt,
} from '@/types/ai'
import type { AvailabilityWindow } from '@/types/planning'

// Public Stage 18B snapshots: recurring local clocks, never UTC timestamps.
export const availabilityWindow = (id = 12): AvailabilityWindow => ({
  id,
  day_of_week: 1,
  starts_at: '16:00:01',
  ends_at: '20:00:02',
})
export function availabilityActionFixture(
  type: AvailabilityActionType = 'propose_availability_create',
  index = 1,
  conversationId = 1,
): AiAction {
  const preview: AvailabilityPreview = {
    type,
    confirmation_required: true,
    before: type === 'propose_availability_create' ? null : availabilityWindow(),
    after:
      type === 'propose_availability_delete'
        ? null
        : {
            ...availabilityWindow(),
            id: type === 'propose_availability_create' ? null : 12,
            starts_at: '20:00:03',
            ends_at: '24:00:00',
          },
    timezone: 'Europe/Kyiv',
    effects: {
      changes_recurring_availability: true,
      removes_availability_window: type === 'propose_availability_delete',
      reschedules_existing_sessions: false,
      changes_planning_preferences: false,
      deletes_tasks: false,
      deletes_lessons: false,
      deletes_study_sessions: false,
      changes_reminders: false,
    },
  }
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    conversation_id: conversationId,
    call_id: `availability_${index}`,
    type,
    status: 'pending',
    state: 'confirmation_required',
    confirmation_required: true,
    preview,
    expires_at: '2099-11-12T12:00:00Z',
    created_at: '2026-11-08T16:00:00Z',
    resolved_at: null,
    receipt: null,
  }
}
export function availabilityReceiptFixture(action: AiAction): AvailabilityReceipt {
  const preview = action.preview as AvailabilityPreview
  return {
    action_id: action.id,
    type: preview.type,
    window: preview.after
      ? { ...structuredClone(preview.after), id: preview.after.id ?? 13 }
      : null,
    deleted_window: preview.before && !preview.after ? structuredClone(preview.before) : null,
    timezone: preview.timezone,
    effects: structuredClone(preview.effects),
  }
}
