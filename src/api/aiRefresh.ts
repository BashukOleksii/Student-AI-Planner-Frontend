import { academicCalendarApi } from './academicCalendar'
import { recoveryApi } from './recovery'
import { isSemesterAction } from '@/utils/aiSemester'
import { tasksApi, scheduleApi, progressApi } from './endpoints'
import { subtasksApi } from './subtasks'
import { activityApi } from './activity'
import { lessonsApi } from './lessons'
import { ApiError } from './client'
import { planningApi } from './planning'
import { isAvailabilityAction, availabilityReceipt } from '@/utils/aiAvailability'
import { isLessonAction, lessonPreview, lessonReceipt } from '@/utils/aiLesson'
import type { AiAction } from '@/types/ai'
import { isPublicObject, positiveId, receiptTaskId } from '@/utils/ai'
import { localDate, localEndDate, today } from '@/utils/dates'

export async function refreshAiDomains(
  action: AiAction,
  timezone: string,
  signal?: AbortSignal,
  inspectProposal = false,
) {
  if (isSemesterAction(action.type)) {
    if (action.status !== 'executed' && !inspectProposal) return
    const day = today(timezone)
    await Promise.all([
      academicCalendarApi.today(signal),
      recoveryApi.diagnostics(day, day, signal),
    ])
    return
  }
  if (isAvailabilityAction(action.type)) {
    if (action.status !== 'executed' && !inspectProposal) return
    if (
      action.status === 'executed' &&
      !availabilityReceipt(action.receipt, action.type, action.id)
    )
      throw new ApiError(502)
    // No shared planning cache/KeepAlive: route views refetch; protected previews are local
    // and disposed on navigation. Do not request free slots without a selected range.
    return planningApi.availability(signal)
  }
  if (isLessonAction(action.type)) {
    if (action.status !== 'executed' && !inspectProposal) return
    const preview = lessonPreview(action.preview, action.type)
    const receipt = lessonReceipt(action.receipt, action.type, action.id)
    if (action.status === 'executed' && !receipt) throw new ApiError(502)
    const snapshots = [preview?.before, preview?.after, receipt?.lesson, receipt?.original]
    const ids = [
      ...new Set(
        (receipt ? [receipt.lesson.id, receipt.original?.id] : [preview?.before?.id]).filter(
          positiveId,
        ),
      ),
    ]
    const details = await Promise.allSettled(ids.map((id) => lessonsApi.get(id, signal)))
    const dates = new Set([today(timezone)])
    // Refresh both occurrence boundaries, including moved/cross-midnight Lessons.
    // ScheduleView has no shared cache: any subsequently opened day/week refetches its whole range.
    for (const snapshot of [
      ...snapshots,
      ...details.flatMap((r) => (r.status === 'fulfilled' ? [r.value.data] : [])),
    ]) {
      if (!snapshot) continue
      dates.add(localDate(snapshot.starts_at, timezone))
      dates.add(localEndDate(snapshot.ends_at, timezone))
    }
    const outcomes = await Promise.allSettled([
      scheduleApi('today', today(timezone), signal),
      ...[...dates].map((date) => scheduleApi('day', date, signal)),
    ])
    const failure = [...details, ...outcomes].find((outcome) => outcome.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    return
  }
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
