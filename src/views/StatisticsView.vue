<script setup lang="ts">
import { localErrorText } from '@/utils/publicText'

import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { statisticsApi } from '@/api/statistics'
import { today, addDays } from '@/utils/dates'
import { validateComparison } from '@/utils/statistics'
import ReportRangeForm from '@/components/statistics/ReportRangeForm.vue'
import ProgressOverview from '@/components/statistics/ProgressOverview.vue'
import ProgressTrends from '@/components/statistics/ProgressTrends.vue'
import PeriodComparison from '@/components/statistics/PeriodComparison.vue'
import SubjectWorkload from '@/components/statistics/SubjectWorkload.vue'
import RangeFields from '@/components/planning/RangeFields.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const auth = useAuthStore(),
  date = today(auth.user?.timezone ?? 'UTC')
const range = ref({ start_date: addDays(date, -6), end_date: date })
const progress = useResource((signal) => statisticsApi.progress(range.value, signal), [range])
const trends = useResource((signal) => statisticsApi.trends(range.value, signal), [range])
const baseline = ref({ start_date: addDays(date, -13), end_date: addDays(date, -7) })
const current = ref({ ...range.value })
const input = ref({
  baseline_start_date: baseline.value.start_date,
  baseline_end_date: baseline.value.end_date,
  current_start_date: current.value.start_date,
  current_end_date: current.value.end_date,
})
const comparison = useResource((signal) => statisticsApi.comparison(input.value, signal), [input])
const localError = ref('')
function compare() {
  localError.value = ''
  try {
    validateComparison(baseline.value, current.value)
    input.value = {
      baseline_start_date: baseline.value.start_date,
      baseline_end_date: baseline.value.end_date,
      current_start_date: current.value.start_date,
      current_end_date: current.value.end_date,
    }
  } catch (error) {
    localError.value = localErrorText(error, '')
  }
}
</script>
<template>
  <div class="page-workspace progress-page">
    <header class="page-heading"><h1>Прогрес</h1></header>
    <AppCard class="progress-filter" aria-label="Період огляду">
      <ReportRangeForm
        :initial="range"
        :timezone="auth.user?.timezone ?? 'UTC'"
        :busy="progress.loading.value || trends.loading.value"
        @apply="range = $event"
      />
    </AppCard>
    <AppCard title="Огляд прогресу" class="progress-overview">
      <template #action>
        <span v-if="progress.data.value" class="helper">
          {{ progress.data.value.data.period.start_date }} —
          {{ progress.data.value.data.period.end_date }}
        </span>
      </template>
      <LoadingState v-if="progress.loading.value" />
      <template v-else-if="progress.error.value">
        <FormNotice :error="progress.error.value" />
        <AppButton @click="progress.reload">Повторити читання звіту</AppButton>
      </template>
      <ProgressOverview v-else-if="progress.data.value" :report="progress.data.value.data" />
    </AppCard>
    <AppCard v-if="progress.data.value" title="Статистика за предметами" class="progress-subjects">
      <SubjectWorkload :groups="progress.data.value.data.subject_workload_in_period" />
    </AppCard>
    <AppCard title="Тренди" class="progress-trends">
      <template #action>
        <span v-if="trends.data.value" class="helper">
          {{ trends.data.value.data.period.start_date }} —
          {{ trends.data.value.data.period.end_date }}
        </span>
      </template>
      <LoadingState v-if="trends.loading.value" />
      <template v-else-if="trends.error.value">
        <FormNotice :error="trends.error.value" />
        <AppButton @click="trends.reload">Повторити завантаження трендів</AppButton>
      </template>
      <ProgressTrends v-else-if="trends.data.value" :report="trends.data.value.data" />
    </AppCard>
    <AppCard title="Порівняння періодів" class="progress-comparison">
      <form class="comparison-form" @submit.prevent="compare">
        <fieldset>
          <legend>Період A</legend>
          <RangeFields v-model="baseline" min-date="0001-01-01" compact />
        </fieldset>
        <fieldset>
          <legend>Період B</legend>
          <RangeFields v-model="current" min-date="0001-01-01" compact />
        </fieldset>
        <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
        <AppButton type="submit" :busy="comparison.loading.value">Порівняти періоди</AppButton>
      </form>
      <LoadingState v-if="comparison.loading.value" />
      <template v-else-if="comparison.error.value">
        <FormNotice :error="comparison.error.value" />
        <AppButton @click="comparison.reload">Повторити завантаження порівняння</AppButton>
      </template>
      <PeriodComparison v-else-if="comparison.data.value" :report="comparison.data.value.data" />
    </AppCard>
  </div>
</template>
<style scoped>
.progress-page {
  display: grid;
  gap: 20px;
}
.progress-page > .page-heading {
  margin-bottom: 0;
}
.progress-page > .card {
  min-width: 0;
  margin: 0;
  padding: 22px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.progress-page > .progress-filter {
  background: var(--surface);
}
.progress-page :deep(.card-heading) {
  margin-bottom: 18px;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 16px;
}
.comparison-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: end;
  gap: 12px 20px;
  margin-bottom: 20px;
}
.comparison-form fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.comparison-form legend {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
}
.comparison-form > .button {
  justify-self: end;
  grid-column: 1 / -1;
}
.comparison-form .field-error {
  grid-column: 1 / -1;
}
.comparison-form :deep(.form-grid) {
  gap: 10px;
}
@media (max-width: 780px) {
  .comparison-form {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 620px) {
  .progress-page {
    gap: 14px;
  }
  .progress-page > .card {
    padding: 16px;
  }
}
</style>
