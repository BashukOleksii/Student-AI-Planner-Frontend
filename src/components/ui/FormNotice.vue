<script setup lang="ts">
import ErrorState from './ErrorState.vue'
import { fieldErrors } from '@/api/client'
withDefaults(defineProps<{ error: unknown; showFieldErrors?: boolean }>(), {
  showFieldErrors: true,
})
</script>
<template>
  <div v-if="error" role="alert">
    <p v-if="!showFieldErrors && Object.keys(fieldErrors(error)).length">Перевірте введені дані.</p>
    <ErrorState v-else :error="error" />
    <ul v-if="showFieldErrors && Object.keys(fieldErrors(error)).length" class="field-error">
      <template v-for="(messages, field) in fieldErrors(error)" :key="field">
        <li v-for="message in messages" :key="message">{{ message }}</li>
      </template>
    </ul>
  </div>
</template>
