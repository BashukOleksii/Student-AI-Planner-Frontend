<script setup lang="ts">
import AppButton from './AppButton.vue'
defineProps<{ current: number; last: number; total: number; busy?: boolean; compact?: boolean }>()
defineEmits<{ page: [number] }>()
</script>
<template>
  <nav class="pagination" aria-label="Сторінки результатів">
    <AppButton :disabled="busy || current <= 1" @click="$emit('page', current - 1)">
      {{ compact ? 'Попередня' : 'Попередня сторінка' }}
    </AppButton>
    <span v-if="compact">Сторінка {{ current }} із {{ last }}</span>
    <span v-else>{{ current }} / {{ last }} · Усього: {{ total }}</span>
    <AppButton :disabled="busy || current >= last" @click="$emit('page', current + 1)">
      {{ compact ? 'Наступна' : 'Наступна сторінка' }}
    </AppButton>
  </nav>
</template>
