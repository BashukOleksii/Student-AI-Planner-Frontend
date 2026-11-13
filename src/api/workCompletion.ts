import { request } from './client'
export interface CompletionReview {
  future_sessions_count: number
  completion_token: string
  message: string
}
export async function completeWork<T>(base: string, signal?: AbortSignal): Promise<T> {
  const review = await request<CompletionReview>(`${base}/completion-review`, { signal })
  if (review.future_sessions_count > 0 && !window.confirm(review.message))
    throw new Error('Завершення скасовано користувачем.')
  return request<T>(`${base}/complete`, {
    method: 'POST',
    body: { completion_token: review.completion_token },
    signal,
  })
}
