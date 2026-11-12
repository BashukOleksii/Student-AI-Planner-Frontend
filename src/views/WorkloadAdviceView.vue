<script setup lang="ts">
import { useWorkLabels } from '@/composables/useWorkLabels'
import { computed, ref, watch } from 'vue'
import { planningApi } from '@/api/planning'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { today, addDays } from '@/utils/dates'
import { validateRange, duration, exactDateTime } from '@/utils/planning'
import { workloadReasonLabel, workloadDuration, effortFields } from '@/utils/workload'
import type { DateRange, WorkloadAdvice } from '@/types/planning'
import WorkLink from '@/components/planning/WorkLink.vue'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import RangeFields from '@/components/planning/RangeFields.vue'
import WorkloadRecommendations from '@/components/planning/WorkloadRecommendations.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import DetailSection from '@/components/ui/DetailSection.vue'

const priorities: Record<number, string> = { 1: 'Низький', 2: 'Звичайний', 3: 'Високий' }
const date = today(useAuthStore().user?.timezone ?? 'UTC')
const range = ref<DateRange>({ start_date: date, end_date: addDays(date, 6) })
const selected = ref<DateRange | null>({ ...range.value }),
  localError = ref('')
const resource = useResource(
  async (signal) => (selected.value ? planningApi.workloadAdvice(selected.value, signal) : null),
  [selected],
)
const report = computed(() => (selected.value ? resource.data.value?.data : null))
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
    localError.value = error instanceof Error ? error.message : 'Перевірте період.'
  }
}
const sources: {
  source: WorkloadAdvice['alerts'][number]['source']
  title: string
  explanation: string
}[] = [
  {
    source: 'allocation',
    title: 'Обмеження поточного розміщення',
    explanation:
      'Це обмеження поточної пропозиції. Інша доступність, тривалість сесій або перерви можуть дати інший план.',
  },
  {
    source: 'selection',
    title: 'Робота поза пропозицією',
    explanation:
      'Цю роботу не включено до запропонованого часу. Нижче можна перевірити причину та уточнити потрібні дані.',
  },
  {
    source: 'persisted_workload',
    title: 'Наявне заплановане навантаження',
    explanation:
      'Уже збережені сесії перевищують ваші обмеження навчального часу. Перегляньте сесії або ліміти.',
  },
]
useWorkLabels(() => resource.data.value)
</script>
<template>
  <div class="page-workspace page-planning">
    <div class="workload-analysis">
      <header class="page-heading">
        <div>
          <h1>Аналіз навчального навантаження</h1>
          <p class="muted">
            Перевірте, скільки роботи вдалося розмістити у вибраному періоді, які обмеження
            впливають на планування та що варто переглянути.
          </p>
        </div>
      </header>
      <PlanningNav />
      <AppCard>
        <form class="stack" @submit.prevent="search">
          <RangeFields v-model="range" />
          <p class="helper">
            Аналіз лише читає дані. Він не зберігає сесії та не змінює завдання або вподобання.
          </p>
          <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
          <AppButton type="submit" variant="primary" :busy="resource.loading.value">
            Проаналізувати навантаження
          </AppButton>
        </form>
      </AppCard>
      <LoadingState v-if="resource.loading.value" />
      <div v-else-if="resource.error.value">
        <FormNotice :error="resource.error.value" />
        <AppButton @click="search">Спробувати ще раз</AppButton>
      </div>
      <template v-else-if="report">
        <p class="helper workload-freshness">
          Період: {{ report.period.start_date }} — {{ report.period.end_date }} ·
          {{ report.timezone }}. Дані оновлено
          {{ exactDateTime(report.as_of_utc, report.timezone) }}. Для актуального результату оновіть
          аналіз.
        </p>
        <AppButton @click="search">Оновити аналіз</AppButton>
        <AppCard title="Чи вистачить часу на роботу">
          <dl class="report-values workload-summary">
            <div>
              <dt>Потрібно розмістити</dt>
              <dd>{{ duration(report.summary.requested_seconds) }}</dd>
            </div>
            <div>
              <dt>Розміщено</dt>
              <dd>{{ duration(report.summary.allocated_seconds) }}</dd>
            </div>
            <div>
              <dt>Не розміщено</dt>
              <dd>{{ duration(report.summary.unscheduled_seconds) }}</dd>
            </div>
            <div>
              <dt>Повнота розміщення</dt>
              <dd>
                {{
                  report.summary.fully_allocated
                    ? 'Увесь придатний залишок розміщено'
                    : 'Залишилася нерозміщена робота'
                }}
              </dd>
            </div>
          </dl>
          <progress
            v-if="report.summary.requested_seconds > 0"
            :value="report.summary.allocated_seconds"
            :max="report.summary.requested_seconds"
            aria-label="Розміщена частина придатного залишку роботи"
          />
          <EmptyState
            v-else
            title="Придатного залишку для розміщення немає"
            description="Перегляньте виключену роботу та діагностику: нульовий залишок не означає виконання всіх завдань."
          />
          <details class="context-help">
            <summary>Докладніше</summary>
            <p class="helper">
              Потрібна тривалість — придатні залишкові зусилля після зарахування виконаного та
              чинних резервувань, а не початкова оцінка всіх завдань. Повне розміщення не означає
              завершення всіх завдань, відсутність виключень чи прострочених дедлайнів або перевірку
              всіх можливих планів.
            </p>
          </details>
        </AppCard>
        <div class="workload-alert-grid">
          <AppCard
            v-for="group in sources"
            :key="group.source"
            :title="group.title"
            :data-source="group.source"
          >
            <p class="helper">{{ group.explanation }}</p>
            <p v-if="!report.alerts.some((a) => a.source === group.source)" class="helper">
              Повідомлень цієї групи немає.
            </p>
            <div
              v-for="(alert, index) in report.alerts.filter((a) => a.source === group.source)"
              :key="index"
              class="workload-alert"
              :class="{ 'planning-warning': alert.severity === 'warning' }"
              role="status"
            >
              <strong>{{ alert.severity === 'warning' ? 'Попередження' : 'Інформація' }}</strong>
              <div>
                {{ workloadReasonLabel(alert.code, group.source) }}
                <details class="tool-metadata">
                  <summary>Код причини</summary>
                  <code>{{ alert.code }}</code>
                </details>
              </div>
              <p>
                Тривалість: {{ workloadDuration(alert.affected_seconds) }} · Одиниць роботи:
                {{ alert.affected_work_count }}
              </p>
            </div>
            <template v-if="group.source === 'persisted_workload'">
              <details class="context-help">
                <summary>Докладніше</summary>
                <p class="helper">
                  Денне та тижневе перевищення можуть стосуватися тих самих сесій. Їх не слід
                  додавати як окремий борг. ISO-тиждень використовує рік ISO-тижня, який може
                  відрізнятися від календарного року дат.
                </p>
              </details>
              <article
                v-for="(violation, index) in report.persisted_workload_violations"
                :key="index"
                class="session-card workload-violation"
              >
                <h3>
                  {{ violation.period_kind === 'day' ? 'День' : 'ISO-тиждень' }}
                  {{ violation.period }}
                </h3>
                <p>{{ workloadReasonLabel(violation.code, 'persisted_workload') }}</p>
                <dl class="report-values">
                  <div>
                    <dt>Заплановано</dt>
                    <dd>{{ duration(violation.scheduled_seconds) }}</dd>
                  </div>
                  <div>
                    <dt>Установлений ліміт</dt>
                    <dd>{{ duration(violation.limit_seconds) }}</dd>
                  </div>
                  <div>
                    <dt>Перевищення</dt>
                    <dd>{{ duration(violation.excess_seconds) }}</dd>
                  </div>
                </dl>
              </article>
            </template>
          </AppCard>
        </div>
        <p class="helper">
          Одна робота може мати кілька причин. Тривалості повідомлень не додаються; загальний
          залишок береться лише з підсумку сервера.
        </p>
        <AppCard title="Порядок роботи та рекомендації">
          <p class="helper">
            Рекомендована послідовність роботи. Відкрийте завдання, щоб уточнити дедлайн або оцінку
            часу.
          </p>
          <p v-if="!report.work_advice.length" class="helper">
            Рекомендацій щодо придатної роботи немає.
          </p>
          <ol class="workload-ranked-list" role="list">
            <li
              v-for="(work, index) in report.work_advice"
              :key="index"
              :value="work.rank"
              class="session-card workload-advice"
            >
              <h3>
                Порядок {{ work.rank }} ·
                <WorkLink :task-id="work.task_id" />
                <template v-if="work.subtask_id !== null">{{ ' · Навчальний крок' }}</template>
              </h3>
              <dl class="report-values">
                <div>
                  <dt>Потрібно розмістити</dt>
                  <dd>{{ duration(work.requested_seconds) }}</dd>
                </div>
                <div>
                  <dt>Розміщено</dt>
                  <dd>{{ duration(work.allocated_seconds) }}</dd>
                </div>
                <div>
                  <dt>Не розміщено</dt>
                  <dd>{{ duration(work.unscheduled_seconds) }}</dd>
                </div>
              </dl>
              <ul v-if="work.reason_codes.length">
                <li v-for="(code, codeIndex) in work.reason_codes" :key="codeIndex">
                  {{ workloadReasonLabel(code) }}
                  <details class="tool-metadata">
                    <summary>Код причини</summary>
                    <code>{{ code }}</code>
                  </details>
                </li>
              </ul>
              <WorkloadRecommendations :codes="work.recommendation_codes" :task-id="work.task_id" />
            </li>
          </ol>
        </AppCard>
        <AppCard title="Виключена робота">
          <details class="context-help">
            <summary>Докладніше</summary>
            <p class="helper">
              Ці записи не є придатною новою роботою цього аналізу. Зокрема, завершена, повністю
              зарезервована робота або батьківське завдання з визначальними підзавданнями не
              потребують повторного планування лише через наявність у цьому списку.
            </p>
          </details>
          <p v-if="!report.excluded_items.length" class="helper">Виключених записів немає.</p>
          <article
            v-for="(item, index) in report.excluded_items"
            :key="index"
            class="session-card workload-excluded"
          >
            <h3>
              <WorkLink :task-id="item.task_id" />
              <template v-if="item.subtask_id !== null">{{ ' · Навчальний крок' }}</template>
            </h3>
            <p>
              {{ item.work_type === 'task' ? 'Завдання' : 'Підзавдання' }} · Пріоритет завдання:
              {{ priorities[item.priority] ?? 'Не вказано' }}
            </p>
            <p>
              Дедлайн:
              {{
                item.effective_deadline_utc === null
                  ? 'Невідомо / не вказано'
                  : exactDateTime(
                      new Date(item.effective_deadline_utc * 1000).toISOString(),
                      report.timezone,
                    )
              }}
            </p>
            <template v-if="item.effort">
              <dl class="report-values">
                <div>
                  <dt>Залишилося роботи</dt>
                  <dd>{{ workloadDuration(item.effort.remaining_work_seconds) }}</dd>
                </div>
                <div>
                  <dt>Час у майбутніх сесіях</dt>
                  <dd>{{ workloadDuration(item.effort.future_reserved_seconds) }}</dd>
                </div>
              </dl>
              <DetailSection title="Як враховано час" class="workload-effort-details">
                <dl class="report-values">
                  <div v-for="field in effortFields" :key="field.key">
                    <dt>{{ field.label }}</dt>
                    <dd>{{ workloadDuration(item.effort[field.key]) }}</dd>
                  </div>
                </dl>
              </DetailSection>
            </template>
            <p v-else class="helper">Дані про зусилля: Невідомо. Це не нульова тривалість.</p>
            <ul>
              <li v-for="(code, codeIndex) in item.reason_codes" :key="codeIndex">
                {{ workloadReasonLabel(code) }}
                <details class="tool-metadata">
                  <summary>Код причини</summary>
                  <code>{{ code }}</code>
                </details>
              </li>
            </ul>
            <WorkloadRecommendations :codes="item.recommendation_codes" :task-id="item.task_id" />
          </article>
        </AppCard>
        <AppCard title="Додаткові застереження">
          <p class="helper">
            Наприклад, надлишкове резервування саме по собі не доводить перевищення денного або
            тижневого ліміту.
          </p>
          <p v-if="!report.warnings.length" class="helper">Додаткових застережень немає.</p>
          <article
            v-for="(warning, index) in report.warnings"
            :key="index"
            class="session-card workload-warning"
          >
            <div>
              {{ workloadReasonLabel(warning.code) }}
              <details class="tool-metadata">
                <summary>Код причини</summary>
                <code>{{ warning.code }}</code>
              </details>
            </div>
            <p>
              <WorkLink :task-id="warning.task_id" />
              <template v-if="warning.subtask_id !== null">{{ ' · Навчальний крок' }}</template>
              <template v-if="warning.study_session_id !== null">
                ·
                <RouterLink :to="`/planning/sessions/${warning.study_session_id}`">
                  Переглянути навчальну сесію
                </RouterLink>
              </template>
            </p>
            <p>Тривалість: {{ duration(warning.seconds) }}</p>
          </article>
        </AppCard>
        <div class="actions">
          <RouterLink to="/planning/preview" class="button primary">
            До нового огляду плану
          </RouterLink>
          <RouterLink to="/planning/preferences" class="button secondary">
            Переглянути ліміти й перерви
          </RouterLink>
          <RouterLink to="/planning/availability" class="button secondary">
            Переглянути доступність
          </RouterLink>
        </div>
      </template>
      <p v-else-if="!localError" class="helper">
        Період змінено. Запросіть аналіз для вибраних дат.
      </p>
    </div>
  </div>
</template>
