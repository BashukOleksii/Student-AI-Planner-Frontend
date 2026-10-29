import { tasksApi, scheduleApi, progressApi } from './endpoints'
import { subtasksApi } from './subtasks'
import { activityApi } from './activity'
import type { AiAction } from '@/types/ai'
import { isPublicObject, positiveId, receiptTaskId } from '@/utils/ai'
import { localDate, today } from '@/utils/dates'

export async function refreshAiDomains(action: AiAction, timezone: string, signal?: AbortSignal) {
  if (action.status !== 'executed' || !action.receipt) return
  const reads: Promise<unknown>[] = []
  const taskId = receiptTaskId(action.receipt)
  if (taskId) reads.push(tasksApi.get(taskId, signal))
  reads.push(tasksApi.list({}, signal))
  if (isPublicObject(action.receipt.subtask) && taskId)
    reads.push(subtasksApi.list(taskId, signal), subtasksApi.progress(taskId, signal))
  if (isPublicObject(action.receipt.reminder) && positiveId(action.receipt.reminder.id))
    reads.push(activityApi.reminder(action.receipt.reminder.id, signal))
  if (
    [
      'propose_study_plan_create',
      'propose_adaptive_replanning',
      'propose_session_reschedule',
    ].includes(action.type)
  ) {
    const review = action.preview.review
    let start = today(timezone),
      end = start
    if (isPublicObject(review)) {
      if (typeof review.start_date === 'string' && typeof review.end_date === 'string') {
        start = review.start_date
        end = review.end_date
      } else if (
        isPublicObject(review.replacement) &&
        typeof review.replacement.starts_at === 'string'
      ) {
        start = localDate(review.replacement.starts_at, timezone)
        end = start
      }
    }
    reads.push(
      activityApi.sessions(start, end, signal),
      scheduleApi('today', today(timezone), signal),
    )
  }
  const day = today(timezone)
  reads.push(progressApi(day, day, signal))
  const outcomes = await Promise.allSettled(reads)
  const failed = outcomes.find((outcome) => outcome.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}
