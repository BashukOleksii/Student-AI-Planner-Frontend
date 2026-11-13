<script setup lang="ts">
import { computed } from 'vue'
import type { ProgressComparison } from '@/types/statistics'
import { signed } from '@/utils/statistics'
const props = defineProps<{ report: ProgressComparison }>()
const metrics = computed(() => {
  const { baseline, current, delta } = props.report
  return [
    {
      label: 'Завершені завдання',
      a: baseline.totals.tasks_completed.total,
      b: current.totals.tasks_completed.total,
      delta: delta.tasks_completed.total,
    },
    {
      label: 'Завершені підзавдання',
      a: baseline.totals.subtasks_completed.total,
      b: current.totals.subtasks_completed.total,
      delta: delta.subtasks_completed.total,
    },
    {
      label: 'Завершені сесії',
      a: baseline.totals.study_sessions.completed.count,
      b: current.totals.study_sessions.completed.count,
      delta: delta.study_sessions.completed.count,
    },
    {
      label: 'Пропущені сесії',
      a: baseline.totals.study_sessions.missed.count,
      b: current.totals.study_sessions.missed.count,
      delta: delta.study_sessions.missed.count,
    },
    {
      label: 'Записаний фактичний час',
      a: baseline.totals.study_sessions.completed_actual_minutes,
      b: current.totals.study_sessions.completed_actual_minutes,
      delta: delta.study_sessions.completed_actual_minutes,
      unit: 'хв',
    },
    {
      label: 'Сесії без записаного часу',
      a: baseline.totals.study_sessions.completed_without_actual_minutes,
      b: current.totals.study_sessions.completed_without_actual_minutes,
      delta: delta.study_sessions.completed_without_actual_minutes,
    },
  ]
})
</script>
<template>
  <div class="comparison-periods">
    <p>
      <strong>A</strong>
      {{ report.baseline.period.start_date }} — {{ report.baseline.period.end_date }}
    </p>
    <p>
      <strong>B</strong>
      {{ report.current.period.start_date }} — {{ report.current.period.end_date }}
    </p>
  </div>
  <div class="comparison-cards">
    <section v-for="metric in metrics" :key="metric.label" class="comparison-card">
      <h3>{{ metric.label }}</h3>
      <dl class="period-values">
        <div>
          <dt>Період A</dt>
          <dd>
            {{ metric.a }}
            <small>{{ metric.unit }}</small>
          </dd>
        </div>
        <div>
          <dt>Період B</dt>
          <dd>
            {{ metric.b }}
            <small>{{ metric.unit }}</small>
          </dd>
        </div>
      </dl>
      <div class="comparison-bars" aria-hidden="true">
        <span :style="{ width: `${(metric.a / Math.max(1, metric.a, metric.b)) * 100}%` }"></span>
        <span :style="{ width: `${(metric.b / Math.max(1, metric.a, metric.b)) * 100}%` }"></span>
      </div>
      <p class="comparison-delta">
        <span aria-hidden="true">{{ metric.delta > 0 ? '↗' : metric.delta < 0 ? '↘' : '→' }}</span>
        {{
          metric.delta === 0 ? 'Без змін' : `Різниця: ${signed(metric.delta)} ${metric.unit ?? ''}`
        }}
      </p>
    </section>
  </div>
  <p
    v-if="
      report.observations.baseline_has_unknown_actual_minutes ||
      report.observations.current_has_unknown_actual_minutes
    "
    class="helper comparison-unknown"
    role="status"
  >
    Фактичний час неповний: враховано лише записані хвилини.
  </p>
</template>
<style scoped>
.comparison-periods {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  margin-bottom: 14px;
  font-size: 12px;
  color: var(--text-secondary);
}
.comparison-periods strong {
  color: var(--accent);
  margin-inline-end: 5px;
}
.comparison-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.comparison-card {
  background: var(--subtle);
  padding: 16px;
  border-radius: var(--radius);
  min-width: 0;
}
.comparison-card h3 {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
  min-height: 38px;
}
.period-values {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 10px 0;
}
.period-values dt {
  font-size: 11px;
  color: var(--text-secondary);
}
.period-values dd {
  font-size: 23px;
  line-height: 1.4;
  font-weight: 700;
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.period-values small {
  font-size: 12px;
  font-weight: 400;
}
.comparison-bars {
  display: grid;
  gap: 4px;
  height: 12px;
}
.comparison-bars span {
  height: 4px;
  border-radius: 4px;
  background: var(--text-secondary);
}
.comparison-bars span + span {
  background: var(--accent);
}
.comparison-delta {
  font-size: 12px;
  margin-top: 10px;
}
.comparison-unknown {
  margin-top: 12px;
}
@media (max-width: 780px) {
  .comparison-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 380px) {
  .comparison-cards {
    grid-template-columns: 1fr;
  }
}
</style>
