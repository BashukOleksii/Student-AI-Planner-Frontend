import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { accountApi } from '@/api/endpoints'
import { ApiError, initializeCsrf } from '@/api/client'
import type { User, LoginInput, RegistrationInput, ProfileInput } from '@/types/api'
import { clearAiIntents } from '@/utils/aiIntent'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const initialized = ref(false)
  const initializing = ref(false)
  const bootstrapError = ref<unknown>(null)
  const csrfFailure = ref(false)
  const authenticated = computed(() => user.value !== null)
  let bootstrap: Promise<void> | undefined
  let revision = 0
  function clear() {
    revision++
    user.value = null
    initialized.value = true
    bootstrapError.value = null
    csrfFailure.value = false
  }
  function handleAuthError(status: 401 | 419) {
    if (status === 401) clear()
    else csrfFailure.value = true
  }
  async function refresh() {
    const version = revision
    const result = await accountApi.profile()
    if (version === revision) {
      user.value = result.data
      initialized.value = true
    }
  }
  function initialize(): Promise<void> {
    if (bootstrap) return bootstrap
    if (initialized.value) return Promise.resolve()
    initializing.value = true
    bootstrapError.value = null
    bootstrap = refresh()
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) clear()
        else bootstrapError.value = error
      })
      .finally(() => {
        initializing.value = false
        bootstrap = undefined
      })
    return bootstrap
  }
  async function login(input: LoginInput) {
    const version = ++revision
    await accountApi.login(input)
    if (version !== revision) return
    await refresh()
    csrfFailure.value = false
  }
  async function register(input: RegistrationInput) {
    const version = ++revision
    await accountApi.register(input)
    if (version !== revision) return
    await refresh()
    csrfFailure.value = false
  }
  async function logout() {
    try {
      await accountApi.logout()
      clearAiIntents()
      clear()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAiIntents()
        clear()
      } else throw error
    }
  }
  async function update(input: ProfileInput) {
    const version = revision
    const result = await accountApi.update(input)
    if (version === revision && user.value) user.value = result.data
  }
  async function recoverSession() {
    await initializeCsrf()
    await refresh()
    csrfFailure.value = false
  }
  return {
    user,
    initialized,
    initializing,
    bootstrapError,
    csrfFailure,
    authenticated,
    clear,
    handleAuthError,
    initialize,
    login,
    register,
    logout,
    refresh,
    update,
    recoverSession,
  }
})
