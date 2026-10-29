<script setup lang="ts">
import type { PublicObject } from '@/types/ai'
import AiWorkReview from './AiWorkReview.vue'
defineProps<{ preview: PublicObject; timezone: string }>()
</script>
<template>
  <p class="ai-review-notice">
    Час спрацювання визначив сервер. Підтвердження змінює нагадування; доставка повідомлення є
    окремим процесом.
  </p>
  <AiWorkReview :preview="preview" :timezone="timezone" />
</template>
