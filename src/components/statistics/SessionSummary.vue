<script setup lang="ts">
import type { SessionMetrics } from '@/types/statistics'
import { sessionKeys } from '@/utils/statistics'
import { sessionStatuses, duration } from '@/utils/planning'
import MetricChart from './MetricChart.vue'
defineProps<{ metrics: SessionMetrics; chart?: boolean }>()
</script>
<template>
  <section>
    <h3>Навчальні сесії за початковою датою початку</h3>
    <dl class="report-values">
      <div v-for="key in sessionKeys" :key="key">
        <dt>{{ sessionStatuses[key] }}</dt>
        <dd>
          {{ metrics[key].count }} сесій ·
          {{ duration(metrics[key].scheduled_seconds) }} запланованої тривалості
        </dd>
      </div>
    </dl>
    <MetricChart
      v-if="chart"
      title="Стани навчальних сесій"
      unit="Сесії"
      :values="
        sessionKeys.map((key) => ({ label: sessionStatuses[key], value: metrics[key].count }))
      "
    />
    <p>
      <strong>Відомий фактичний час:</strong>
      {{ metrics.completed_actual_minutes }} хв · записів із тривалістю:
      {{ metrics.completed_with_actual_minutes }}
    </p>
    <p :class="{ 'report-warning': metrics.completed_without_actual_minutes > 0 }">
      <strong>Завершених сесій із невідомою фактичною тривалістю:</strong>
      {{ metrics.completed_without_actual_minutes }}. Невідоме не дорівнює нулю; запланований час не
      підставляється замість фактичного.
    </p>
  </section>
</template>
