<script setup lang="ts">
import { ApiError, errorMessage, fieldErrors } from '@/api/client'
import AppButton from './AppButton.vue'
defineProps<{ error: unknown; retry?: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <div class="error-state" role="alert">
    <p>{{ errorMessage(error) }}</p>
    <template v-if="fieldErrors(error).semester_teacher_repair?.length">
      <p>
        Потрібне ручне виправлення історичних зв’язків викладача. Зверніться до адміністратора;
        збережені зв’язки не змінено.
      </p>
      <p v-for="message in fieldErrors(error).semester_teacher_repair" :key="message">
        {{ message }}
      </p>
    </template>
    <p v-if="error instanceof ApiError && error.retryAfter" class="helper">
      Повторити після: {{ error.retryAfter }}
    </p>
    <AppButton v-if="retry" @click="$emit('retry')">Спробувати ще раз</AppButton>
  </div>
</template>
