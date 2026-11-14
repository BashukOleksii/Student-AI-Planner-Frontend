<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { safeRedirect } from '@/router'
import { fieldErrors } from '@/api/client'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const form = reactive({ email: '', password: '' })
const busy = ref(false)
const error = ref<unknown>(null)
const errors = computed(() => fieldErrors(error.value))
async function submit() {
  busy.value = true
  error.value = null
  try {
    await auth.login(form)
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
    <span class="eyebrow">З ПОВЕРНЕННЯМ</span>
    <h1>Увійти до простору</h1>
    <p class="muted">Увійдіть, щоб відкрити свій розклад, завдання та навчальний план.</p>
    <form class="stack account-form" @submit.prevent="submit">
      <FormNotice :error="error" :show-field-errors="false" />
      <FormField
        id="email"
        label="Електронна пошта"
        hide-label
        :errors="errors.email"
        v-slot="field"
      >
        <input
          :id="field.id"
          v-model="form.email"
          type="email"
          placeholder="Електронна пошта"
          autocomplete="username"
          required
          maxlength="255"
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <FormField id="password" label="Пароль" hide-label :errors="errors.password" v-slot="field">
        <input
          :id="field.id"
          v-model="form.password"
          type="password"
          placeholder="Пароль"
          autocomplete="current-password"
          required
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <p class="auth-recovery"><RouterLink to="/forgot-password">Забули пароль?</RouterLink></p>
      <AppButton type="submit" variant="primary" :busy="busy">Увійти</AppButton>
    </form>
    <p class="auth-switch">
      Ще немає облікового запису?
      <RouterLink :to="{ path: '/register', query: route.query }">Зареєструватися</RouterLink>
    </p>
  </div>
</template>
