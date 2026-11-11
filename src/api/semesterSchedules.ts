import { ApiError, request } from './client'
import {
  arrayOf,
  dateException,
  managementState,
  parseManagement,
  parseOccurrences,
  record,
  semester,
  suppression,
  weeklyRule,
} from './semesterPayloads'
import type {
  DateExceptionInput,
  Parity,
  ScheduleToken,
  SemesterSettings,
  Weekday,
  WeeklyRuleInput,
} from '@/types/semesterSchedule'

const collection = '/api/semester-schedules'
const schedule = (id: number) => `${collection}/${id}`
const rules = (id: number) => `${schedule(id)}/weekly-rules`
const exceptions = (id: number) => `${schedule(id)}/date-exceptions`
const slots = (id: number) => `${schedule(id)}/suppressed-slots`
const exception = (id: number, date: string) => `${exceptions(id)}/${encodeURIComponent(date)}`
const confirmation = (schedule_token: ScheduleToken, confirmed: true) => ({
  schedule_token,
  confirmed,
})
async function read<T>(path: string, check: (data: unknown) => data is T, signal?: AbortSignal) {
  const result = await request<unknown>(path, { signal })
  if (!record(result) || !check(result.data)) throw new ApiError(502)
  return result.data
}
async function managed<T>(
  path: string,
  check: (data: unknown) => data is T,
  id?: number,
  options?: Parameters<typeof request>[1],
) {
  return parseManagement(await request<unknown>(path, options), check, id)
}
function write(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body: object,
  id?: number,
) {
  return managed(path, managementState, id, { method, body })
}

export const semesterSchedulesApi = {
  list: (signal?: AbortSignal) => read(collection, arrayOf(semester), signal),
  async get(id: number, signal?: AbortSignal) {
    const result = await read(schedule(id), semester, signal)
    if (result.id !== id) throw new ApiError(502)
    return result
  },
  async occurrences(id: number, mode: 'date' | 'week', date: string, signal?: AbortSignal) {
    const response = await request<unknown>(`${schedule(id)}/${mode}/${encodeURIComponent(date)}`, {
      signal,
    })
    const result = parseOccurrences(response, id, date)
    if (mode === 'date' && (result.meta.start_date !== date || result.meta.end_date !== date))
      throw new ApiError(502)
    return result
  },
  management: (id: number, signal?: AbortSignal) =>
    managed(`${schedule(id)}/management`, managementState, id, { signal }),
  create: (body: SemesterSettings & { academic_period_id: number }) =>
    write(collection, 'POST', body),
  update: (id: number, schedule_token: ScheduleToken, body: Partial<SemesterSettings>) =>
    write(schedule(id), 'PATCH', { ...body, schedule_token }, id),
  remove: (id: number, token: ScheduleToken, confirmed: true) =>
    request<{ message: string }>(schedule(id), {
      method: 'DELETE',
      body: confirmation(token, confirmed),
    }),
  rules: (id: number, signal?: AbortSignal) =>
    managed(rules(id), arrayOf(weeklyRule), id, { signal }),
  rule: (id: number, ruleId: number, signal?: AbortSignal) =>
    managed(`${rules(id)}/${ruleId}`, weeklyRule, id, { signal }),
  createRule: (id: number, schedule_token: ScheduleToken, body: WeeklyRuleInput) =>
    write(rules(id), 'POST', { ...body, schedule_token }, id),
  updateRule: (
    id: number,
    ruleId: number,
    schedule_token: ScheduleToken,
    body: Partial<WeeklyRuleInput>,
  ) => write(`${rules(id)}/${ruleId}`, 'PATCH', { ...body, schedule_token }, id),
  removeRule: (id: number, ruleId: number, token: ScheduleToken, confirmed: true) =>
    write(`${rules(id)}/${ruleId}`, 'DELETE', confirmation(token, confirmed), id),
  exceptions: (id: number, signal?: AbortSignal) =>
    managed(exceptions(id), arrayOf(dateException), id, { signal }),
  exception: (id: number, date: string, signal?: AbortSignal) =>
    managed(exception(id, date), dateException, id, { signal }),
  saveException: (
    id: number,
    date: string,
    schedule_token: ScheduleToken,
    body: DateExceptionInput,
  ) => write(exception(id, date), 'PUT', { ...body, schedule_token }, id),
  removeException: (id: number, date: string, token: ScheduleToken, confirmed: true) =>
    write(exception(id, date), 'DELETE', confirmation(token, confirmed), id),
  createSaturday: (
    id: number,
    schedule_token: ScheduleToken,
    occurs_on: string,
    copied_weekday: Weekday,
    source_week_parity: Parity,
    selected_weekly_rule_ids: number[],
  ) =>
    write(
      `${schedule(id)}/working-saturdays`,
      'POST',
      { schedule_token, occurs_on, copied_weekday, source_week_parity, selected_weekly_rule_ids },
      id,
    ),
  suppressions: (id: number, signal?: AbortSignal) =>
    managed(slots(id), arrayOf(suppression), id, { signal }),
  releaseSuppression: (id: number, slotId: number, token: ScheduleToken, confirmed: true) =>
    write(`${slots(id)}/${slotId}`, 'DELETE', confirmation(token, confirmed), id),
}
