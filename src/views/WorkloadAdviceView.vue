<script setup lang="ts">
import { localErrorText } from '@/utils/publicText'

import { computed, ref, watch } from 'vue'
import { useWorkLabels } from '@/composables/useWorkLabels'
import { planningApi } from '@/api/planning'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { today, addDays } from '@/utils/dates'
import { validateRange, duration } from '@/utils/planning'
import { shortWorkloadReason, unscheduledWork, workloadIssues } from '@/utils/workloadDashboard'
import type { DateRange } from '@/types/planning'
import WorkLink from '@/components/planning/WorkLink.vue'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import RangeFields from '@/components/planning/RangeFields.vue'
import WorkloadCharts from '@/components/planning/WorkloadCharts.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'

const date = today(useAuthStore().user?.timezone ?? 'UTC')
const range = ref<DateRange>({ start_date: date, end_date: addDays(date, 6) })
const selected = ref<DateRange | null>({ ...range.value })
const localError = ref('')
const resource = useResource(
  async (signal) => (selected.value ? planningApi.workloadAdvice(selected.value, signal) : null),
  [selected],
)
const analyticsResource = useResource(
  async (signal) => (selected.value ? planningApi.workloadAnalytics(selected.value, signal) : null),
  [selected],
)
const report = computed(() => (selected.value ? (resource.data.value?.data ?? null) : null))
const analytics = computed(() => (selected.value ? analyticsResource.data.value?.data : null))
const history = computed(() => analytics.value?.all_time)
const coverage = computed(() =>
  report.value?.summary.requested_seconds
    ? Math.round(
        (report.value.summary.allocated_seconds / report.value.summary.requested_seconds) * 100,
      )
    : null,
)
const issues = computed(() => workloadIssues(report.value))
const unplanned = computed(() => unscheduledWork(report.value))
const pageSize = 4
const issuePage = ref(1),
  workPage = ref(1),
  limitPage = ref(1)
const visibleIssues = computed(() =>
  issues.value.slice((issuePage.value - 1) * pageSize, issuePage.value * pageSize),
)
const visibleWork = computed(() =>
  unplanned.value.slice((workPage.value - 1) * pageSize, workPage.value * pageSize),
)
const violations = computed(() => report.value?.persisted_workload_violations ?? [])
const visibleLimits = computed(() =>
  violations.value.slice((limitPage.value - 1) * pageSize, limitPage.value * pageSize),
)
watch(selected, () => {
  issuePage.value = workPage.value = limitPage.value = 1
})
watch(
  range,
  () => {
    selected.value = null
    localError.value = ''
  },
  { deep: true, flush: 'sync' },
)
function search() {
  localError.value = ''
  try {
    validateRange(range.value)
    selected.value = { ...range.value }
  } catch (error) {
    selected.value = null
    localError.value = localErrorText(error, 'Перевірте період.')
  }
}
useWorkLabels(() => resource.data.value)
</script>

