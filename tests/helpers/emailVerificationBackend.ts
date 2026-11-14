import type { User } from '../../src/types/api'
import { user } from '../fixtures'
import { f2Backend, type MockReply } from './f2Backend'

// Test-only opaque link; no real signature, SMTP or mail delivery is involved.
export const verificationPath = `/api/profile/email/verify/1/${'a'.repeat(40)}?expires=2000000000&signature=${'b'.repeat(64)}`
export const verificationPage = (path = verificationPath) =>
  `/verify-email?${new URLSearchParams({ verification_path: path })}`
type Reply = MockReply & { headers?: Record<string, string> }
export function emailVerificationBackend(
  initialUser: User | null = { ...user },
  expectedPath = verificationPath,
) {
  const base = f2Backend()
  let current: User | null = initialUser ? { ...initialUser } : null
  let failure: Reply | null = null
  const requests: { target: string; method: string; body: Record<string, unknown> }[] = []
  function handle(url: string, method = 'GET', body: Record<string, unknown> = {}): Reply {
    const parsed = new URL(url),
      target = parsed.pathname + parsed.search
    requests.push({ target, method, body })
    if (parsed.pathname === '/sanctum/csrf-cookie') return { status: 204 }
    if (target === '/api/auth/login' && method === 'POST') {
      current = { ...user, email: String(body.email) }
      return { status: 200, body: { data: current } }
    }
    if (target === '/api/auth/logout' && method === 'POST') {
      current = null
      return { status: 204 }
    }
    if (target === '/api/profile') {
      if (!current) return { status: 401 }
      if (method === 'PATCH')
        current = {
          ...current,
          ...body,
          email_verified:
            body.email !== undefined && body.email !== current.email
              ? false
              : current.email_verified,
        }
      return { status: 200, body: { data: current } }
    }
    if (
      parsed.pathname === '/api/profile/email/verification-notification' ||
      parsed.pathname.startsWith('/api/profile/email/verify/')
    ) {
      if (method !== 'POST') return { status: 405 }
      if (!current) return { status: 401 }
      if (failure) {
        const reply = failure
        failure = null
        return reply
      }
      if (target === '/api/profile/email/verification-notification')
        return { status: 200, body: { message: 'PRIVATE_SERVICE_TEXT' } }
      if (target !== expectedPath)
        return { status: 403, body: { message: 'PRIVATE_SIGNATURE_ERROR' } }
      current = { ...current, email_verified: true }
      return { status: 200, body: { data: current, message: 'PRIVATE_SERVICE_TEXT' } }
    }
    return base.handle(url, method, body)
  }
  return {
    handle,
    requests,
    get current() {
      return current
    },
    set failure(value: Reply | null) {
      failure = value
    },
  }
}
