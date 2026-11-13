<script setup lang="ts">
import { aiErrorMessage } from '@/utils/ai'
defineProps<{ error: unknown }>()
</script>
<template>
  <div v-if="error" class="error-state" role="alert">
    <p>{{ aiErrorMessage(error) }}</p>
  </div>
</template>
