<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { statisticsApi } from '@/api/statistics'
import { today, addDays } from '@/utils/dates'
import { exactDateTime, sessionStatuses } from '@/utils/planning'
import {
  validateComparison,
  completionLabels,
  sessionKeys,
  directionLabels,
  signed,
} from '@/utils/statistics'
import MetricChart from '@/components/statistics/MetricChart.vue'
import StatisticsNav from '@/components/statistics/StatisticsNav.vue'
import RangeFields from '@/components/planning/RangeFields.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const auth = useAuthStore(),
  date = today(auth.user?.timezone ?? 'UTC')
const baseline = ref({ start_date: addDays(date, -13), end_date: addDays(date, -7) }),
  current = ref({ start_date: addDays(date, -6), end_date: date }),
  localError = ref('')
const input = ref({
  baseline_start_date: baseline.value.start_date,
  baseline_end_date: baseline.value.end_date,
  current_start_date: current.value.start_date,
  current_end_date: current.value.end_date,
})
const report = useResource((signal) => statisticsApi.comparison(input.value, signal), [input])
function apply() {
  localError.value = ''
  try {
    validateComparison(baseline.value, current.value)
    input.value = {
      baseline_start_date: baseline.value.start_date,
      baseline_end_date: baseline.value.end_date,
      current_start_date: current.value.start_date,
      current_end_date: current.value.end_date,
    }
  } catch (e) {
    localError.value = e instanceof Error ? e.message : ''
  }
}
function preset() {
  baseline.value = { start_date: addDays(date, -13), end_date: addDays(date, -7) }
  current.value = { start_date: addDays(date, -6), end_date: date }
}
const rows = computed(() => {
  const data = report.data.value?.data
  if (!data) return []
  const result: { label: string; baseline: number; current: number; delta: number }[] = []
  for (const work of ['tasks_completed', 'subtasks_completed'] as const)
    for (const [key, label] of Object.entries(completionLabels)) {
      const field = key as keyof typeof completionLabels
      result.push({
        label: `${work === 'tasks_completed' ? 'Завдання' : 'Підзавдання'}: ${label}`,
        baseline: data.baseline.totals[work][field],
        current: data.current.totals[work][field],
        delta: data.delta[work][field],
      })
    }
  for (const key of sessionKeys)
    for (const field of ['count', 'scheduled_seconds'] as const)
      result.push({
        label: `${sessionStatuses[key]}: ${field === 'count' ? 'кількість сесій' : 'заплановані секунди'}`,
        baseline: data.baseline.totals.study_sessions[key][field],
        current: data.current.totals.study_sessions[key][field],
        delta: data.delta.study_sessions[key][field],
      })
  for (const [key, label] of [
    ['completed_actual_minutes', 'Відомі фактичні хвилини'],
    ['completed_with_actual_minutes', 'Завершені сесії з відомою тривалістю'],
    ['completed_without_actual_minutes', 'Завершені сесії з невідомою тривалістю'],
  ] as const)
    result.push({
      label,
      baseline: data.baseline.totals.study_sessions[key],
      current: data.current.totals.study_sessions[key],
      delta: data.delta.study_sessions[key],
    })
  return result
})
const observationLabels = {
  task_completions: 'Завершення завдань',
  subtask_completions: 'Завершення підзавдань',
  missed_sessions: 'Пропущені сесії',
  known_actual_minutes: 'Відомі фактичні хвилини',
}
</script>
<template>
  <header class="page-heading">
    <div>
      <h1>Порівняння періодів</h1>
      <p class="muted">Фактичні відмінності активності, без оцінок продуктивності та прогнозів.</p>
    </div>
  </header>
  <StatisticsNav />
  <AppCard>
    <form class="stack" @submit.prevent="apply">
      <AppButton @click="preset">Два послідовні семиденні періоди</AppButton>
      <fieldset>
        <legend>Базовий період</legend>
        <RangeFields v-model="baseline" min-date="0001-01-01" />
      </fieldset>
      <fieldset>
        <legend>Поточний період порівняння</legend>
        <RangeFields v-model="current" min-date="0001-01-01" />
      </fieldset>
      <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
      <AppButton type="submit" variant="primary" :busy="report.loading.value">
        Порівняти періоди
      </AppButton>
    </form>
  </AppCard>
  <LoadingState v-if="report.loading.value" />
  <FormNotice v-else-if="report.error.value" :error="report.error.value" />
  <AppButton v-if="report.error.value" @click="report.reload">Повторити читання звіту</AppButton>
  <template v-if="report.data.value">
    <p class="helper">
      {{ report.data.value.data.timezone }} · стан на
      {{ exactDateTime(report.data.value.data.as_of_utc, report.data.value.data.timezone) }}
    </p>
    <p class="report-warning">
      Порівняння відображає поточний збережений стан активності, а не незмінну історію переходів.
      Повторно відкриті чи видалені завдання можуть змінити минулі значення. Зростання не дорівнює
      покращенню, а зменшення не доводить втрату мотивації.
    </p>
    <p
      v-if="
        report.data.value.data.observations.baseline_has_unknown_actual_minutes ||
        report.data.value.data.observations.current_has_unknown_actual_minutes
      "
      class="report-warning"
      role="status"
    >
      Порівняння фактичної тривалості неповне: є завершені сесії без записаних хвилин. Показано лише
      відомі хвилини й кількість невідомих записів. Різниця відомих хвилин не є різницею всіх
      навчальних зусиль.
    </p>
    <AppCard title="Підтверджені сервером підсумки та різниці">
      <p>
        Базовий: {{ report.data.value.data.baseline.period.start_date }} —
        {{ report.data.value.data.baseline.period.end_date }}
      </p>
      <p>
        Поточний: {{ report.data.value.data.current.period.start_date }} —
        {{ report.data.value.data.current.period.end_date }}
      </p>
      <div class="comparison-head" aria-hidden="true">
        <span>Показник</span>
        <span>Базовий</span>
        <span>Поточний</span>
        <span>Різниця</span>
      </div>
      <dl class="comparison-values">
        <div v-for="row in rows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>
            <span class="sr-only">Базовий:</span>
            {{ row.baseline }}
          </dd>
          <dd>
            <span class="sr-only">Поточний:</span>
            {{ row.current }}
          </dd>
          <dd>
            <span class="sr-only">Різниця:</span>
            {{ signed(row.delta) }}
          </dd>
        </div>
      </dl>
    </AppCard>
    <AppCard title="Завершення: базовий і поточний періоди">
      <MetricChart
        title="Завершення завдань"
        unit="Завдання"
        :values="[
          { label: 'Базовий', value: report.data.value.data.baseline.totals.tasks_completed.total },
          { label: 'Поточний', value: report.data.value.data.current.totals.tasks_completed.total },
        ]"
      />
      <MetricChart
        title="Завершення підзавдань"
        unit="Підзавдання"
        :values="[
          {
            label: 'Базовий',
            value: report.data.value.data.baseline.totals.subtasks_completed.total,
          },
          {
            label: 'Поточний',
            value: report.data.value.data.current.totals.subtasks_completed.total,
          },
        ]"
      />
    </AppCard>
    <AppCard title="Фактичні спостереження сервера">
      <dl class="report-values">
        <div v-for="(label, key) in observationLabels" :key="key">
          <dt>{{ label }}</dt>
          <dd>{{ directionLabels[report.data.value.data.observations[key]] }}</dd>
        </div>
        <div>
          <dt>Невідомі хвилини в базовому періоді</dt>
          <dd>
            {{
              report.data.value.data.observations.baseline_has_unknown_actual_minutes ? 'Так' : 'Ні'
            }}
          </dd>
        </div>
        <div>
          <dt>Невідомі хвилини в поточному періоді</dt>
          <dd>
            {{
              report.data.value.data.observations.current_has_unknown_actual_minutes ? 'Так' : 'Ні'
            }}
          </dd>
        </div>
      </dl>
      <p class="helper">
        Сесії належать до місцевої дати початкового початку; перенесені попередники та заміни
        зберігаються окремо.
      </p>
    </AppCard>
  </template>
</template>
