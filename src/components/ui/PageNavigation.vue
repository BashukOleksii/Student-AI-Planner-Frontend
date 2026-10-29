<script setup lang="ts">
import AppButton from './AppButton.vue'
defineProps<{ current: number; last: number; total: number; busy?: boolean }>()
defineEmits<{ page: [number] }>()
</script>
<template>
  <nav class="pagination" aria-label="Сторінки результатів">
    <AppButton :disabled="busy || current <= 1" @click="$emit('page', current - 1)">
      Попередня сторінка
    </AppButton>
    <span>{{ current }} / {{ last }} · Усього: {{ total }}</span>
    <AppButton :disabled="busy || current >= last" @click="$emit('page', current + 1)">
      Наступна сторінка
    </AppButton>
  </nav>
</template>
