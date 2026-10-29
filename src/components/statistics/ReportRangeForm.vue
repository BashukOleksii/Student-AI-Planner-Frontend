<script setup lang="ts">
import { ref } from 'vue'
import { Temporal } from '@js-temporal/polyfill'
import type { DateRange } from '@/types/planning'
import { today, addDays } from '@/utils/dates'
import { validateReportRange } from '@/utils/statistics'
import RangeFields from '@/components/planning/RangeFields.vue'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{ initial: DateRange; timezone: string; busy: boolean }>()
const emit = defineEmits<{ apply: [DateRange] }>()
const range = ref({ ...props.initial }),
  error = ref('')
function preset(week: boolean) {
  const date = today(props.timezone)
  const start = week
    ? addDays(date, 1 - Temporal.PlainDate.from(date).dayOfWeek)
    : addDays(date, -6)
  range.value = { start_date: start, end_date: week ? addDays(start, 6) : date }
}
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
  <form class="stack" @submit.prevent="apply">
    <div class="actions">
      <AppButton @click="preset(false)">Останні сім днів</AppButton>
      <AppButton @click="preset(true)">Поточний тиждень</AppButton>
    </div>
    <RangeFields v-model="range" min-date="0001-01-01" />
    <p v-if="error" role="alert" class="field-error">{{ error }}</p>
    <AppButton type="submit" variant="primary" :busy="busy">Показати звіт</AppButton>
  </form>
</template>