<template>
  <div class="page-workspace page-planning">
    <div class="workload-analysis workload-dashboard">
      <header class="page-heading"><h1>Аналіз навчального навантаження</h1></header>
      <PlanningNav />
      <AppCard>
        <form class="workload-period" @submit.prevent="search">
          <RangeFields v-model="range" compact />
          <AppButton type="submit" variant="primary" :busy="resource.loading.value">
            Проаналізувати навантаження
          </AppButton>
          <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
        </form>
      </AppCard>
      <LoadingState v-if="resource.loading.value" />
      <div v-else-if="resource.error.value" class="stack">
        <FormNotice :error="resource.error.value" />
        <AppButton @click="search">Спробувати ще раз</AppButton>
      </div>
      <template v-else-if="report">
        <div class="workload-results-heading">
          <h2>Ваше навантаження</h2>
          <span class="helper workload-freshness">
            {{ report.period.start_date }} — {{ report.period.end_date }}
          </span>
        </div>
        <dl class="workload-metrics workload-summary" aria-label="Основні показники">
          <div class="workload-metric">
            <dt>Потрібно виконати</dt>
            <dd>{{ duration(report.summary.requested_seconds) }}</dd>
            <dd class="metric-note">Залишок для нового плану</dd>
          </div>
          <div v-if="analytics" class="workload-metric">
            <dt>Уже заплановано</dt>
            <dd>{{ duration(analytics.planned_seconds) }}</dd>
            <dd class="metric-note">Збережені сесії за період</dd>
          </div>
          <div
            class="workload-metric"
            :class="{ 'metric-attention': report.summary.unscheduled_seconds > 0 }"
          >
            <dt>Ще не заплановано</dt>
            <dd>{{ duration(report.summary.unscheduled_seconds) }}</dd>
            <dd class="metric-note">З роботи з відомою оцінкою</dd>
          </div>
          <div class="workload-metric">
            <dt>Відсоток покриття</dt>
            <dd>{{ coverage === null ? '—' : `${coverage}%` }}</dd>
            <dd class="metric-note">Новою пропозицією плану</dd>
          </div>
        </dl>

        <AppCard title="Чи вистачає часу на навчання" class="workload-coverage">
          <p v-if="report.summary.requested_seconds === 0" role="status">
            Немає роботи для нового плану за вибраний період
          </p>
          <div v-else class="coverage-content">
            <div
              class="coverage-ring"
              :style="{
                '--coverage': `${coverage ?? 0}%`,
                '--ring-rest': coverage === null ? 'var(--subtle)' : 'var(--secondary)',
              }"
              role="img"
              :aria-label="
                coverage === null
                  ? 'Немає роботи з відомою оцінкою часу'
                  : `Пропозиція покриває ${coverage}% роботи`
              "
            >
              <div>
                <strong>{{ coverage === null ? '—' : `${coverage}%` }}</strong>
                <span>покриття</span>
              </div>
            </div>
            <div class="coverage-copy">
              <h3>
                {{
                  coverage === null
                    ? 'Немає роботи для нового плану'
                    : report.summary.fully_allocated
                      ? 'Для цієї роботи часу вистачає'
                      : 'Частина роботи потребує уваги'
                }}
              </h3>
              <dl class="coverage-legend">
                <div>
                  <dt>
                    <i class="legend-dot planned"></i>
                    Можна запланувати
                  </dt>
                  <dd>{{ duration(report.summary.allocated_seconds) }}</dd>
                </div>
                <div>
                  <dt>
                    <i class="legend-dot unplanned"></i>
                    Не вдалося запланувати
                  </dt>
                  <dd>{{ duration(report.summary.unscheduled_seconds) }}</dd>
                </div>
              </dl>
              <p class="helper">Це пропозиція. Щоб додати сесії, збережіть новий план.</p>
            </div>
            <RouterLink to="/planning/preview" class="button primary">
              Переглянути новий план
            </RouterLink>
          </div>
        </AppCard>

        <LoadingState v-if="analyticsResource.loading.value" />
        <div v-else-if="analyticsResource.error.value" class="workload-analytics-error">
          <p role="status">Графіки та історія поки недоступні.</p>
          <AppButton :busy="analyticsResource.loading.value" @click="analyticsResource.reload">
            Повторити завантаження графіків
          </AppButton>
        </div>
        <WorkloadCharts v-else-if="analytics" :analytics="analytics" />

        <div class="workload-detail-grid">
          <AppCard title="Що заважає запланувати" data-source="allocation">
            <template #action>
              <span class="count-badge">{{ issues.length }}</span>
            </template>
            <p v-if="!issues.length" class="workload-empty">Перешкод для планування не виявлено.</p>
            <ul v-else class="workload-compact-list" aria-label="Причини та попередження">
              <li
                v-for="issue in visibleIssues"
                :key="issue.code"
                class="workload-issue"
                :class="`issue-${issue.tone}`"
              >
                <span class="issue-mark" aria-hidden="true">
                  {{ issue.tone === 'info' ? 'i' : '!' }}
                </span>
                <div>
                  <strong>{{ issue.label }}</strong>
                  <p class="helper">
                    Робіт: {{ issue.count }}
                    <span v-if="issue.seconds !== null && issue.seconds > 0">
                      · {{ duration(issue.seconds) }}
                    </span>
                  </p>
                </div>
                <span class="count-badge" :aria-label="`Кількість робіт: ${issue.count}`">
                  {{ issue.count }}
                </span>
              </li>
            </ul>
            <PageNavigation
              v-if="issues.length > pageSize"
              compact
              aria-label="Сторінки причин"
              :current="issuePage"
              :last="Math.ceil(issues.length / pageSize)"
              :total="issues.length"
              @page="issuePage = $event"
            />
            <details v-if="issues.length" class="workload-more">
              <summary>Що можна змінити</summary>
              <div class="actions">
                <RouterLink to="/planning/preferences">Ліміти й перерви</RouterLink>
                <RouterLink to="/planning/availability">Доступний час</RouterLink>
              </div>
              <p class="helper">Одна робота може мати кілька причин — їхній час не додається.</p>
            </details>
          </AppCard>

          <AppCard title="Що поки не вдалося запланувати" data-source="selection">
            <template #action>
              <span class="count-badge">{{ unplanned.length }}</span>
            </template>
            <p v-if="!unplanned.length" class="workload-empty">
              Роботи, що потребує додаткового планування, немає.
            </p>
            <ul v-else class="workload-compact-list" aria-label="Незапланована робота">
              <li v-for="work in visibleWork" :key="work.key" class="workload-unplanned">
                <div class="workload-row-heading">
                  <WorkLink :task-id="work.task_id" :subtask-id="work.subtask_id" />
                  <strong>
                    {{ work.seconds === null ? 'Час не вказано' : duration(work.seconds) }}
                  </strong>
                </div>
                <p class="helper">
                  <span v-if="work.subtask_id !== null">Підзавдання ·</span>
                  {{ shortWorkloadReason(work.reason_codes[0] ?? 'unscheduled_work') }}
                </p>
                <details v-if="work.reason_codes.length > 1" class="workload-more">
                  <summary>Усі причини</summary>
                  <ul>
                    <li
                      v-for="reason in [...new Set(work.reason_codes.map(shortWorkloadReason))]"
                      :key="reason"
                    >
                      {{ reason }}
                    </li>
                  </ul>
                </details>
              </li>
            </ul>
            <PageNavigation
              v-if="unplanned.length > pageSize"
              compact
              aria-label="Сторінки незапланованої роботи"
              :current="workPage"
              :last="Math.ceil(unplanned.length / pageSize)"
              :total="unplanned.length"
              @page="workPage = $event"
            />
          </AppCard>
        </div>

        <AppCard
          v-if="analytics || violations.length"
          title="Уже заплановане навчання"
          data-source="persisted_workload"
        >
          <template #action><RouterLink to="/planning/sessions">До сесій →</RouterLink></template>
          <div class="existing-plan-summary">
            <strong v-if="analytics">
              {{ duration(analytics.planned_seconds) }}
              <span class="helper">· Сесій у плані: {{ analytics.planned_sessions }}</span>
            </strong>
            <span class="badge" :class="violations.length ? 'warning' : 'success'">
              {{
                violations.length ? `Перевищень лімітів: ${violations.length}` : 'У межах лімітів'
              }}
            </span>
          </div>
          <details v-if="violations.length" class="workload-more">
            <summary>Переглянути перевищення</summary>
            <ul class="workload-compact-list">
              <li
                v-for="violation in visibleLimits"
                :key="`${violation.code}:${violation.period}`"
                class="workload-limit"
              >
                <div>
                  <strong>
                    {{ violation.period_kind === 'day' ? 'День' : 'Тиждень' }}
                    {{ violation.period }}
                  </strong>
                  <p class="helper">
                    {{ duration(violation.scheduled_seconds) }} із
                    {{ duration(violation.limit_seconds) }} дозволених
                  </p>
                </div>
                <span class="badge warning">+{{ duration(violation.excess_seconds) }}</span>
              </li>
            </ul>
            <PageNavigation
              v-if="violations.length > pageSize"
              compact
              aria-label="Сторінки перевищень лімітів"
              :current="limitPage"
              :last="Math.ceil(violations.length / pageSize)"
              :total="violations.length"
              @page="limitPage = $event"
            />
          </details>
        </AppCard>

        <AppCard v-if="history" title="Ваш прогрес за весь час">
          <dl class="workload-metrics history-metrics">
            <div class="workload-metric">
              <dt>Виконано за весь час</dt>
              <dd>
                {{
                  history.completed_sessions === history.sessions_without_actual_minutes &&
                  history.completed_sessions > 0
                    ? '—'
                    : `${history.completed_actual_minutes} хв`
                }}
              </dd>
              <dd class="metric-note">Записаний фактичний час</dd>
            </div>
            <div class="workload-metric">
              <dt>Завершені сесії</dt>
              <dd>{{ history.completed_sessions }}</dd>
            </div>
            <div class="workload-metric">
              <dt>Завершені завдання</dt>
              <dd>{{ history.completed_tasks }}</dd>
            </div>
            <div class="workload-metric">
              <dt>Завершені підзавдання</dt>
              <dd>{{ history.completed_subtasks }}</dd>
            </div>
            <div v-if="history.task_completion_percent !== null" class="workload-metric">
              <dt>Виконання завдань</dt>
              <dd>
                {{ history.task_completion_percent }}%
                <progress
                  :value="history.task_completion_percent"
                  max="100"
                  aria-label="Частка завершених завдань"
                />
              </dd>
            </div>
          </dl>
          <p v-if="history.sessions_without_actual_minutes" class="helper">
            Завершених сесій без записаного часу: {{ history.sessions_without_actual_minutes }}.
            Підсумок хвилин неповний.
          </p>
        </AppCard>
      </template>
      <p v-else-if="!localError" class="helper">
        Період змінено. Запросіть аналіз для вибраних дат.
      </p>
    </div>
  </div>
</template>

<style src="@/styles/workload.css"></style>
