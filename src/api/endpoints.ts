import { initializeCsrf, query, request } from './client'
import type {
  LoginInput,
  RegistrationInput,
  ProfileInput,
  User,
  Resource,
  Page,
  Task,
  TaskInput,
  TaskFilters,
  Schedule,
  Progress,
} from '@/types/api'
export const accountApi = {
  profile: () => request<Resource<User>>('/api/profile'),
  async login(input: LoginInput) {
    await initializeCsrf()
    return request<Resource<User>>('/api/auth/login', { method: 'POST', body: input })
  },
  async register(input: RegistrationInput) {
    await initializeCsrf()
    return request<Resource<User>>('/api/auth/register', { method: 'POST', body: input })
  },
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  update: (input: ProfileInput) =>
    request<Resource<User>>('/api/profile', { method: 'PATCH', body: input }),
}
export const tasksApi = {
  list: (filters: TaskFilters = {}, signal?: AbortSignal) =>
    request<Page<Task>>(`/api/tasks${query(filters)}`, { signal }),
  get: (id: number, signal?: AbortSignal) =>
    request<Resource<Task>>(`/api/tasks/${id}`, { signal }),
  create: (input: TaskInput, signal?: AbortSignal) =>
    request<Resource<Task>>('/api/tasks', { method: 'POST', body: input, signal }),
  update: (id: number, input: Partial<TaskInput>, signal?: AbortSignal) =>
    request<Resource<Task>>(`/api/tasks/${id}`, { method: 'PATCH', body: input, signal }),
  remove: (id: number) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  complete: (id: number) =>
    request<Resource<Task>>(`/api/tasks/${id}/complete`, { method: 'POST' }),
  reopen: (id: number) => request<Resource<Task>>(`/api/tasks/${id}/reopen`, { method: 'POST' }),
}
// Preserve the F1 export; all subject operations use the same endpoint module.
export { subjectsApi } from './academic'
export const scheduleApi = (mode: 'today' | 'day' | 'week', date: string, signal?: AbortSignal) =>
  request<Schedule>(
    `/api/schedule/${mode === 'today' ? 'today' : `${mode === 'day' ? 'date' : 'week'}/${date}`}`,
    { signal },
  )
export const progressApi = (start_date: string, end_date: string, signal?: AbortSignal) =>
  request<Resource<Progress>>(`/api/statistics/progress${query({ start_date, end_date })}`, {
    signal,
  })
