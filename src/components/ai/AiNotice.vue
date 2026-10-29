<script setup lang="ts">
import { computed } from 'vue'
import { ApiError, fieldErrors } from '@/api/client'
import { aiErrorMessage } from '@/utils/ai'
const props = defineProps<{ error: unknown }>()
const apiError = computed(() => (props.error instanceof ApiError ? props.error : null))
</script>
<template>
  <div v-if="error" class="error-state" role="alert">
    <p>{{ aiErrorMessage(error) }}</p>
    <p v-if="apiError?.retryAfter" class="helper">
      Сервер указав Retry-After: {{ apiError.retryAfter }}. Зачекайте перед повторенням.
    </p>
    <p v-if="apiError?.code" class="helper">Код: {{ apiError.code }}</p>
    <ul v-if="Object.keys(fieldErrors(error)).length">
      <template v-for="(messages, key) in fieldErrors(error)" :key="key">
        <li v-for="message in messages" :key="message">{{ message }}</li>
      </template>
    </ul>
  </div>
</template>
