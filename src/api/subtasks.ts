import { request } from './client'
import type { Resource, Subtask, SubtaskInput, TaskProgress } from '@/types/api'
const base = (taskId: number) => `/api/tasks/${taskId}/subtasks`
export const subtasksApi = {
  list: (taskId: number, signal?: AbortSignal) =>
    request<Resource<Subtask[]>>(base(taskId), { signal }),
  get: (taskId: number, id: number, signal?: AbortSignal) =>
    request<Resource<Subtask>>(`${base(taskId)}/${id}`, { signal }),
  create: (taskId: number, body: SubtaskInput, signal?: AbortSignal) =>
    request<Resource<Subtask>>(base(taskId), { method: 'POST', body, signal }),
  update: (taskId: number, id: number, body: Partial<SubtaskInput>, signal?: AbortSignal) =>
    request<Resource<Subtask>>(`${base(taskId)}/${id}`, { method: 'PATCH', body, signal }),
  remove: (taskId: number, id: number, signal?: AbortSignal) =>
    request<void>(`${base(taskId)}/${id}`, { method: 'DELETE', signal }),
  complete: (taskId: number, id: number, signal?: AbortSignal) =>
    request<Resource<Subtask>>(`${base(taskId)}/${id}/complete`, { method: 'POST', signal }),
  reopen: (taskId: number, id: number, signal?: AbortSignal) =>
    request<Resource<Subtask>>(`${base(taskId)}/${id}/reopen`, { method: 'POST', signal }),
  reorder: (taskId: number, subtask_ids: number[], signal?: AbortSignal) =>
    request<Resource<Subtask[]>>(`${base(taskId)}/reorder`, {
      method: 'POST',
      body: { subtask_ids },
      signal,
    }),
  progress: (taskId: number, signal?: AbortSignal) =>
    request<Resource<TaskProgress>>(`/api/tasks/${taskId}/progress`, { signal }),
}
