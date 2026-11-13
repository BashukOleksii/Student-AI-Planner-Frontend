import { request } from './client'
import type { Resource, Task, Subtask } from '@/types/api'
export class WorkCompletionDeclined extends Error {}

export interface CompletionReview {
  future_sessions_count: number
  completion_token: string
  message: string
}
export async function completeWork<T>(base: string, signal?: AbortSignal): Promise<T> {
  const review = await request<CompletionReview>(`${base}/completion-review`, { signal })
  if (review.future_sessions_count > 0 && !window.confirm(review.message))
    throw new WorkCompletionDeclined('Завершення скасовано користувачем.')
  return request<T>(`${base}/complete`, {
    method: 'POST',
    body: { completion_token: review.completion_token },
    signal,
  })
}

const workPath = (taskId: number, subtaskId: number | null) =>
  `/api/tasks/${taskId}${subtaskId === null ? '' : `/subtasks/${subtaskId}`}`
export const workCompletionApi = {
  review: (taskId: number, subtaskId: number | null, signal?: AbortSignal) =>
    request<CompletionReview>(`${workPath(taskId, subtaskId)}/completion-review`, { signal }),
  complete: (taskId: number, subtaskId: number | null, token: string) =>
    request<Resource<Task | Subtask>>(`${workPath(taskId, subtaskId)}/complete`, {
      method: 'POST',
      body: { completion_token: token },
    }),
}
