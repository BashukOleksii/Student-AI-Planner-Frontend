import { onScopeDispose, ref } from 'vue'
import { ApiError } from '@/api/client'
import { verificationErrorMessage, verificationRetrySeconds } from '@/utils/emailVerification'

// Shared presentation of the two verification endpoints; no automatic network retries.
export function useEmailVerificationFeedback() {
  const message = ref(''),
    status = ref<number | null>(null),
    retryIn = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined
  function stop() {
    if (timer) clearInterval(timer)
    timer = undefined
  }
  function clearError() {
    message.value = ''
    status.value = null
  }
  function fail(error: unknown) {
    clearError()
    status.value = error instanceof ApiError ? error.status : null
    message.value = verificationErrorMessage(error)
    if (error instanceof ApiError && error.status === 429) {
      stop()
      retryIn.value = verificationRetrySeconds(error.retryAfter)
      const until = Date.now() + retryIn.value * 1000
      if (retryIn.value)
        timer = setInterval(() => {
          retryIn.value = Math.max(0, Math.ceil((until - Date.now()) / 1000))
          if (!retryIn.value) stop()
        }, 1000)
    }
  }
  onScopeDispose(stop)
  return { message, status, retryIn, clearError, fail }
}
