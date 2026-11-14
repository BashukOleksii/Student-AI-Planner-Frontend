import { publicText, publicFieldErrors } from '@/utils/publicText'
import { planningMutationSucceeded } from '@/utils/planningMutation'
import type { FieldErrors } from '@/types/api'

const messages: Record<number, string> = {
  0: 'Немає зв’язку із сервером. Перевірте з’єднання та спробуйте ще раз.',
  401: 'Сеанс завершився. Увійдіть знову.',
  403: 'Недостатньо прав для цієї дії.',
  404: 'Запис недоступний або вже видалений.',
  409: 'Не вдалося застосувати зміну через конфлікт. Перевірте поточні дані.',
  410: 'Термін дії цього ресурсу минув.',
  419: 'Не вдалося перевірити сеанс. Відновіть його перед повторною дією.',
  422: 'Перевірте введені дані.',
  429: 'Забагато запитів. Спробуйте пізніше.',
  500: 'Сервер не зміг обробити запит. Спробуйте пізніше.',
  502: 'Сервер тимчасово недоступний.',
  503: 'Сервіс тимчасово недоступний.',
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public fields: FieldErrors = {},
    public retryAfter: string | null = null,
    public code: string | null = null,
    // Only structured 409/410 data is retained; features must narrow it before use. Never rendered generically.
    public conflictData: unknown = undefined,
    publicMessage?: unknown,
  ) {
    super(
      publicText(publicMessage, messages[status] ?? 'Не вдалося виконати запит. Спробуйте ще раз.'),
    )
    this.fields = publicFieldErrors(fields)
    this.name = 'ApiError'
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Не вдалося виконати дію. Спробуйте ще раз.'
}
export function fieldErrors(error: unknown): FieldErrors {
  return error instanceof ApiError ? publicFieldErrors(error.fields) : {}
}
export function isInvalidCredentials(error: unknown): boolean {
  return error instanceof ApiError && error.status === 422 && error.code === 'invalid_credentials'
}
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(
  /\/$/,
  '',
)
let onAuthError: ((status: 401 | 419) => void) | undefined
export function setAuthErrorHandler(handler: typeof onAuthError) {
  onAuthError = handler
}
export function xsrfToken(): string {
  const value = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('XSRF-TOKEN='))
    ?.slice(11)
  try {
    return value ? decodeURIComponent(value) : ''
  } catch {
    return ''
  }
}
function validationFields(body: unknown): FieldErrors {
  if (
    !body ||
    typeof body !== 'object' ||
    !('errors' in body) ||
    !body.errors ||
    typeof body.errors !== 'object'
  )
    return {}
  return Object.fromEntries(
    Object.entries(body.errors).filter(
      (entry): entry is [string, string[]] =>
        Array.isArray(entry[1]) && entry[1].every((v) => typeof v === 'string'),
    ),
  )
}
interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  idempotencyKey?: string
}
export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers = new Headers({ Accept: 'application/json' })
  const multipart = options.body instanceof FormData
  if (options.body !== undefined && !multipart) headers.set('Content-Type', 'application/json')
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
  if (method !== 'GET') {
    const token = xsrfToken()
    if (token) headers.set('X-XSRF-TOKEN', token)
  }
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      credentials: 'include',
      // Sanctum needs the frontend origin even for same-origin GETs. Never send a page query.
      referrer: `${window.location.origin}/`,
      referrerPolicy: 'origin',
      headers,
      signal: options.signal,
      body:
        options.body instanceof FormData
          ? options.body
          : options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
    })
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError'))
      throw error
    throw new ApiError(0)
  }
  if (response.status === 204 && response.ok) {
    planningMutationSucceeded(path, method)
    return undefined as T
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 419) onAuthError?.(response.status)
    const code =
      body &&
      typeof body === 'object' &&
      'code' in body &&
      typeof body.code === 'string' &&
      /^[a-z_]{1,64}$/.test(body.code)
        ? body.code
        : null
    throw new ApiError(
      response.status,
      validationFields(body),
      response.headers.get('Retry-After'),
      code,
      [409, 410].includes(response.status) && body && typeof body === 'object' && 'data' in body
        ? body.data
        : undefined,
      body && typeof body === 'object' && 'message' in body ? body.message : undefined,
    )
  }
  if (body === undefined) throw new ApiError(502)
  planningMutationSucceeded(path, method)
  return body as T
}
// No mutation is retried automatically, including CSRF and network failures.
export const initializeCsrf = () => request<void>('/sanctum/csrf-cookie')
export function query(values: object): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== '') params.set(key, String(value))
  return params.size ? `?${params}` : ''
}
