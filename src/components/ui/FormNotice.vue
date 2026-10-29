<script setup lang="ts">
import ErrorState from './ErrorState.vue'
import { fieldErrors } from '@/api/client'
defineProps<{ error: unknown }>()
</script>
<template>
  <div v-if="error">
    <ErrorState :error="error" />
    <ul v-if="Object.keys(fieldErrors(error)).length" class="field-error" role="alert">
      <template v-for="(messages, field) in fieldErrors(error)" :key="field">
        <li v-for="message in messages" :key="message">{{ message }}</li>
      </template>
    </ul>
  </div>
</template>
