<script setup lang="ts">
import type { FieldErrors } from '@/types/api'
import FormField from './FormField.vue'
defineProps<{ prefix: string; errors: FieldErrors }>()
const password = defineModel<string>('password', { required: true })
const confirmation = defineModel<string>('confirmation', { required: true })
</script>
<template>
  <FormField
    :id="`${prefix}-password`"
    label="Новий пароль"
    hint="Щонайменше 8 символів; не більше 72 байтів UTF-8. Остаточно перевіряє сервер."
    :errors="errors.password"
    v-slot="f"
  >
    <input
      :id="f.id"
      v-model="password"
      type="password"
      autocomplete="new-password"
      required
      minlength="8"
      :aria-invalid="f.invalid"
      :aria-describedby="f.describedby"
    />
  </FormField>
  <FormField
    :id="`${prefix}-confirmation`"
    label="Підтвердження нового пароля"
    :errors="errors.password_confirmation"
    v-slot="f"
  >
    <input
      :id="f.id"
      v-model="confirmation"
      type="password"
      autocomplete="new-password"
      required
      :aria-invalid="f.invalid"
      :aria-describedby="f.describedby"
    />
  </FormField>
</template>
