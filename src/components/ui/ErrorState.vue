<script setup lang="ts">
import { ApiError, errorMessage } from '@/api/client'
import AppButton from './AppButton.vue'
defineProps<{ error: unknown; retry?: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <div class="error-state" role="alert">
    <p>{{ errorMessage(error) }}</p>
    <p v-if="error instanceof ApiError && error.retryAfter" class="helper">
      Повторити після: {{ error.retryAfter }}
    </p>
    <AppButton v-if="retry" @click="$emit('retry')">Спробувати ще раз</AppButton>
  </div>
</template>
