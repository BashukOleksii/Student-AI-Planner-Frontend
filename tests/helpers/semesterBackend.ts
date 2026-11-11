import { Temporal } from '@js-temporal/polyfill'
import { scheduleBackend } from './scheduleBackend'
import type { MockReply } from './f2Backend'
import type {
  DateExceptionInput,
  ImportCounts,
  ImportOperation,
  ImportPreviewRow,
  LessonDefinitionInput,
  ManagementResponse,
  ScheduleDateException,
  SemesterManagementState,
  SemesterOccurrence,
  SemesterSchedule,
  SemesterScheduleImport,
  SemesterSettings,
  SnapshotLesson,
  WeeklyLessonRule,
  WeeklyRuleInput,
} from '@/types/semesterSchedule'

export const monday = '2026-11-02'
export const tuesday = '2026-11-03'
export const saturday = '2026-11-07'
export const semesterPath = '/api/semester-schedules'
export const importPath = '/api/semester-schedule-imports'
export const revision = (number: number) => number.toString(16).padStart(64, '0')
export const institution = { id: 3, name: 'Державний університет' }
export const academicPeriod = {
  id: 5,
  name: 'Осінь 2026',
  starts_on: monday,
  ends_on: '2026-11-29',
}
export const semester: SemesterSchedule = {
  id: 1,
  academic_period: academicPeriod,
  education_institution: institution,
  group_name: 'ПІ-231',
  parity_anchor_on: monday,
  first_week_parity: 'numerator',
}
export const math = { id: 21, name: 'Семестрова математика', code: 'МАТ', color: null }
export const physics = { id: 22, name: 'Семестрова фізика', code: null, color: null }
export const teacher = { id: 23, name: 'Ірина Савчук' }
export const weekly: WeeklyLessonRule = {
  id: 11,
  weekday: 1,
  week_pattern: 'all',
  pair_number: 1,
  pair_label: '1-2',
  lesson_type: null,
  subject: math,
  teacher,
  room: '301',
  starts_at_local: '08:30:00',
  ends_at_local: '09:50:00',
  is_manually_managed: false,
  semester_schedule_import_id: 40,
}
const second: WeeklyLessonRule = {
  ...weekly,
  id: 12,
  pair_number: 2,
  pair_label: '3-4',
  subject: physics,
  starts_at_local: '10:00:00',
  ends_at_local: '11:20:00',
  is_manually_managed: true,
  semester_schedule_import_id: null,
}
const numerator: WeeklyLessonRule = {
  ...weekly,
  id: 13,
  weekday: 2,
  week_pattern: 'numerator',
  pair_number: 4,
  pair_label: '7-8',
}
const denominator: WeeklyLessonRule = {
  ...numerator,
  id: 14,
  week_pattern: 'denominator',
  subject: physics,
}
const definition = (rule: WeeklyLessonRule | SnapshotLesson): LessonDefinitionInput => ({
  pair_number: rule.pair_number,
  pair_label: rule.pair_label,
  subject_id: rule.subject.id,
  teacher_id: rule.teacher?.id ?? 0,
  lesson_type: rule.lesson_type,
  room: rule.room,
  starts_at_local: rule.starts_at_local,
  ends_at_local: rule.ends_at_local,
})
const ruleInput = (rule: WeeklyLessonRule): WeeklyRuleInput => ({
  ...definition(rule),
  weekday: rule.weekday,
  week_pattern: rule.week_pattern,
})
const counts: ImportCounts = { create: 1, update: 1, delete: 1, noop: 1, preserve: 1, duplicate: 1 }
const operation = (
  operation: ImportOperation['operation'],
  rule: WeeklyLessonRule,
  after?: WeeklyRuleInput,
): ImportOperation => ({
  operation,
  rule_id: operation === 'create' ? null : rule.id,
  import_key: `${rule.weekday}:${rule.pair_number}:${rule.week_pattern}`,
  before: operation === 'create' ? null : ruleInput(rule),
  after: operation === 'delete' ? null : (after ?? ruleInput(rule)),
})
const previewRow = (
  row_number: number,
  rule: WeeklyLessonRule,
  op: ImportPreviewRow['operation'],
): ImportPreviewRow => ({
  row_number,
  weekday: rule.weekday,
  pair_number: rule.pair_number,
  pair_label: rule.pair_label,
  week_pattern: rule.week_pattern,
  subject_name: rule.subject.name,
  subject: rule.subject,
  teacher_name: rule.teacher?.name ?? '',
  teacher: rule.teacher,
  room: rule.room,
  starts_at_local: rule.starts_at_local,
  ends_at_local: rule.ends_at_local,
  source: { worksheet: 'Розклад', rows: [3, 4], range: 'D3:F4', pair_range: 'B2:F5' },
  import_key: `${rule.weekday}:${rule.pair_number}:${rule.week_pattern}`,
  operation: op,
  matched_rule_id: op === 'create' || op === 'duplicate' ? null : rule.id,
  errors: [],
})
export const missingSubject = 'Новий предмет із Excel'
const importedSubject = { id: 24, name: missingSubject, code: null, color: null }
export function importFixture(ready = true): SemesterScheduleImport {
  const imported = {
    ...weekly,
    id: 25,
    weekday: 3 as const,
    subject: importedSubject,
  }
  const created = previewRow(1, imported, 'create')
  return {
    id: 41,
    academic_period_id: academicPeriod.id,
    original_filename: 'розклад.xlsx',
    status: ready ? 'ready' : 'invalid',
    parity_anchor_on: monday,
    first_week_parity: 'denominator',
    preview_token: revision(50),
    can_commit: ready,
    preview: {
      rows: [
        ready
          ? created
          : {
              ...created,
              operation: null,
              subject: null,
              errors: { subject_name: ['No owned subject exactly matches this imported name.'] },
            },
        previewRow(2, { ...weekly, room: '302' }, 'update'),
        previewRow(3, second, 'preserve'),
        previewRow(4, numerator, 'noop'),
        previewRow(5, numerator, 'duplicate'),
      ],
      operations: [
        ...(ready ? [operation('create', imported)] : []),
        operation('update', weekly, { ...ruleInput(weekly), room: '302' }),
        operation('preserve', second),
        operation('noop', numerator),
        operation('delete', denominator),
      ],
      counts: { ...counts, create: ready ? 1 : 0 },
      errors: [],
      impact: {
        schedule: {
          id: 1,
          before: semester,
          after: {
            group_name: 'ПІ-231 Excel',
            parity_anchor_on: monday,
            first_week_parity: 'denominator',
          },
        },
        preserved_rule_ids: [second.id],
        preserved_exception_dates: ['2026-11-04', saturday],
        suppressed_slots: [],
        detached_snapshot_references: [
          { occurs_on: saturday, snapshot_lesson_id: 101, source_weekly_rule_id: denominator.id },
        ],
      },
    },
    receipt: null,
    committed_at: null,
  }
}

