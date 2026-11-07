import { user } from '../fixtures'
import type { User } from '../../src/types/api'
import type { MockReply } from './f2Backend'

// Deterministic contract fixture shared by component tests and the browser journey; no mail is sent.
export function passwordBackend(initialUser: User | null = null) {
  let currentUser = initialUser ? { ...initialUser } : null
  const requests: { path: string; method: string; body: Record<string, unknown> }[] = []
  let failure: MockReply | null = null
  function handle(url: string, method = 'GET', body: Record<string, unknown> = {}): MockReply {
    const path = new URL(url).pathname
    requests.push({ path, method, body })
    if (path === '/sanctum/csrf-cookie') return { status: 204 }
    if (path === '/api/profile')
      return currentUser ? { status: 200, body: { data: currentUser } } : { status: 401 }
    if (method === 'PATCH' && path === '/api/profile/password') {
      if (failure) {
        const reply = failure
        failure = null
        return reply
      }
      if (!currentUser) return { status: 401 }
      if (body.current_password !== 'old-password')
        return {
          status: 422,
          body: { errors: { current_password: ['Поточний пароль неправильний.'] } },
        }
      return { status: 200, body: { message: 'Password changed successfully.' } }
    }
    if (method === 'POST' && path === '/api/auth/forgot-password')
      return {
        status: 202,
        body: {
          message: 'If the email address is eligible, you will receive a password reset link.',
        },
      }
    if (method === 'POST' && path === '/api/auth/reset-password') {
      if (body.token !== 'fixture-token+encoded/value=')
        return {
          status: 422,
          body: { errors: { token: ['This password reset token is invalid or expired.'] } },
        }
      if (currentUser?.email.toLowerCase() === String(body.email).toLowerCase()) currentUser = null
      return {
        status: 200,
        body: { message: 'Password reset successfully. Sign in with your new password.' },
      }
    }
    if (path === '/api/auth/login' && method === 'POST') {
      currentUser = { ...user, email: String(body.email) }
      return { status: 200, body: { data: currentUser } }
    }
    return { status: 404 }
  }
  return {
    requests,
    handle,
    set failure(reply: MockReply | null) {
      failure = reply
    },
  }
}
