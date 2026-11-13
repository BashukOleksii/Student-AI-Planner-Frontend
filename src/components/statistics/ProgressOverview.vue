<script setup lang="ts">
import { computed } from 'vue'
import type { Progress } from '@/types/api'
import { sessionKeys } from '@/utils/statistics'
const props = defineProps<{ report: Progress }>()
const sessions = computed(() => props.report.study_sessions.started_in_period)
const empty = computed(
  () =>
    props.report.tasks.completed_in_period.total === 0 &&
    props.report.subtasks.completed_in_period.total === 0 &&
    sessionKeys.every((key) => sessions.value[key].count === 0),
)
const metrics = computed(() => [
  {
    label: 'У плані',
    value: Math.floor(sessions.value.planned.scheduled_seconds / 60),
    unit: 'хв',
  },
  {
    label: 'Записаний фактичний час',
    value: sessions.value.completed_with_actual_minutes
      ? sessions.value.completed_actual_minutes
      : '—',
    unit: 'хв',
  },
  { label: 'Завершені сесії', value: sessions.value.completed.count },
  { label: 'Пропущені сесії', value: sessions.value.missed.count },
  { label: 'Завершені завдання', value: props.report.tasks.completed_in_period.total },
  { label: 'Завершені підзавдання', value: props.report.subtasks.completed_in_period.total },
])
</script>
<template>
  <p v-if="empty" class="helper empty-progress" role="status">Активність ще не зафіксовано</p>
  <dl class="progress-metrics" aria-label="Огляд прогресу за період">
    <div v-for="metric in metrics" :key="metric.label" class="progress-metric">
      <dt>{{ metric.label }}</dt>
      <dd>
        {{ metric.value }}
        <small v-if="metric.unit">{{ metric.unit }}</small>
      </dd>
    </div>
  </dl>
  <p v-if="sessions.completed_without_actual_minutes" class="helper unknown-time" role="status">
    Завершених сесій без записаного часу: {{ sessions.completed_without_actual_minutes }}
  </p>
</template>
<style scoped>
.progress-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.progress-metric {
  background: var(--subtle);
  border-radius: var(--radius);
  padding: 16px 18px;
}
.progress-metric dt {
  color: var(--text-secondary);
  font-size: 12px;
}
.progress-metric dd {
  margin: 6px 0 0;
  font-size: 28px;
  line-height: 1.25;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.progress-metric small {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary);
}
.empty-progress {
  margin-bottom: 12px;
}
.unknown-time {
  margin-top: 12px;
}
@media (max-width: 620px) {
  .progress-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .progress-metric {
    padding: 14px;
  }
}
</style>
