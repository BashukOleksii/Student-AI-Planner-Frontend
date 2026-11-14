import { ApiError, request } from './client'
import type { Resource, User } from '@/types/api'
import { validVerificationPath } from '@/utils/emailVerification'

export const emailVerificationApi = {
  send: (signal?: AbortSignal) =>
    request<unknown>('/api/profile/email/verification-notification', {
      method: 'POST',
      body: {},
      signal,
    }),
  async confirm(path: string, signal?: AbortSignal): Promise<Resource<User>> {
    if (!validVerificationPath(path)) throw new ApiError(400)
    // request() appends the path to the configured origin; it does not add /api or rebuild query.
    const result = await request<Resource<User>>(path, { method: 'POST', body: {}, signal })
    const account = result?.data
    if (
      !account ||
      !Number.isSafeInteger(account.id) ||
      account.id < 1 ||
      typeof account.name !== 'string' ||
      typeof account.email !== 'string' ||
      typeof account.timezone !== 'string' ||
      account.email_verified !== true
    )
      throw new ApiError(502)
    return result
  },
}
