<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { accountApi } from '@/api/endpoints'
import { ApiError, fieldErrors } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { takePasswordResetLink } from '@/utils/passwordResetLink'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import NewPasswordFields from '@/components/ui/NewPasswordFields.vue'

const auth = useAuthStore()
let link = takePasswordResetLink()
const email = ref(link?.email ?? '')
const passwords = reactive({ password: '', password_confirmation: '' })
const busy = ref(false)
const success = ref(false)
const invalidLink = ref(!link)
const error = ref<unknown>(null)
const errors = computed(() => fieldErrors(error.value))
function clearSensitiveValues() {
  link = null
  email.value = ''
  passwords.password = ''
  passwords.password_confirmation = ''
}
onUnmounted(clearSensitiveValues)
async function submit() {
  if (busy.value || success.value || invalidLink.value || !link) return
  error.value = null
  if (passwords.password !== passwords.password_confirmation) {
    error.value = new ApiError(422, { password_confirmation: ['Паролі не збігаються.'] })
    return
  }
  busy.value = true
  const resetEmail = link.email
  try {
    await accountApi.resetPassword({ ...passwords, email: resetEmail, token: link.token })
    // Only the reset account lost its sessions; another signed-in account must remain intact.
    if (auth.user?.email.toLowerCase() === resetEmail.toLowerCase()) auth.clear()
    clearSensitiveValues()
    success.value = true
  } catch (e) {
    if (e instanceof ApiError && e.status === 422 && e.fields.token?.length) {
      invalidLink.value = true
      clearSensitiveValues()
    } else error.value = e
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <span class="eyebrow">НОВИЙ ПАРОЛЬ</span>
  <h1>Скидання пароля</h1>
  <p v-if="success" class="success-notice" role="status">
    Пароль скинуто. Увійдіть із новим паролем.
  </p>
  <div v-else-if="invalidLink" class="error-state" role="alert">
    <p>Посилання недійсне, неповне або термін його дії минув. Запросіть нове посилання.</p>
    <RouterLink to="/forgot-password">Запросити нове посилання</RouterLink>
  </div>
  <form v-else class="stack" @submit.prevent="submit">
    <p class="muted">
      Установіть новий пароль для адреси з листа. Після зміни потрібно буде увійти знову на своїх
      пристроях.
    </p>
    <FormNotice :error="error" />
    <p v-if="error instanceof ApiError && error.status === 419" class="helper">
      Надішліть форму ще раз: перевірку сеансу буде оновлено перед запитом.
    </p>
    <p
      v-if="error instanceof ApiError && (error.status === 0 || error.status >= 500)"
      class="helper"
    >
      Пароль міг змінитися. Спробуйте увійти з новим паролем; якщо не вдалося, запросіть нове
      посилання.
    </p>
    <fieldset :disabled="busy" class="stack">
      <FormField id="reset-email" label="Електронна пошта" :errors="errors.email" v-slot="f">
        <input
          :id="f.id"
          :value="email"
          type="email"
          autocomplete="username"
          readonly
          :aria-invalid="f.invalid"
          :aria-describedby="f.describedby"
        />
      </FormField>
      <NewPasswordFields
        prefix="reset"
        v-model:password="passwords.password"
        v-model:confirmation="passwords.password_confirmation"
        :errors="errors"
      />
      <AppButton type="submit" variant="primary" :busy="busy">Зберегти новий пароль</AppButton>
    </fieldset>
    <p class="helper">Після оновлення сторінки відкрийте початкове посилання з листа ще раз.</p>
  </form>
  <p v-if="success && auth.authenticated" class="helper">
    Сеанс іншого облікового запису залишився активним.
  </p>
  <p class="auth-switch"><RouterLink to="/login">Повернутися до входу</RouterLink></p>
  <p v-if="auth.authenticated" class="auth-switch">
    <RouterLink to="/profile">До налаштувань свого облікового запису</RouterLink>
  </p>
</template>
