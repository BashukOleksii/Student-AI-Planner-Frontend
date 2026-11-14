<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError, fieldErrors } from '@/api/client'
import { accountApi } from '@/api/endpoints'
import { emailVerificationApi } from '@/api/emailVerification'
import { useEmailVerificationFeedback } from '@/composables/useEmailVerificationFeedback'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import NewPasswordFields from '@/components/ui/NewPasswordFields.vue'
const auth = useAuthStore()
const passwords = reactive({ current_password: '', password: '', password_confirmation: '' })
const passwordBusy = ref(false)
const passwordError = ref<unknown>(null)
const passwordSuccess = ref(false)
const passwordErrors = computed(() => fieldErrors(passwordError.value))
const verificationBusy = ref(false),
  verificationSent = ref(false)
const {
  message: verificationError,
  retryIn,
  clearError: clearVerificationError,
  fail: verificationFailed,
} = useEmailVerificationFeedback()
const verificationController = new AbortController()
onUnmounted(() => verificationController.abort())
watch(
  () => auth.user?.email,
  () => {
    verificationSent.value = false
    clearVerificationError()
  },
)
const accountBusy = computed(() => passwordBusy.value || verificationBusy.value)
async function requestVerification() {
  if (
    !auth.user ||
    accountBusy.value ||
    retryIn.value ||
    auth.csrfFailure ||
    auth.user.email_verified
  )
    return
  const email = auth.user.email
  verificationBusy.value = true
  verificationSent.value = false
  clearVerificationError()
  try {
    await emailVerificationApi.send(verificationController.signal)
    if (!verificationController.signal.aborted && auth.user?.email === email)
      verificationSent.value = true
  } catch (reason) {
    if (!verificationController.signal.aborted) verificationFailed(reason)
  } finally {
    verificationBusy.value = false
  }
}
function clearPasswords() {
  passwords.current_password = ''
  passwords.password = ''
  passwords.password_confirmation = ''
}
onUnmounted(clearPasswords)
async function changePassword() {
  if (accountBusy.value) return
  passwordError.value = null
  passwordSuccess.value = false
  if (passwords.password !== passwords.password_confirmation) {
    passwordError.value = new ApiError(422, { password_confirmation: ['Паролі не збігаються.'] })
    return
  }
  passwordBusy.value = true
  try {
    await accountApi.changePassword({ ...passwords })
    clearPasswords()
    passwordSuccess.value = true
  } catch (e) {
    passwordError.value = e
  } finally {
    passwordBusy.value = false
  }
}
</script>
<template>
  <div class="page-workspace page-settings">
    <header class="page-heading">
      <div>
        <RouterLink to="/profile" class="text-link">← Повернутися до налаштувань</RouterLink>
        <h1>Безпека облікового запису</h1>
      </div>
    </header>
    <div class="settings-grid">
      <AppCard title="Підтвердження email" class="email-verification-status">
        <p>{{ auth.user?.email }}</p>
        <p class="badge" :class="auth.user?.email_verified ? 'success' : 'warning'">
          {{ auth.user?.email_verified ? 'Email підтверджено' : 'Email не підтверджено' }}
        </p>
        <template v-if="!auth.user?.email_verified">
          <div class="actions">
            <AppButton
              :busy="verificationBusy"
              :disabled="accountBusy || auth.csrfFailure || retryIn > 0"
              @click="requestVerification"
            >
              Надіслати лист підтвердження
            </AppButton>
          </div>
        </template>
        <p v-if="verificationSent" class="success-notice" role="status">
          Лист підтвердження запитано. Перевірте пошту.
        </p>
        <p v-if="verificationError" class="field-error" role="alert">{{ verificationError }}</p>
        <p v-if="retryIn" class="helper" role="status">Спробуйте через {{ retryIn }} с.</p>
      </AppCard>
      <AppCard id="account-security" title="Зміна пароля">
        <p class="muted">Поточний сеанс залишиться активним. Інші сеанси буде завершено.</p>
        <p v-if="passwordSuccess" class="success-notice" role="status">Пароль змінено.</p>
        <form class="stack" @submit.prevent="changePassword">
          <FormNotice :error="passwordError" />
          <p
            v-if="
              passwordError instanceof ApiError &&
              (passwordError.status === 0 || passwordError.status >= 500)
            "
            class="helper"
          >
            Пароль міг змінитися. Перед повторною зміною перевірте вхід із новим паролем в іншій
            вкладці.
          </p>
          <fieldset :disabled="accountBusy" class="stack">
            <FormField
              id="current-password"
              label="Поточний пароль"
              :errors="passwordErrors.current_password"
              v-slot="f"
            >
              <input
                :id="f.id"
                v-model="passwords.current_password"
                type="password"
                autocomplete="current-password"
                required
                :aria-invalid="f.invalid"
                :aria-describedby="f.describedby"
              />
            </FormField>
            <NewPasswordFields
              prefix="change"
              v-model:password="passwords.password"
              v-model:confirmation="passwords.password_confirmation"
              :errors="passwordErrors"
            />
            <AppButton
              type="submit"
              variant="primary"
              :busy="passwordBusy"
              :disabled="verificationBusy"
            >
              Змінити пароль
            </AppButton>
          </fieldset>
        </form>
      </AppCard>
    </div>
  </div>
</template>
