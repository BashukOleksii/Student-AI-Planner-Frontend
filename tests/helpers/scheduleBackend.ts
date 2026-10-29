import { planningBackend } from './planningBackend'
import type { MockReply } from './f2Backend'
import type { LessonDetail } from '@/types/lessons'
import type { ScheduleImportBatch, ScheduleImportRow } from '@/types/scheduleImport'
import { user } from '../fixtures'
export const lessonDetailFixture = (id = 9): LessonDetail => ({
  id,
  subject_id: 7,
  teacher_id: 8,
  academic_period_id: 4,
  type: 'lecture',
  room: '301',
  starts_at: '2026-11-02T07:00:00Z',
  ends_at: '2026-11-02T08:20:00Z',
  status: 'active',
  replaces_lesson_id: null,
  replacement_id: null,
})
export const importRowFixture = (row_number = 1): ScheduleImportRow => ({
  row_number,
  status: 'valid',
  operation: 'create',
  group: 'ПІ-231',
  workbook_source: { worksheet: 'Розклад', range: 'A1:F84' },
  local_date: '2026-11-02',
  weekday: 1,
  pair_label: '1-2',
  parity: 'all',
  subject_name: 'Архітектура ПЗ',
  subject_id: 7,
  teacher_name: 'Ірина Коваль',
  teacher_id: 8,
  room: '302',
  type: 'other',
  starts_at_local: '11:00:00',
  ends_at_local: '12:20:00',
  starts_at_utc: '2026-11-02T09:00:00Z',
  ends_at_utc: '2026-11-02T10:20:00Z',
  source: { worksheet: 'Розклад', rows: [4, 5], range: 'C4:F5', pair_range: 'A3:F6' },
  validation_errors: [],
  matched_lesson_id: null,
})
export const importBatchFixture = (id = 40): ScheduleImportBatch => ({
  id,
  academic_period_id: 4,
  status: 'uploaded',
  original_filename: 'розклад.xlsx',
  total_rows: 2,
  valid_rows: 0,
  invalid_rows: 1,
  duplicate_rows: 1,
  error_message: null,
  committed_at: null,
  rows: [
    {
      ...importRowFixture(),
      status: 'invalid',
      operation: null,
      subject_name: 'Новий предмет',
      subject_id: null,
      teacher_name: 'Новий викладач',
      teacher_id: null,
      validation_errors: {
        subject_name: ['No owned subject exactly matches this imported name.'],
        teacher_name: ['No owned teacher exactly matches this imported name.'],
      },
    },
    { ...importRowFixture(2), status: 'duplicate', operation: 'noop', matched_lesson_id: 10 },
  ],
})
export function scheduleBackend() {
  const base = planningBackend(),
    academic = base.base.academic
  academic.subjects.push({
    id: 7,
    name: 'Архітектура ПЗ',
    education_institution_id: null,
    code: 'АПЗ',
    color: null,
  })
  academic.teachers.push({ id: 8, name: 'Ірина Коваль', education_institution_id: null })
  academic.periods.push({
    id: 4,
    name: 'Осінній семестр',
    education_institution_id: null,
    starts_on: '2026-11-02',
    ends_on: '2026-11-08',
  })
  const lessons: LessonDetail[] = [
      lessonDetailFixture(),
      {
        ...lessonDetailFixture(10),
        starts_at: '2026-11-02T09:00:00Z',
        ends_at: '2026-11-02T10:20:00Z',
      },
    ],
    deleted = new Set<number>(),
    batches: ScheduleImportBatch[] = [importBatchFixture()]
  const requests: { path: string; method: string; body: Record<string, unknown> }[] = []
  let nextLesson = 20,
    nextBatch = 41,
    changedOnCommit = false,
    uploadFailed = false,
    signedIn = true
  let failure: {
    path: RegExp
    method: string
    status: number
    fields?: Record<string, string[]>
  } | null = null
  const reply = (data: unknown, status = 200) => ({ status, body: { data } })
  const validation = (field: string, message = 'Операція недоступна.') => ({
    status: 422,
    body: { errors: { [field]: [message] } },
  })
  function handle(
    url: string,
    method = 'GET',
    body: Record<string, unknown> = {},
    headers?: HeadersInit,
  ): MockReply {
    const path = new URL(url).pathname
    requests.push({ path, method, body })
    if (path === '/sanctum/csrf-cookie') return { status: 204 }
    if (path === '/api/auth/login' || path === '/api/auth/register') {
      signedIn = true
      return reply(user)
    }
    if (!signedIn) return { status: 401 }
    if (path === '/api/auth/logout') {
      signedIn = false
      return { status: 204 }
    }
    if (failure && failure.path.test(path) && failure.method === method) {
      const f = failure
      failure = null
      return { status: f.status, body: { errors: f.fields ?? {} } }
    }
    if (path === '/api/lessons' && method === 'POST') {
      const value = {
        ...lessonDetailFixture(nextLesson++),
        ...body,
        status: 'active' as const,
        replaces_lesson_id: null,
        replacement_id: null,
      } as LessonDetail
      lessons.push(value)
      return reply(value, 201)
    }
    const target = path.match(/^\/api\/lessons\/(\d+)(?:\/(cancel|replacement))?$/)
    if (target) {
      const lesson = lessons.find((l) => l.id === Number(target[1]) && !deleted.has(l.id))
      if (!lesson) return { status: 404 }
      if (method === 'GET') return reply(lesson)
      if (method === 'PATCH') {
        Object.assign(lesson, body)
        return reply(lesson)
      }
      if (method === 'DELETE') {
        if (lesson.replacement_id) return validation('replacement')
        deleted.add(lesson.id)
        if (lesson.replaces_lesson_id) {
          const original = lessons.find((l) => l.id === lesson.replaces_lesson_id)!
          original.status = 'active'
          original.replacement_id = null
        }
        return { status: 204 }
      }
      if (target[2] === 'cancel') {
        if (lesson.status !== 'active') return validation('status')
        lesson.status = 'cancelled'
        return reply(lesson)
      }
      if (target[2] === 'replacement') {
        if (lesson.status !== 'active' || lesson.replaces_lesson_id || lesson.replacement_id)
          return validation('replacement')
        const replacement = {
          ...lessonDetailFixture(nextLesson++),
          ...body,
          replaces_lesson_id: lesson.id,
          replacement_id: null,
          status: 'active' as const,
        } as LessonDetail
        lesson.status = 'replaced'
        lesson.replacement_id = replacement.id
        lessons.push(replacement)
        return reply(replacement, 201)
      }
    }
    if (path.startsWith('/api/schedule/')) {
      const date = /\/date\//.test(path) ? path.split('/').at(-1)! : '2026-11-02'
      return {
        status: 200,
        body: {
          data: lessons
            .filter((l) => !deleted.has(l.id) && l.status === 'active')
            .map((l) => ({
              id: l.id,
              subject: academic.subjects.find((s) => s.id === l.subject_id) ?? null,
              teacher: academic.teachers.find((t) => t.id === l.teacher_id) ?? null,
              type: l.type,
              room: l.room,
              starts_at: l.starts_at,
              ends_at: l.ends_at,
              replaces_lesson_id: l.replaces_lesson_id,
            })),
          meta: { timezone: user.timezone, start_date: date, end_date: date },
        },
      }
    }
    if (path === '/api/schedule-imports' && method === 'POST') {
      const batch = importBatchFixture(nextBatch++)
      if (uploadFailed) {
        batch.status = 'failed'
        batch.total_rows = 0
        batch.invalid_rows = 0
        batch.duplicate_rows = 0
        batch.rows = []
        batch.error_message = 'Unsupported workbook structure.'
      }
      batches.push(batch)
      return reply(batch, 201)
    }
    const imported = path.match(/^\/api\/schedule-imports\/(\d+)(?:\/(revalidate|commit))?$/)
    if (imported) {
      const batch = batches.find((b) => b.id === Number(imported[1]))
      if (!batch) return { status: 404 }
      if (method === 'GET') return reply(batch)
      if (imported[2] === 'revalidate') {
        if (!['uploaded', 'validated'].includes(batch.status)) return validation('schedule_import')
        const subject = academic.subjects.find((s) => s.name === 'Новий предмет'),
          teacher = academic.teachers.find((t) => t.name === 'Новий викладач')
        if (subject && teacher) {
          batch.rows[0] = {
            ...batch.rows[0]!,
            subject_id: subject.id,
            teacher_id: teacher.id,
            status: 'valid',
            operation: 'create',
            validation_errors: [],
          }
          batch.invalid_rows = 0
          batch.valid_rows = 1
          batch.status = 'validated'
        }
        return reply(batch)
      }
      if (imported[2] === 'commit') {
        if (batch.status === 'committed') return reply(batch)
        if (batch.status !== 'validated') return validation('schedule_import')
        if (changedOnCommit) {
          changedOnCommit = false
          batch.rows[0]!.operation = 'restore'
          batch.rows[0]!.matched_lesson_id = 10
          return {
            status: 409,
            body: {
              data: batch,
              message: 'The import preview changed. Review it and confirm again.',
            },
          }
        }
        batch.status = 'committed'
        batch.committed_at = '2026-10-30T12:00:00Z'
        for (const row of batch.rows)
          if (row.status === 'valid' && row.operation === 'create')
            lessons.push({
              ...lessonDetailFixture(nextLesson++),
              type: 'other',
              subject_id: row.subject_id,
              teacher_id: row.teacher_id,
              room: row.room,
              starts_at: row.starts_at_utc!,
              ends_at: row.ends_at_utc!,
            })
        return reply(batch)
      }
    }
    return base.handle(url, method, body, headers)
  }
  return {
    handle,
    requests,
    base,
    academic,
    lessons,
    batches,
    deleted,
    set failure(v: typeof failure) {
      failure = v
    },
    set changedOnCommit(v: boolean) {
      changedOnCommit = v
    },
    set uploadFailed(v: boolean) {
      uploadFailed = v
    },
    set signedIn(v: boolean) {
      signedIn = v
    },
  }
}
