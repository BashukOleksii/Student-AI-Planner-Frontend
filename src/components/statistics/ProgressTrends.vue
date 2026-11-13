<script setup lang="ts">
import { computed } from 'vue'
import type { ProgressTrends } from '@/types/statistics'
import MetricChart from './MetricChart.vue'
const props = defineProps<{ report: ProgressTrends }>()
const charts = computed(() => [
  {
    title: 'Записаний час за днями',
    unit: 'хв',
    values: props.report.days.map((day) => ({
      label: `${day.date.slice(8)}.${day.date.slice(5, 7)}`,
      value: day.study_sessions.completed_actual_minutes,
    })),
  },
  {
    title: 'Завершені сесії за днями',
    unit: 'сесії',
    values: props.report.days.map((day) => ({
      label: `${day.date.slice(8)}.${day.date.slice(5, 7)}`,
      value: day.study_sessions.completed.count,
    })),
  },
  {
    title: 'Пропущені сесії за днями',
    unit: 'сесії',
    values: props.report.days.map((day) => ({
      label: `${day.date.slice(8)}.${day.date.slice(5, 7)}`,
      value: day.study_sessions.missed.count,
    })),
  },
  {
    title: 'Завершені завдання за днями',
    unit: 'завдання',
    values: props.report.days.map((day) => ({
      label: `${day.date.slice(8)}.${day.date.slice(5, 7)}`,
      value: day.tasks_completed.total,
    })),
  },
])
</script>
<template>
  <div class="trend-cards">
    <div v-for="chart in charts" :key="chart.title" class="trend-card">
      <MetricChart v-bind="chart" variant="columns" />
    </div>
  </div>
  <p
    v-if="report.totals.study_sessions.completed_without_actual_minutes"
    class="helper unknown-time"
  >
    На графіку часу — лише записані хвилини. Без запису:
    {{ report.totals.study_sessions.completed_without_actual_minutes }} сесій.
  </p>
</template>
<style scoped>
.trend-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.trend-card {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.unknown-time {
  margin-top: 12px;
}
@media (max-width: 620px) {
  .trend-cards {
    grid-template-columns: 1fr;
  }
}
</style>
