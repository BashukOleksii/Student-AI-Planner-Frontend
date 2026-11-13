import { beforeEach, expect, it, vi } from 'vitest'
import { completeWork } from '@/api/workCompletion'
import { request } from '@/api/client'
vi.mock('@/api/client', () => ({ request: vi.fn() }))
beforeEach(() => vi.resetAllMocks())
it('reviews zero sessions and submits the exact server token without a dialog', async () => {
  const confirm = vi.spyOn(window, 'confirm')
  vi.mocked(request)
    .mockResolvedValueOnce({ future_sessions_count: 0, completion_token: 'zero' })
    .mockResolvedValueOnce({ data: {} })
  await completeWork('/api/tasks/1')
  expect(confirm).not.toHaveBeenCalled()
  expect(request).toHaveBeenLastCalledWith('/api/tasks/1/complete', {
    method: 'POST',
    body: { completion_token: 'zero' },
    signal: undefined,
  })
})
it('shows server consequences before writing and never retries a stale POST', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(request)
    .mockResolvedValueOnce({
      future_sessions_count: 2,
      completion_token: 'set',
      message: 'Ще 2 сесії',
    })
    .mockRejectedValueOnce(new Error('stale'))
  await expect(completeWork('/api/tasks/1/subtasks/2')).rejects.toThrow('stale')
  expect(window.confirm).toHaveBeenCalledWith('Ще 2 сесії')
  expect(request).toHaveBeenCalledTimes(2)
})
it('does not write when consent is declined', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  vi.mocked(request).mockResolvedValueOnce({
    future_sessions_count: 2,
    completion_token: 'set',
    message: 'Ще 2 сесії',
  })
  await expect(completeWork('/api/tasks/1')).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(1)
})

it('requires fresh explicit consent after a stale set, even when the count stays the same', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(request)
    .mockResolvedValueOnce({
      future_sessions_count: 2,
      completion_token: 'first',
      message: '2 сесії',
    })
    .mockRejectedValueOnce(new Error('stale set'))
    .mockResolvedValueOnce({
      future_sessions_count: 2,
      completion_token: 'replacement',
      message: '2 сесії',
    })
    .mockResolvedValueOnce({ data: {} })
  await expect(completeWork('/api/tasks/1')).rejects.toThrow('stale set')
  expect(request).toHaveBeenCalledTimes(2)
  await completeWork('/api/tasks/1')
  expect(window.confirm).toHaveBeenCalledTimes(2)
  expect(request).toHaveBeenLastCalledWith('/api/tasks/1/complete', {
    method: 'POST',
    body: { completion_token: 'replacement' },
    signal: undefined,
  })
})
