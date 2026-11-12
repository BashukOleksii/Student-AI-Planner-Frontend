<script setup lang="ts">
import { computed, ref } from 'vue'
import { accountApi } from '@/api/endpoints'
import { ApiError, fieldErrors } from '@/api/client'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'

const email = ref('')
const busy = ref(false)
const accepted = ref(false)
const error = ref<unknown>(null)
const errors = computed(() => fieldErrors(error.value))
async function submit() {
  if (busy.value || accepted.value) return
  busy.value = true
  error.value = null
  try {
    await accountApi.forgotPassword({ email: email.value })
    accepted.value = true
    email.value = ''
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <span class="eyebrow">ДОСТУП ДО ОБЛІКОВОГО ЗАПИСУ</span>
  <h1>Відновлення пароля</h1>
  <p v-if="accepted" class="success-notice" role="status">
    Якщо обліковий запис із такою адресою існує, інструкцію з відновлення буде надіслано.
  </p>
  <template v-else>
    <p class="muted">Укажіть електронну пошту свого облікового запису.</p>
    <form class="stack" @submit.prevent="submit">
      <FormNotice :error="error" />
      <p v-if="error instanceof ApiError && error.status === 419" class="helper">
        Надішліть форму ще раз: перевірку сеансу буде оновлено перед запитом.
      </p>
      <p
        v-if="error instanceof ApiError && (error.status === 0 || error.status >= 500)"
        class="helper"
      >
        Запит міг бути прийнятий. Перевірте пошту перед повторним надсиланням.
      </p>
      <fieldset :disabled="busy" class="stack">
        <FormField id="recovery-email" label="Електронна пошта" :errors="errors.email" v-slot="f">
          <input
            :id="f.id"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            maxlength="255"
            :aria-invalid="f.invalid"
            :aria-describedby="f.describedby"
          />
        </FormField>
        <AppButton type="submit" variant="primary" :busy="busy">Надіслати інструкцію</AppButton>
      </fieldset>
    </form>
  </template>
  <p class="helper">
    Перевірте вхідні листи та папку «Спам». Лист може надійти через кілька хвилин.
  </p>
  <p class="auth-switch"><RouterLink to="/login">Повернутися до входу</RouterLink></p>
</template>
