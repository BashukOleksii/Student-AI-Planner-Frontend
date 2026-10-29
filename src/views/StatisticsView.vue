<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { statisticsApi } from '@/api/statistics'
import { today, addDays, calendarLabel } from '@/utils/dates'
import { exactDateTime } from '@/utils/planning'
import { sessionKeys } from '@/utils/statistics'
import type { Progress } from '@/types/api'
import type { ProgressTrends } from '@/types/statistics'
import StatisticsNav from '@/components/statistics/StatisticsNav.vue'
import ReportRangeForm from '@/components/statistics/ReportRangeForm.vue'
import CompletionSummary from '@/components/statistics/CompletionSummary.vue'
import SessionSummary from '@/components/statistics/SessionSummary.vue'
import ActivitySummary from '@/components/statistics/ActivitySummary.vue'
import MetricChart from '@/components/statistics/MetricChart.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const trends = useRoute().path.endsWith('/trends'),
  auth = useAuthStore(),
  date = today(auth.user?.timezone ?? 'UTC'),
  range = ref({ start_date: addDays(date, -6), end_date: date })
const report = useResource(
  async (
    signal,
  ): Promise<{ kind: 'progress'; data: Progress } | { kind: 'trends'; data: ProgressTrends }> =>
    trends
      ? { kind: 'trends', data: (await statisticsApi.trends(range.value, signal)).data }
      : { kind: 'progress', data: (await statisticsApi.progress(range.value, signal)).data },
  [range],
)
const empty = computed(() => {
  const r = report.data.value
  if (!r) return false
  if (r.kind === 'progress')
    return (
      r.data.tasks.current.total === 0 &&
      r.data.subtasks.current.total === 0 &&
      Object.values(r.data.study_sessions.started_in_period).every((value) =>
        typeof value === 'number' ? value === 0 : value.count === 0,
      )
    )
  return (
    r.data.totals.tasks_completed.total === 0 &&
    r.data.totals.subtasks_completed.total === 0 &&
    sessionKeys.every((key) => r.data.totals.study_sessions[key].count === 0)
  )
})
</script>
<template>
  <header class="page-heading">
    <div>
      <h1>{{ trends ? 'Щоденні тренди' : 'Статистика прогресу' }}</h1>
      <p class="muted">
        Окремі показники завдань, підзавдань і навчальних сесій. Усі підсумки надає сервер.
      </p>
    </div>
  </header>
  <StatisticsNav />
  <AppCard>
    <ReportRangeForm
      :initial="range"
      :timezone="auth.user?.timezone ?? 'UTC'"
      :busy="report.loading.value"
      @apply="range = $event"
    />
  </AppCard>
  <LoadingState v-if="report.loading.value" />
  <FormNotice v-else-if="report.error.value" :error="report.error.value" />
  <AppButton v-if="report.error.value" @click="report.reload">Повторити читання звіту</AppButton>
  <template v-if="report.data.value">
    <p class="helper">
      {{ report.data.value.data.period.start_date }} —
      {{ report.data.value.data.period.end_date }} · {{ report.data.value.data.timezone }} · стан на
      {{ exactDateTime(report.data.value.data.as_of_utc, report.data.value.data.timezone) }}
    </p>
    <EmptyState
      v-if="empty"
      title="Активність ще не зафіксовано"
      description="Нульові значення показано з відповіді сервера; майбутня активність не прогнозується."
    />
    <p class="report-warning">
      Це активність, видима в поточних даних, а не незмінний історичний знімок. Повторне відкриття
      або видалення роботи може змінити попередні результати. Зростання показника саме по собі не
      означає покращення.
    </p>
    <template v-if="report.data.value.kind === 'progress'">
      <AppCard title="Поточний стан роботи — за весь час">
        <p class="helper">
          Ці значення не обмежені обраним періодом і не є станом на його кінець. Завдання й
          підзавдання не додаються в одну популяцію.
        </p>
        <div class="form-grid">
          <section v-for="key in ['tasks', 'subtasks'] as const" :key="key">
            <h3>{{ key === 'tasks' ? 'Завдання' : 'Підзавдання' }}</h3>
            <dl class="report-values">
              <div>
                <dt>Усього поточних</dt>
                <dd>{{ report.data.value.data[key].current.total }}</dd>
              </div>
              <div>
                <dt>До виконання зараз</dt>
                <dd>{{ report.data.value.data[key].current.pending }}</dd>
              </div>
              <div>
                <dt>Завершені зараз</dt>
                <dd>{{ report.data.value.data[key].current.completed }}</dd>
              </div>
              <div>
                <dt>Прострочені до виконання зараз</dt>
                <dd>{{ report.data.value.data[key].current.overdue_pending }}</dd>
              </div>
            </dl>
          </section>
        </div>
      </AppCard>
      <AppCard title="Завершення в обраному періоді">
        <div class="form-grid">
          <CompletionSummary
            title="Завдання"
            :metrics="report.data.value.data.tasks.completed_in_period"
          />
          <CompletionSummary
            title="Підзавдання"
            :metrics="report.data.value.data.subtasks.completed_in_period"
          />
        </div>
        <MetricChart
          title="Завершення за період — окремі популяції"
          unit="Записи"
          :values="[
            { label: 'Завдання', value: report.data.value.data.tasks.completed_in_period.total },
            {
              label: 'Підзавдання',
              value: report.data.value.data.subtasks.completed_in_period.total,
            },
          ]"
        />
      </AppCard>
      <AppCard title="Навчальна активність за період">
        <SessionSummary :metrics="report.data.value.data.study_sessions.started_in_period" chart />
      </AppCard>
    </template>
    <template v-else>
      <p class="helper">
        Щоденне групування за місцевими датами сервера. Сесія належить до початкового starts_at,
        навіть якщо завершилася наступного дня. Нульові дні збережено; попередники й заміни — окремі
        записи.
      </p>
      <AppCard title="Денна активність">
        <MetricChart
          title="Завершені завдання за днями"
          unit="Завдання"
          :values="
            report.data.value.data.days.map((day) => ({
              label: day.date,
              value: day.tasks_completed.total,
            }))
          "
        />
        <MetricChart
          title="Завершені підзавдання за днями"
          unit="Підзавдання"
          :values="
            report.data.value.data.days.map((day) => ({
              label: day.date,
              value: day.subtasks_completed.total,
            }))
          "
        />
        <MetricChart
          title="Завершені навчальні сесії за днями"
          unit="Сесії"
          :values="
            report.data.value.data.days.map((day) => ({
              label: day.date,
              value: day.study_sessions.completed.count,
            }))
          "
        />
        <MetricChart
          title="Відомі фактичні хвилини за днями"
          unit="Хвилини"
          :values="
            report.data.value.data.days.map((day) => ({
              label: day.date,
              value: day.study_sessions.completed_actual_minutes,
            }))
          "
        />
      </AppCard>
      <AppCard title="Підсумки періоду за даними сервера">
        <ActivitySummary :metrics="report.data.value.data.totals" />
      </AppCard>
      <AppCard title="Точні щоденні значення">
        <details v-for="day in report.data.value.data.days" :key="day.date" class="daily-report">
          <summary>
            {{ calendarLabel(day.date) }} · {{ day.date }} · завдань
            {{ day.tasks_completed.total }} · підзавдань {{ day.subtasks_completed.total }}
          </summary>
          <ActivitySummary :metrics="day" />
        </details>
      </AppCard>
    </template>
  </template>
</template>
