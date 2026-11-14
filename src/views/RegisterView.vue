<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { safeRedirect } from '@/router'
import { fieldErrors } from '@/api/client'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import PasswordInput from '@/components/ui/PasswordInput.vue'
import TimezoneSelect from '@/components/ui/TimezoneSelect.vue'
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const form = reactive({
  name: '',
  email: '',
  password: '',
  password_confirmation: '',
  timezone: 'Europe/Kyiv',
})
const busy = ref(false)
const error = ref<unknown>(null)
const mismatch = ref('')
const errors = computed(() => fieldErrors(error.value))
async function submit() {
  mismatch.value = ''
  if (form.password !== form.password_confirmation) {
    mismatch.value = 'Паролі мають збігатися.'
    return
  }
  busy.value = true
  error.value = null
  try {
    await auth.register(form)
    await router.replace(safeRedirect(route.query.redirect))
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="page-workspace page-auth">
    <span class="eyebrow">ВАШ НОВИЙ ПОЧАТОК</span>
    <h1>Створити обліковий запис</h1>
    <p class="muted">Створіть власний розклад і плануйте навчальні справи в одному місці.</p>
    <form class="stack account-form" @submit.prevent="submit">
      <FormNotice :error="error" />
      <fieldset class="stack">
        <legend>Про вас</legend>
        <FormField id="name" label="Ім’я" :errors="errors.name" v-slot="f">
          <input
            :id="f.id"
            v-model="form.name"
            autocomplete="name"
            required
            maxlength="255"
            :aria-invalid="f.invalid"
            :aria-describedby="f.describedby"
          />
        </FormField>
        <FormField id="email" label="Електронна пошта" :errors="errors.email" v-slot="f">
          <input
            :id="f.id"
            v-model="form.email"
            type="email"
            autocomplete="username"
            required
            maxlength="255"
            :aria-invalid="f.invalid"
            :aria-describedby="f.describedby"
          />
        </FormField>
      </fieldset>
      <fieldset class="stack">
        <legend>Захист облікового запису</legend>
        <div class="form-grid">
          <FormField
            id="password"
            label="Пароль"
            hint="Щонайменше 8 символів"
            :errors="errors.password"
            v-slot="f"
          >
            <PasswordInput
              :id="f.id"
              v-model="form.password"
              autocomplete="new-password"
              required
              minlength="8"
              :aria-invalid="f.invalid"
              :aria-describedby="f.describedby"
            />
          </FormField>
          <FormField
            id="password-confirmation"
            label="Повторіть пароль"
            :errors="mismatch ? [mismatch] : errors.password_confirmation"
            v-slot="f"
          >
            <PasswordInput
              :id="f.id"
              v-model="form.password_confirmation"
              autocomplete="new-password"
              required
              minlength="8"
              :aria-invalid="f.invalid"
              :aria-describedby="f.describedby"
            />
          </FormField>
        </div>
      </fieldset>
      <FormField
        id="register-timezone"
        label="Часовий пояс"
        hint="Визначає місцевий час занять і нагадувань. За замовчуванням — Україна, Київ; можна змінити."
        :errors="errors.timezone"
        v-slot="f"
      >
        <TimezoneSelect
          :id="f.id"
          v-model="form.timezone"
          :aria-invalid="f.invalid"
          :aria-describedby="f.describedby"
        />
      </FormField>
      <AppButton type="submit" variant="primary" :busy="busy">Створити обліковий запис</AppButton>
    </form>
    <p class="auth-switch">
      Вже маєте обліковий запис?
      <RouterLink :to="{ path: '/login', query: route.query }">Увійти</RouterLink>
    </p>
  </div>
</template>
