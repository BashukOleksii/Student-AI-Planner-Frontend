<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { StudyPlan, RecoveryDiagnostics } from '@/types/planning'
import type { StudySession } from '@/types/api'
import { isPublicObject } from '@/utils/ai'
import type { PublicObject } from '@/types/ai'
import { duration } from '@/utils/planning'
import {
  recoveryOutcomes,
  recoveryReasons,
  recoveryWarnings,
  recoveryUnscheduled,
} from '@/utils/recoveryPlanPresentation'
import AppCard from '@/components/ui/AppCard.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
import RecoverySessionList from './RecoverySessionList.vue'
import WorkLink from './WorkLink.vue'

const props = defineProps<{
  plan: StudyPlan
  saved?: boolean
  diagnostics?: RecoveryDiagnostics
  sessionDetails: StudySession[]
}>()
const outcomes = computed(() => recoveryOutcomes(props.diagnostics, props.sessionDetails))
const warnings = computed(() =>
  recoveryWarnings(props.plan, [
    ...outcomes.value.map((session) => session.study_session_id),
    ...props.sessionDetails.map((session) => session.id),
  ]),
)
const unplanned = computed(() => recoveryUnscheduled(props.plan))
const workPage = ref(1),
  warningPage = ref(1)
const pageSize = 3
watch(
  () => props.plan,
  () => {
    workPage.value = warningPage.value = 1
  },
)
const workRows = computed(() =>
  unplanned.value.slice((workPage.value - 1) * pageSize, workPage.value * pageSize),
)
const warningRows = computed(() =>
  warnings.value.slice((warningPage.value - 1) * pageSize, warningPage.value * pageSize),
)
const number = (value: unknown) => (typeof value === 'number' ? value : null)
function remainingSeconds(work: PublicObject) {
  if (typeof work.unscheduled_seconds === 'number') return work.unscheduled_seconds
  return isPublicObject(work.effort) && typeof work.effort.unallocated_work_seconds === 'number'
    ? work.effort.unallocated_work_seconds
    : null
}
</script>
<template>
  <div class="recovery-plan-review" :data-saved="saved || undefined">
    <AppCard
      :title="saved ? 'План збережено' : 'Пропозиція — ще не збережено'"
      class="recovery-plan-summary"
    >
      <p class="helper recovery-report-period">
        Період: {{ plan.start_date }} — {{ plan.end_date }} · {{ plan.timezone }}
      </p>
      <dl class="recovery-plan-metrics">
        <div>
          <dt>Потрібно</dt>
          <dd>{{ duration(plan.summary.requested_seconds) }}</dd>
        </div>
        <div>
          <dt>{{ saved ? 'Додано до плану' : 'Знайдено час' }}</dt>
          <dd>{{ duration(plan.summary.allocated_seconds) }}</dd>
        </div>
        <div>
          <dt>Без нового часу</dt>
          <dd>{{ duration(plan.summary.unscheduled_seconds) }}</dd>
        </div>
      </dl>
      <p v-if="!plan.sessions.length" role="status" class="helper">
        Немає нових сесій для відновлення.
      </p>
    </AppCard>
    <RecoverySessionList
      :sessions="plan.sessions"
      :timezone="plan.timezone"
      :title="saved ? 'Додані до плану сесії' : 'Запропоновані сесії'"
      :label="saved ? 'Додано до плану' : 'Запропоновано'"
      class="recovery-new-sessions"
    />
    <AppCard
      v-if="unplanned.length || plan.summary.unscheduled_seconds > 0"
      title="Робота без нового часу"
      class="recovery-unplanned"
    >
      <p v-if="!unplanned.length" class="helper">
        Залишилося знайти {{ duration(plan.summary.unscheduled_seconds) }} для роботи.
      </p>
      <ul v-else class="recovery-compact-list">
        <li v-for="(work, index) in workRows" :key="index" class="recovery-compact-row">
          <div class="recovery-work-heading">
            <WorkLink :task-id="number(work.task_id)" :subtask-id="number(work.subtask_id)" />
            <strong>
              {{
                remainingSeconds(work) === null
                  ? 'Уточніть потрібний час'
                  : duration(remainingSeconds(work)!)
              }}
            </strong>
          </div>
          <p v-for="reason in recoveryReasons(work)" :key="reason" class="helper">{{ reason }}</p>
        </li>
      </ul>
      <PageNavigation
        v-if="unplanned.length > pageSize"
        compact
        :current="workPage"
        :last="Math.ceil(unplanned.length / pageSize)"
        :total="unplanned.length"
        aria-label="Робота без нового часу"
        @page="workPage = $event"
      />
    </AppCard>
    <RecoverySessionList
      :sessions="outcomes"
      :timezone="plan.timezone"
      title="Сесії без результату"
      description="На сторінці сесії можна вказати, чи її виконано або пропущено"
      class="recovery-outcomes"
    />
    <RecoverySessionList
      v-if="diagnostics?.missed_sessions.length"
      :sessions="diagnostics.missed_sessions"
      :timezone="plan.timezone"
      title="Пропущені сесії"
      class="recovery-missed"
    />
    <AppCard v-if="warnings.length" title="Варто врахувати" class="recovery-other-warnings">
      <ul class="recovery-compact-list">
        <li v-for="(warning, index) in warningRows" :key="index" class="recovery-compact-row">
          <WorkLink
            v-if="number(warning.task_id)"
            :task-id="number(warning.task_id)"
            :subtask-id="number(warning.subtask_id)"
          />
          <p v-for="reason in recoveryReasons(warning)" :key="reason">{{ reason }}</p>
          <RouterLink
            v-if="number(warning.study_session_id)"
            :to="`/planning/sessions/${warning.study_session_id}`"
          >
            Відкрити сесію
          </RouterLink>
        </li>
      </ul>
      <PageNavigation
        v-if="warnings.length > pageSize"
        compact
        :current="warningPage"
        :last="Math.ceil(warnings.length / pageSize)"
        :total="warnings.length"
        aria-label="Варто врахувати"
        @page="warningPage = $event"
      />
    </AppCard>
    <slot />
  </div>
</template>
<style scoped>
.recovery-plan-review {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.recovery-report-period {
  margin-bottom: 16px;
}
.recovery-plan-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.recovery-plan-metrics > div {
  background: var(--subtle);
  padding: 14px;
  border-radius: var(--radius-sm);
}
.recovery-plan-metrics dt {
  font-size: 12px;
  color: var(--text-secondary);
}
.recovery-plan-metrics dd {
  margin: 6px 0 0;
  font-size: 24px;
  font-weight: 700;
}
.recovery-compact-list {
  padding: 0;
  margin: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}
.recovery-compact-row {
  background: var(--subtle);
  border-radius: var(--radius-sm);
  padding: 12px;
}
.recovery-compact-row > p {
  margin-top: 4px;
}
.recovery-work-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 16px;
}
.recovery-work-heading strong {
  font-size: 13px;
}
.recovery-plan-review :deep(.pagination) {
  border: 0;
  padding-top: 0;
  margin-top: 16px;
}
.recovery-plan-review :deep(.card-heading) {
  margin-bottom: 16px;
}
@media (max-width: 600px) {
  .recovery-plan-metrics {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  .recovery-plan-metrics > div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .recovery-plan-metrics dd {
    margin: 0;
    font-size: 20px;
  }
  .recovery-plan-review :deep(.pagination) {
    justify-content: center;
    gap: 8px;
  }
  .recovery-plan-review :deep(.pagination .button) {
    padding-inline: 12px;
  }
}
</style>