export function semesterBackend(
  options: { empty?: boolean; savedDays?: boolean; readyImport?: boolean } = {},
) {
  const legacy = scheduleBackend()
  const academic = legacy.base.base.academic
  academic.institutions.push(institution)
  academic.periods.push({ ...academicPeriod, education_institution_id: institution.id })
  academic.subjects.push(
    ...[math, physics].map((item) => ({ ...item, education_institution_id: null })),
  )
  academic.teachers.push({ ...teacher, education_institution_id: null })
  const timezone = 'Europe/Kyiv'
  const data: SemesterManagementState = {
    schedule: { ...semester },
    weekly_rules: options.empty ? [] : structuredClone([weekly, second, numerator, denominator]),
    date_exceptions: [],
    suppressed_slots: [],
  }
  let sequence = 1
  let nextRule = 30
  let nextSnapshotLesson = 100
  let nextException = 90
  let exists = !options.empty
  const alternate = {
    ...semester,
    id: 2,
    group_name: 'ПІ-232',
    academic_period: { ...academicPeriod, id: 6 },
  }
  if (options.readyImport)
    academic.subjects.push({ ...importedSubject, education_institution_id: null })
  const batch = importFixture(options.readyImport ?? false)
  const requests: { path: string; method: string; body: Record<string, unknown> }[] = []
  let overlaps = false
  let staleCommit = false
  let malformedConflict = false
  let loseCommit = false
  let failRecovery = false
  let signedIn = true
  let failure: { path: string; method: string; result: MockReply } | undefined

  const reply = (data: unknown, status = 200) => ({ status, body: { data } })
  const missing = { status: 404, body: { message: 'Not found.' } }
  const validation = (field: string, message: string) => ({
    status: 422,
    body: { message, errors: { [field]: [message] } },
  })
  const meta = (id = 1) => ({
    schedule_token: revision(sequence),
    semester_schedule_id: id,
    timezone,
  })
  function managed(value: unknown = data, status = 200, id = 1) {
    return { status, body: { data: value, meta: meta(id) } }
  }
  function changed(status = 200) {
    sequence++
    return managed(data, status)
  }
  function snapshotLesson(
    input: LessonDefinitionInput,
    id = nextSnapshotLesson++,
    source: number | null = null,
  ): SnapshotLesson {
    return {
      id,
      pair_number: input.pair_number,
      pair_label: input.pair_label,
      lesson_type: input.lesson_type,
      starts_at_local: input.starts_at_local,
      ends_at_local: input.ends_at_local,
      room: input.room,
      subject: [math, physics].find((item) => item.id === input.subject_id) ?? math,
      teacher: input.teacher_id ? teacher : null,
      source_weekly_rule_id: source,
    }
  }
  if (options.savedDays)
    data.date_exceptions.push(
      {
        id: 80,
        occurs_on: '2026-11-04',
        kind: 'replacement',
        copied_weekday: null,
        lessons: [snapshotLesson({ ...definition(second), room: 'Заміна' }, 100)],
      },
      {
        id: 81,
        occurs_on: saturday,
        kind: 'working_saturday',
        copied_weekday: 1,
        lessons: [snapshotLesson({ ...definition(weekly), room: 'Суботня' }, 101, denominator.id)],
      },
    )
  if (options.savedDays) nextSnapshotLesson = 102
  const plain = (date: string) => Temporal.PlainDate.from(date)
  function baseDay(date: string) {
    const weekday = plain(date).dayOfWeek
    const parity = plain(date).since(plain(monday)).days < 7 ? 'numerator' : 'denominator'
    return data.weekly_rules.filter(
      (item) =>
        item.weekday === weekday && (item.week_pattern === 'all' || item.week_pattern === parity),
    )
  }
  function effective(date: string, scheduleId = 1): SemesterOccurrence[] {
    if (date < academicPeriod.starts_on || date > academicPeriod.ends_on || scheduleId !== 1)
      return []
    const snapshot = data.date_exceptions.find((item) => item.occurs_on === date)
    return (snapshot?.lessons ?? baseDay(date)).map((item) => ({
      occurrence_id: `semester:${scheduleId}:${date}:${snapshot ? 'snapshot' : 'rule'}:${item.id}`,
      occurs_on: date,
      source: snapshot?.kind ?? 'base',
      weekly_lesson_rule_id: snapshot ? null : item.id,
      schedule_date_exception_id: snapshot?.id ?? null,
      pair_number: item.pair_number,
      pair_label: item.pair_label,
      lesson_type: item.lesson_type,
      subject: item.subject,
      teacher: item.teacher,
      room: item.room,
      starts_at: `${date}T${item.starts_at_local}+02:00`,
      ends_at: `${date}T${item.ends_at_local}+02:00`,
    }))
  }
  function management(path: string, method: string, body: Record<string, unknown>): MockReply {
    if (path === semesterPath) {
      if (method === 'GET')
        return reply(exists ? [data.schedule, ...(overlaps ? [alternate] : [])] : [])
      if (exists)
        return validation(
          'academic_period_id',
          'A semester schedule already exists for this academic period.',
        )
      const { group_name, parity_anchor_on, first_week_parity } =
        body as unknown as SemesterSettings
      data.schedule = { ...data.schedule, group_name, parity_anchor_on, first_week_parity }
      exists = true
      return changed(201)
    }
    const match = path.match(/^\/api\/semester-schedules\/(\d+)(?:\/(.*))?$/)
    if (!match || !exists) return missing
    const id = Number(match[1])
    const suffix = match[2] ?? ''
    if (id !== 1 && !(id === 2 && overlaps)) return missing
    if (method === 'GET') {
      if (!suffix) return reply(id === 1 ? data.schedule : alternate)
      if (suffix === 'management') return managed()
      if (suffix === 'weekly-rules') return managed(id === 1 ? data.weekly_rules : [], 200, id)
      if (suffix === 'date-exceptions')
        return managed(id === 1 ? data.date_exceptions : [], 200, id)
      if (suffix === 'suppressed-slots') return managed(data.suppressed_slots)
      if (suffix.startsWith('weekly-rules/')) {
        const rule = data.weekly_rules.find((item) => item.id === Number(suffix.split('/')[1]))
        return rule ? managed(rule) : missing
      }
      if (suffix.startsWith('date-exceptions/')) {
        const exception = data.date_exceptions.find(
          (item) => item.occurs_on === suffix.split('/')[1],
        )
        return exception ? managed(exception) : missing
      }
      const read = suffix.match(/^(date|week)\/(\d{4}-\d{2}-\d{2})$/)
      if (read) {
        const day = plain(read[2]!)
        const start = read[1] === 'date' ? day : day.subtract({ days: day.dayOfWeek - 1 })
        const days = Array.from({ length: read[1] === 'date' ? 1 : 7 }, (_, index) =>
          start.add({ days: index }).toString(),
        )
        return {
          status: 200,
          body: {
            data: days.flatMap((date) => effective(date, id)),
            meta: {
              timezone,
              semester_schedule_id: id,
              start_date: days[0],
              end_date: days.at(-1),
            },
          },
        }
      }
      return missing
    }
    if (body.schedule_token !== meta().schedule_token)
      return {
        status: 409,
        body: {
          message: 'The semester schedule changed. Reload its management state before retrying.',
        },
      }
    if (method === 'DELETE' && body.confirmed !== true)
      return validation('confirmed', 'Explicit confirmation is required.')
    if (!suffix && method === 'PATCH') {
      const { group_name, parity_anchor_on, first_week_parity } = body as Partial<SemesterSettings>
      Object.assign(data.schedule, {
        group_name: group_name ?? data.schedule.group_name,
        parity_anchor_on: parity_anchor_on ?? data.schedule.parity_anchor_on,
        first_week_parity: first_week_parity ?? data.schedule.first_week_parity,
      })
      return changed()
    }
    if (!suffix && method === 'DELETE') {
      if (
        data.weekly_rules.length ||
        data.date_exceptions.length ||
        data.suppressed_slots.length ||
        batch.receipt
      )
        return validation(
          'semester_schedule',
          'Remove rules, date exceptions and suppressed slots explicitly first. A schedule with semester import history cannot be deleted.',
        )
      exists = false
      return { status: 200, body: { message: 'The empty semester schedule was deleted.' } }
    }
    if (suffix.startsWith('weekly-rules')) {
      const rule = data.weekly_rules.find((item) => item.id === Number(suffix.split('/')[1]))
      if (method === 'DELETE' && rule) {
        const { weekday, pair_number, week_pattern } = rule
        data.suppressed_slots.push({ id: 70, weekday, pair_number, week_pattern })
        data.weekly_rules = data.weekly_rules.filter((item) => item.id !== rule.id)
        for (const exception of data.date_exceptions)
          for (const lesson of exception.lessons) {
            if (lesson.source_weekly_rule_id === rule.id) lesson.source_weekly_rule_id = null
          }
        return changed()
      }
      if (method === 'POST' || (method === 'PATCH' && rule)) {
        const input = { ...(rule ? ruleInput(rule) : {}), ...body } as unknown as WeeklyRuleInput
        const {
          id: _snapshotId,
          source_weekly_rule_id: _source,
          ...fields
        } = snapshotLesson(input, 1)
        const item: WeeklyLessonRule = {
          ...fields,
          id: rule?.id ?? nextRule++,
          weekday: input.weekday,
          week_pattern: input.week_pattern,
          is_manually_managed: true,
          semester_schedule_import_id: rule?.semester_schedule_import_id ?? null,
        }
        if (rule) Object.assign(rule, item)
        else data.weekly_rules.push(item)
        return changed(rule ? 200 : 201)
      }
    }
    if (suffix.startsWith('suppressed-slots/') && method === 'DELETE') {
      const slot = Number(suffix.split('/')[1])
      if (!data.suppressed_slots.some((item) => item.id === slot)) return missing
      data.suppressed_slots = data.suppressed_slots.filter((item) => item.id !== slot)
      return changed()
    }
    if (suffix.startsWith('date-exceptions/')) {
      const date = suffix.split('/')[1]!
      const existing = data.date_exceptions.find((item) => item.occurs_on === date)
      if (method === 'DELETE' && existing) {
        data.date_exceptions = data.date_exceptions.filter((item) => item.id !== existing.id)
        return changed()
      }
      if (method === 'PUT') {
        const input = body as unknown as DateExceptionInput
        const lessons =
          input.mode === 'replace'
            ? input.lessons.map((item) =>
                snapshotLesson(
                  item,
                  item.id,
                  existing?.lessons.find((row) => row.id === item.id)?.source_weekly_rule_id ??
                    null,
                ),
              )
            : [
                ...baseDay(date).flatMap((item) => {
                  const patch = input.changes.find(
                    (change) => change.weekly_lesson_rule_id === item.id,
                  )
                  return patch?.cancelled
                    ? []
                    : [snapshotLesson({ ...definition(item), ...patch }, undefined, item.id)]
                }),
                ...input.lessons.map((item) => snapshotLesson(item)),
              ]
        if (existing) existing.lessons = lessons
        else
          data.date_exceptions.push({
            id: nextException++,
            occurs_on: date,
            kind: 'replacement',
            copied_weekday: null,
            lessons,
          })
        return changed()
      }
    }
    if (suffix === 'working-saturdays' && method === 'POST') {
      const date = String(body.occurs_on)
      const weekday = body.copied_weekday as NonNullable<ScheduleDateException['copied_weekday']>
      const source = plain(date)
        .add({ days: weekday - 6 })
        .toString()
      if (data.date_exceptions.some((item) => item.occurs_on === date))
        return {
          status: 409,
          body: { message: 'A date exception already exists for this Saturday.' },
        }
      const sourceDay = data.date_exceptions.find((item) => item.occurs_on === source)
      const selectedIds = body.selected_weekly_rule_ids
      const sourceLessons = Array.isArray(selectedIds)
        ? data.weekly_rules.filter(
            (item) =>
              selectedIds.includes(item.id) &&
              item.weekday === weekday &&
              (item.week_pattern === 'all' || item.week_pattern === body.source_week_parity),
          )
        : (sourceDay?.lessons ?? baseDay(source))
      const lessons = sourceLessons.map((item) =>
        snapshotLesson(
          definition(item),
          undefined,
          'source_weekly_rule_id' in item ? item.source_weekly_rule_id : item.id,
        ),
      )
      data.date_exceptions.push({
        id: nextException++,
        occurs_on: date,
        kind: 'working_saturday',
        copied_weekday: weekday,
        source_week_parity:
          body.source_week_parity === 'numerator' || body.source_week_parity === 'denominator'
            ? body.source_week_parity
            : null,
        lessons,
      })
      return changed(201)
    }
    return missing
  }
  function importReply(path: string, method: string, body: Record<string, unknown>): MockReply {
    if (path === importPath && method === 'POST') {
      batch.parity_anchor_on = monday
      batch.first_week_parity = 'numerator'
      return reply(batch, 201)
    }
    if (path === `${importPath}/41` && method === 'GET') {
      if (failRecovery) return { status: 503, body: { message: 'unavailable' } }
      return reply(batch)
    }
    if (path === `${importPath}/41/revalidate` && method === 'POST') {
      const catalog = academic.subjects.find((item) => item.name === missingSubject)
      const ready = !!catalog || batch.can_commit
      const result = importFixture(ready)
      if (catalog && result.preview.rows[0] && result.preview.operations[0]?.after) {
        result.preview.rows[0].subject = {
          id: catalog.id,
          name: catalog.name,
          code: null,
          color: null,
        }
        result.preview.operations[0].after.subject_id = catalog.id
      }
      batch.status = result.status
      batch.can_commit = result.can_commit
      batch.preview = result.preview
      batch.preview_token = revision(++sequence + 50)
      return reply(batch)
    }
    if (path === `${importPath}/41/commit` && method === 'POST') {
      if (body.confirmed !== true)
        return validation('confirmed', 'Explicit confirmation is required.')
      if (staleCommit || malformedConflict || body.preview_token !== batch.preview_token) {
        staleCommit = false
        batch.preview_token = revision(++sequence + 50)
        if (batch.preview.impact)
          batch.preview.impact.schedule.after.group_name = 'ПІ-231 оновлений огляд'
        return {
          status: 409,
          body: {
            data: malformedConflict ? { id: 999, preview_token: batch.preview_token } : batch,
            message: 'The import preview changed. Review it and confirm again.',
          },
        }
      }
      if (batch.status === 'committed') return reply(batch)
      if (!batch.can_commit)
        return validation('semester_import', 'This import preview is not ready to commit.')
      const committed_at = '2026-11-02T12:00:00.123456Z'
      batch.status = 'committed'
      batch.can_commit = false
      batch.committed_at = committed_at
      batch.receipt = { semester_schedule_id: 1, counts, rule_ids: [11, 12, 13, 25], committed_at }
      if (loseCommit) return { status: 502, body: { message: 'upstream' } }
      return reply(batch)
    }
    return missing
  }
  return {
    data,
    batch,
    requests,
    legacy,
    set overlaps(value: boolean) {
      overlaps = value
    },
    set staleCommit(value: boolean) {
      staleCommit = value
    },
    set malformedConflict(value: boolean) {
      malformedConflict = value
    },
    set loseCommit(value: boolean) {
      loseCommit = value
    },
    set failRecovery(value: boolean) {
      failRecovery = value
    },
    set signedIn(value: boolean) {
      signedIn = value
    },
    change: () => sequence++,
    get token() {
      return meta().schedule_token
    },
    get response(): ManagementResponse {
      return { data, meta: meta() }
    },
    fail(path: string, method: string, result: MockReply) {
      failure = { path, method, result }
    },
    handle(
      url: string,
      method = 'GET',
      body: Record<string, unknown> = {},
      headers?: HeadersInit,
    ): MockReply {
      const path = new URL(url).pathname
      requests.push({ path, method, body })
      if (path !== '/sanctum/csrf-cookie' && !signedIn)
        return { status: 401, body: { message: 'Unauthenticated.' } }
      if (failure?.path === path && failure.method === method) {
        const result = failure.result
        failure = undefined
        return result
      }
      if (path.startsWith(semesterPath)) return management(path, method, body)
      if (path.startsWith(importPath)) return importReply(path, method, body)
      return legacy.handle(url, method, body, headers)
    },
  }
}
