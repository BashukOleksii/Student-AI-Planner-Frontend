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
  return (
    (status === 'pending' || status === 'missed') && !!deadline && Date.parse(deadline) < Date.now()
  )
}
export function browserTimezone() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  // Some browser ICU versions still return the retired Ukrainian spelling.
  return timezone === 'Europe/Kiev' ? 'Europe/Kyiv' : timezone
}

// Task deadlines are entered explicitly, independently of browser date formatting.
export function taskDeadlineInput(value: string | null, timezone: string) {
  if (!value) return ''
  const local = Temporal.Instant.from(value).toZonedDateTimeISO(timezone)
  return `${String(local.day).padStart(2, '0')}.${String(local.month).padStart(2, '0')}.${String(local.year).padStart(4, '0')} ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`
}
export function taskDeadlineUtc(value: string, timezone: string) {
  if (!value.trim()) return null
  const match = /^(\d{2})\.(\d{2})\.(\d{4}) ([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) throw new Error('Укажіть дату ДД.ММ.РРРР та час ГГ:ХХ (00:00–23:59).')
  const [, day, month, year, hour, minute] = match
  try {
    if (Number(year) < 1000) throw new Error()
    Temporal.PlainDate.from(
      { year: Number(year), month: Number(month), day: Number(day) },
      { overflow: 'reject' },
    )
  } catch {
    throw new Error('Укажіть дійсну календарну дату від 1000 до 9999 року.')
  }
  return toUtc(`${year}-${month}-${day}T${hour}:${minute}`, timezone)
}
