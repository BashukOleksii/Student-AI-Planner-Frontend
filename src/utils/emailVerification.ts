import { ApiError } from '@/api/client'

// Decode only the outer wrapper, once. The signed inner query is an opaque string.
export function verificationPathFromLink(fullPath: string): string | null {
  const query = fullPath.includes('?')
    ? fullPath.slice(fullPath.indexOf('?') + 1).split('#')[0]!
    : ''
  const params = new URLSearchParams(query)
  const value = params.get('verification_path')
  if ([...params.keys()].filter((key) => key === 'verification_path').length !== 1) return null
  return validVerificationPath(value) ? value : null
}
export function validVerificationPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[^\x21-\x7e]/.test(value)) return false
  return /^\/api\/profile\/email\/verify\/[1-9][0-9]*\/[a-fA-F0-9]{40}\?(?:expires=[0-9]+&signature=[a-fA-F0-9]{64}|signature=[a-fA-F0-9]{64}&expires=[0-9]+)$/.test(
    value,
  )
}
export function verificationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Потрібно ввійти, щоб підтвердити email.'
    if ([400, 403, 404, 410].includes(error.status))
      return 'Посилання недійсне або прострочене. Увійдіть у потрібний акаунт або запросіть новий лист із профілю.'
    if (error.status === 429) return 'Забагато спроб.'
    if (error.status === 419) return 'Відновіть сеанс і повторіть дію.'
  }
  return 'Сервіс тимчасово недоступний. Спробуйте пізніше.'
}
export function verificationRetrySeconds(value: string | null, now = Date.now()): number {
  if (!value) return 0
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)
      ? (Date.parse(value) - now) / 1000
      : 0
  return Number.isFinite(seconds) ? Math.min(86400, Math.max(0, Math.ceil(seconds))) : 0
}
