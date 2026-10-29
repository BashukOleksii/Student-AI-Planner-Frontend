import { request } from './client'
import type {
  EducationInstitution,
  AcademicPeriod,
  Subject,
  Teacher,
  InstitutionInput,
  PeriodInput,
  SubjectInput,
  TeacherInput,
  Resource,
} from '@/types/api'
export const academicApi = {
  institutions: {
    list: (signal?: AbortSignal) =>
      request<Resource<EducationInstitution[]>>('/api/education-institutions', { signal }),
    get: (id: number, signal?: AbortSignal) =>
      request<Resource<EducationInstitution>>(`/api/education-institutions/${id}`, { signal }),
    create: (body: InstitutionInput, signal?: AbortSignal) =>
      request<Resource<EducationInstitution>>('/api/education-institutions', {
        method: 'POST',
        body,
        signal,
      }),
    update: (id: number, body: Partial<InstitutionInput>, signal?: AbortSignal) =>
      request<Resource<EducationInstitution>>(`/api/education-institutions/${id}`, {
        method: 'PATCH',
        body,
        signal,
      }),
    remove: (id: number, signal?: AbortSignal) =>
      request<void>(`/api/education-institutions/${id}`, { method: 'DELETE', signal }),
  },
  periods: {
    list: (signal?: AbortSignal) =>
      request<Resource<AcademicPeriod[]>>('/api/academic-periods', { signal }),
    get: (id: number, signal?: AbortSignal) =>
      request<Resource<AcademicPeriod>>(`/api/academic-periods/${id}`, { signal }),
    create: (body: PeriodInput, signal?: AbortSignal) =>
      request<Resource<AcademicPeriod>>('/api/academic-periods', { method: 'POST', body, signal }),
    update: (id: number, body: Partial<PeriodInput>, signal?: AbortSignal) =>
      request<Resource<AcademicPeriod>>(`/api/academic-periods/${id}`, {
        method: 'PATCH',
        body,
        signal,
      }),
    remove: (id: number, signal?: AbortSignal) =>
      request<void>(`/api/academic-periods/${id}`, { method: 'DELETE', signal }),
  },
  subjects: {
    list: (signal?: AbortSignal) => request<Resource<Subject[]>>('/api/subjects', { signal }),
    get: (id: number, signal?: AbortSignal) =>
      request<Resource<Subject>>(`/api/subjects/${id}`, { signal }),
    create: (body: SubjectInput, signal?: AbortSignal) =>
      request<Resource<Subject>>('/api/subjects', { method: 'POST', body, signal }),
    update: (id: number, body: Partial<SubjectInput>, signal?: AbortSignal) =>
      request<Resource<Subject>>(`/api/subjects/${id}`, { method: 'PATCH', body, signal }),
    remove: (id: number, signal?: AbortSignal) =>
      request<void>(`/api/subjects/${id}`, { method: 'DELETE', signal }),
  },
  teachers: {
    list: (signal?: AbortSignal) => request<Resource<Teacher[]>>('/api/teachers', { signal }),
    get: (id: number, signal?: AbortSignal) =>
      request<Resource<Teacher>>(`/api/teachers/${id}`, { signal }),
    create: (body: TeacherInput, signal?: AbortSignal) =>
      request<Resource<Teacher>>('/api/teachers', { method: 'POST', body, signal }),
    update: (id: number, body: Partial<TeacherInput>, signal?: AbortSignal) =>
      request<Resource<Teacher>>(`/api/teachers/${id}`, { method: 'PATCH', body, signal }),
    remove: (id: number, signal?: AbortSignal) =>
      request<void>(`/api/teachers/${id}`, { method: 'DELETE', signal }),
  },
}

export const subjectsApi = academicApi.subjects.list
