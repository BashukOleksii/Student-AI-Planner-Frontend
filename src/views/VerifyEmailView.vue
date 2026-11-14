<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { verificationPathFromLink } from '@/utils/emailVerification'
import { useEmailVerificationFeedback } from '@/composables/useEmailVerificationFeedback'
import AppButton from '@/components/ui/AppButton.vue'

const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore()
const path = computed(() => verificationPathFromLink(route.fullPath))
const busy = ref(false),
  success = ref(false),
  accountChanged = ref(false)
const { message, status, retryIn, clearError, fail } = useEmailVerificationFeedback()
let controller: AbortController | undefined
watch(
  () => route.fullPath,
  () => {
    controller?.abort()
    busy.value = false
    success.value = false
    accountChanged.value = false
    clearError()
  },
)
onScopeDispose(() => controller?.abort())
function signIn() {
  // Only a known local page is used as redirect, never the nested backend path.
  return router.push({ path: '/login', query: { redirect: route.fullPath } })
}
async function changeAccount() {
  if (busy.value) return
  busy.value = true
  clearError()
  try {
    await auth.logout()
    await signIn()
  } catch (reason) {
    fail(reason)
  } finally {
    busy.value = false
  }
}
async function recover() {
  if (busy.value) return
  busy.value = true
  clearError()
  try {
    await auth.recoverSession()
  } catch (reason) {
    fail(reason)
  } finally {
    busy.value = false
  }
}
async function confirm() {
  const signedPath = path.value
  if (
    !signedPath ||
    busy.value ||
    success.value ||
    retryIn.value ||
    auth.csrfFailure ||
    !auth.authenticated
  )
    return
  const current = (controller = new AbortController())
  busy.value = true
  clearError()
  try {
    const applied = await auth.confirmEmail(signedPath, current.signal)
    if (!current.signal.aborted) {
      success.value = applied
      accountChanged.value = !applied
    }
  } catch (reason) {
    if (!current.signal.aborted) fail(reason)
  } finally {
    if (!current.signal.aborted) busy.value = false
  }
}
</script>
<template>
  <div class="page-workspace page-auth verify-email-page">
    <h1>Підтвердження email</h1>
    <p v-if="success" class="success-notice" role="status">Email підтверджено.</p>
    <div v-else-if="!path" class="error-state" role="alert">
      <p>Посилання недійсне або прострочене. Запросіть новий лист із профілю.</p>
    </div>
    <template v-else>
      <template v-if="!auth.authenticated">
        <p role="status">Потрібно ввійти, щоб підтвердити email.</p>
        <AppButton variant="primary" @click="signIn">Увійти</AppButton>
      </template>
      <template v-else>
        <p class="muted">Підтвердьте email свого акаунта.</p>
        <p>
          <strong>{{ auth.user?.email }}</strong>
        </p>
        <p v-if="accountChanged" role="status">Стан акаунта змінився. Перевірте профіль.</p>
        <p v-if="message" class="field-error" role="alert">{{ message }}</p>
        <p v-if="retryIn" class="helper" role="status">Спробуйте через {{ retryIn }} с.</p>
        <div class="actions">
          <AppButton
            variant="primary"
            :busy="busy"
            :disabled="retryIn > 0 || auth.csrfFailure || status === 403"
            @click="confirm"
          >
            Підтвердити email
          </AppButton>
          <AppButton v-if="status === 403" :disabled="busy" @click="changeAccount">
            Увійти в інший акаунт
          </AppButton>
          <AppButton v-if="auth.csrfFailure" :busy="busy" @click="recover">
            Відновити сеанс
          </AppButton>
        </div>
      </template>
    </template>
    <p class="auth-switch">
      <RouterLink to="/profile">
        {{ success ? 'До профілю' : 'Запросити новий лист із профілю' }}
      </RouterLink>
    </p>
  </div>
</template>
<style scoped>
.verify-email-page {
  display: grid;
  gap: 16px;
}
.verify-email-page .actions {
  margin-top: 0;
}
</style>
