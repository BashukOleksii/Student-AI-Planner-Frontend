<script setup lang="ts">
import { ref } from 'vue'
import type { DateRange } from '@/types/planning'
import { validateReportRange } from '@/utils/statistics'
import RangeFields from '@/components/planning/RangeFields.vue'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{ initial: DateRange; timezone: string; busy: boolean }>()
const emit = defineEmits<{ apply: [DateRange] }>()
const range = ref({ ...props.initial }),
  error = ref('')
function apply() {
  error.value = ''
  try {
    validateReportRange(range.value)
    emit('apply', { ...range.value })
  } catch (e) {
    error.value = e instanceof Error ? e.message : ''
  }
}
</script>
<template>
  <form class="report-range-form" @submit.prevent="apply">
    <RangeFields v-model="range" min-date="0001-01-01" compact />
    <AppButton type="submit" variant="primary" :busy="busy">Показати звіт</AppButton>
    <p v-if="error" role="alert" class="field-error">{{ error }}</p>
  </form>
</template>
<style scoped>
.report-range-form {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 16px;
}
.report-range-form > .button {
  grid-row: 1;
}
@media (max-width: 620px) {
  .report-range-form {
    grid-template-columns: 1fr;
  }
  .report-range-form > .button {
    grid-row: auto;
    grid-column: 1;
    width: 100%;
  }
}
</style>
