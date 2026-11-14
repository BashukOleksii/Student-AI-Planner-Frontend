// Fixed public messages/validation templates audited against Backend b1cf1b7 and local validators.
// Changes to the public contract require reviewing this explicit catalog.
import catalog from './publicMessages.json'

const known = new Set(catalog.messages)
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const attributeLabels = Object.values(catalog.attributes).map(escape).join('|')
// Only catalogued templates, known human field labels and bounded numeric/date values.
const validationPatterns = catalog.validationTemplates.flatMap((template) => {
  const tokens = template.match(/:[a-z_]+/g) ?? []
  if (
    tokens.some(
      (token) =>
        ![':attribute', ':min', ':max', ':size', ':digits', ':decimal', ':date'].includes(token),
    )
  )
    return []
  const pattern = escape(template).replace(/:[a-z_]+/g, (token) =>
    token === ':attribute'
      ? `(?:${attributeLabels})`
      : token === ':date'
        ? '[0-9TZ:+. \\-]{1,32}'
        : '[0-9]{1,10}',
  )
  return [new RegExp(`^${pattern}$`, 'u')]
})
export function publicText(
  value: unknown,
  fallback = 'Не вдалося перевірити дані. Оновіть їх і спробуйте ще раз.',
): string {
  return typeof value === 'string' &&
    (known.has(value) || validationPatterns.some((pattern) => pattern.test(value)))
    ? value
    : fallback
}
export function localErrorText(reason: unknown, fallback = 'Перевірте введені дані.'): string {
  return reason instanceof Error
    ? publicText(reason.message, fallback || 'Перевірте введені дані.')
    : fallback || 'Перевірте введені дані.'
}
export function fieldLabel(field: string): string {
  const attributes: Record<string, string> = catalog.attributes
  return attributes[field] ?? attributes[field.split('.')[0] ?? ''] ?? 'Значення'
}
export function publicFieldErrors(fields: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(fields).map(([field, texts]) => [
      field,
      texts.map((text) => publicText(text, `${fieldLabel(field)}: перевірте введене значення.`)),
    ]),
  )
}
export function importDiagnostic(value: unknown): string {
  const fallback = 'Перевірте файл за підтримуваним прикладом і завантажте його знову.'
  if (typeof value === 'string') {
    const location = value.match(
      /^(.*?) \(аркуш «(.*?)», клітинка ([A-Z]{1,3}[1-9][0-9]{0,5})\)\.$/u,
    )
    if (location)
      return `${publicText(location[1], 'Перевірте значення')} (аркуш «${location[2]}», клітинка ${location[3]}).`
  }
  if (typeof value === 'string') {
    const legacy = value.match(/^.*? \(sheet ["'](.*?)["'], cell ([A-Z]{1,3}[1-9][0-9]{0,5})\)\.$/u)
    if (legacy)
      return `Перевірте значення у клітинці ${legacy[2]} на аркуші «${legacy[1]}». ${fallback}`
  }
  const text = publicText(value, '')
  if (text) return text
  // Legacy parser diagnostics carry cell coordinates; do not echo the exception itself.
  const cell =
    typeof value === 'string'
      ? value.match(/(?:cell|клітин(?:ці|ка|ки))\s+[«"']?([A-Z]{1,3}[1-9][0-9]{0,5})\b/iu)?.[1]
      : undefined
  return cell ? `Перевірте значення у клітинці ${cell}. ${fallback}` : fallback
}

export function retryAfterLabel(value: string): string {
  if (/^\d{1,9}$/.test(value)) return `${new Intl.NumberFormat('uk-UA').format(Number(value))} с`
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short', timeStyle: 'short' }).format(date)
    : 'спробуйте пізніше'
}
