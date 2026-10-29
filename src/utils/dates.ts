import { Temporal } from '@js-temporal/polyfill'
export function today(timezone: string) {
  return Temporal.Now.plainDateISO(timezone).toString()
}
export function addDays(date: string, days: number) {
  return Temporal.PlainDate.from(date).add({ days }).toString()
}
export function monthStart(date: string) {
  return Temporal.PlainDate.from(date).with({ day: 1 }).toString()
}
export function calendarLabel(date: string) {
  return Temporal.PlainDate.from(date).toLocaleString('uk-UA', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  })
}
export function dateTime(value: string | null, timezone: string) {
  return value
    ? new Intl.DateTimeFormat('uk-UA', {
        timeZone: timezone,
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : 'Без дедлайну'
}
export function time(value: string, timezone: string) {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
export function localDate(value: string, timezone: string) {
  return Temporal.Instant.from(value).toZonedDateTimeISO(timezone).toPlainDate().toString()
}
export function localEndDate(value: string, timezone: string) {
  return Temporal.Instant.from(value)
    .subtract({ nanoseconds: 1 })
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString()
}
export function toLocalInput(value: string | null, timezone: string) {
  return value
    ? Temporal.Instant.from(value)
        .toZonedDateTimeISO(timezone)
        .toPlainDateTime()
        .toString({ smallestUnit: 'second' })
    : ''
}
export function toUtc(value: string, timezone: string): string | null {
  if (!value) return null
  // Reject ambiguous and nonexistent wall times rather than silently moving a deadline.
  try {
    return Temporal.PlainDateTime.from(value)
      .toZonedDateTime(timezone, { disambiguation: 'reject' })
      .toInstant()
      .toString({ smallestUnit: 'second' })
  } catch {
    throw new Error(
      'Цей місцевий час не існує або повторюється через переведення годинника. Виберіть інший час.',
    )
  }
}
export function isOverdue(deadline: string | null, status: string) {
  return status === 'pending' && !!deadline && Date.parse(deadline) < Date.now()
}
export function browserTimezone() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  // Some browser ICU versions still return the retired Ukrainian spelling.
  return timezone === 'Europe/Kiev' ? 'Europe/Kyiv' : timezone
}
