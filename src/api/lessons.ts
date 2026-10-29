import { request } from './client'
import type { Resource } from '@/types/api'
import type { LessonDetail, LessonInput } from '@/types/lessons'
export const lessonsApi = {
  get: (id: number, signal?: AbortSignal) =>
    request<Resource<LessonDetail>>(`/api/lessons/${id}`, { signal }),
  create: (body: LessonInput) =>
    request<Resource<LessonDetail>>('/api/lessons', { method: 'POST', body }),
  update: (id: number, body: Partial<LessonInput>) =>
    request<Resource<LessonDetail>>(`/api/lessons/${id}`, { method: 'PATCH', body }),
  cancel: (id: number) =>
    request<Resource<LessonDetail>>(`/api/lessons/${id}/cancel`, { method: 'POST' }),
  replacement: (id: number, body: LessonInput) =>
    request<Resource<LessonDetail>>(`/api/lessons/${id}/replacement`, { method: 'POST', body }),
  remove: (id: number) => request<void>(`/api/lessons/${id}`, { method: 'DELETE' }),
}
