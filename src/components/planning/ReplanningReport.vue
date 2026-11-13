<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ReplanningReview, ReplanningResult, Interval } from '@/types/planning'
import { dateTime, localDate, localEndDate, time } from '@/utils/dates'
import { duration } from '@/utils/planning'
import {
  replanningIssues,
  hasReplanningIssues,
  replanningReplacements,
  replanningReasons,
  uniqueReplanningWarnings,
} from '@/utils/replanningPresentation'
import AppCard from '@/components/ui/AppCard.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
import WorkLink from './WorkLink.vue'
const props = defineProps<{
  review?: ReplanningReview
  result?: ReplanningResult
  timezone: string
}>()
const pageSize = 5
const sourcePage = ref(1),
  warningPage = ref(1),
  savedPage = ref(1)
watch(
  () => [props.review, props.result],
  () => {
    sourcePage.value = warningPage.value = savedPage.value = 1
  },
)
const rows = computed(() => (props.review ? replanningIssues(props.review) : []))
const visibleRows = computed(() =>
  rows.value.slice((sourcePage.value - 1) * pageSize, sourcePage.value * pageSize),
)
const hasIssues = computed(() => (props.review ? hasReplanningIssues(props.review) : false))
const warnings = computed(() => (props.review ? uniqueReplanningWarnings(props.review) : []))
const visibleWarnings = computed(() =>
  warnings.value.slice((warningPage.value - 1) * pageSize, warningPage.value * pageSize),
)
const noReplacement = computed(
  () => hasIssues.value && props.review?.summary.proposed_replacements === 0,
)
const savedRows = computed(() =>
  (props.result?.original_sessions ?? []).map((source) => ({
    ...source,
    sessions: (props.result?.replacement_sessions ?? []).filter((session) =>
      props.result?.replacement_groups?.some(
        (group) =>
          group.original_session_id === source.id &&
          group.successor_session_ids.includes(session.id),
      ),
    ),
  })),
)
const visibleSaved = computed(() =>
  savedRows.value.slice((savedPage.value - 1) * pageSize, savedPage.value * pageSize),
)
const ungrouped = computed(() =>
  (props.result?.replacement_sessions ?? []).filter(
    (session) =>
      !savedRows.value.some((row) => row.sessions.some((item) => item.id === session.id)),
  ),
)
const ungroupedPage = ref(1)
watch(
  () => props.result,
  () => {
    ungroupedPage.value = 1
  },
)
const visibleUngrouped = computed(() =>
  ungrouped.value.slice((ungroupedPage.value - 1) * pageSize, ungroupedPage.value * pageSize),
)
// Confirmation does not return the reviewed period. Label only dates of persisted sessions.
const savedDates = computed(() => {
  const sessions = props.result?.replacement_sessions ?? []
  if (!sessions.length) return null
  return {
    start: sessions.map((session) => localDate(session.starts_at, props.timezone)).sort()[0],
    end: sessions
      .map((session) => localEndDate(session.ends_at, props.timezone))
      .sort()
      .at(-1),
  }
})
const remaining = computed(() =>
  typeof props.result?.summary.untransferred_seconds === 'number'
    ? props.result.summary.untransferred_seconds
    : null,
)
const number = (value: unknown) => (typeof value === 'number' ? value : null)
function intervalLabel(interval: Interval, timezone: string) {
  return `${dateTime(interval.starts_at, timezone)} — ${localDate(interval.starts_at, timezone) === localDate(interval.ends_at, timezone) ? time(interval.ends_at, timezone) : dateTime(interval.ends_at, timezone)}`
}
</script>
<template>
  <div class="replanning-report">
    <template v-if="review">
      <AppCard title="Пропозиція перепланування" class="replanning-summary">
        <template #action><span class="badge warning">Ще не збережено</span></template>
        <p class="helper replanning-period">
          Період: {{ review.start_date }} — {{ review.end_date }} · {{ review.timezone }}
        </p>
        <p v-if="!hasIssues" role="status" class="replanning-state">
          У цьому періоді нічого переносити не потрібно
        </p>
        <template v-else>
          <dl class="replanning-metrics">
            <div>
              <dt>Потребують перенесення</dt>
              <dd>{{ review.summary.affected_sessions }}</dd>
            </div>
            <div>
              <dt>Запропоновано нових сесій</dt>
              <dd>{{ review.summary.proposed_replacements }}</dd>
            </div>
            <div>
              <dt>Без нового часу</dt>
              <dd>{{ duration(review.summary.untransferred_seconds) }}</dd>
            </div>
          </dl>
          <p v-if="noReplacement" role="status" class="replanning-state attention">
            Проблеми є, але нового часу не знайдено.
          </p>
          <p v-if="review.summary.cannot_replan_sessions > 0" class="helper">
            Потребують ручного рішення: {{ review.summary.cannot_replan_sessions }}.
          </p>
        </template>
      </AppCard>
      <AppCard v-if="rows.length" title="Що зміниться" class="replanning-changes">
        <div class="replanning-list">
          <article v-for="row in visibleRows" :key="row.study_session_id" class="replanning-source">
            <div class="replanning-row-heading">
              <WorkLink :task-id="row.task_id" :subtask-id="row.subtask_id" />
              <RouterLink :to="`/planning/sessions/${row.study_session_id}`" class="helper">
                Початкова сесія →
              </RouterLink>
            </div>
            <p v-if="replanningReasons(row).length" class="helper replanning-reason">
              {{ replanningReasons(row)[0] }}
            </p>
            <dl class="replanning-times">
              <div>
                <dt>Було</dt>
                <dd>{{ intervalLabel(row.original, review.timezone) }}</dd>
              </div>
              <div>
                <dt>{{ row.classification === 'cannot_replan' ? 'Стан' : 'Пропонуємо' }}</dt>
                <dd>
                  <span v-if="row.classification === 'cannot_replan'">
                    Потрібне ручне рішення. Час залишається без змін.
                  </span>
                  <span v-else-if="!replanningReplacements(row).length">Новий час не знайдено</span>
                  <ul v-else class="replanning-intervals">
                    <li v-for="(replacement, index) in replanningReplacements(row)" :key="index">
                      {{ intervalLabel(replacement, review.timezone) }}
                      <span class="helper">· {{ duration(replacement.duration_seconds) }}</span>
                    </li>
                  </ul>
                </dd>
              </div>
            </dl>
            <span v-if="replanningReplacements(row).length > 1" class="badge">
              Поділ на {{ replanningReplacements(row).length }} сесії
            </span>
            <p v-if="row.untransferred_seconds > 0" class="replanning-remainder">
              Без нового часу: {{ duration(row.untransferred_seconds) }}
            </p>
            <details v-if="replanningReasons(row).length > 1" class="replanning-more">
              <summary>Інші причини</summary>
              <p v-for="reason in replanningReasons(row).slice(1)" :key="reason" class="helper">
                {{ reason }}
              </p>
            </details>
          </article>
        </div>
        <PageNavigation
          v-if="rows.length > pageSize"
          compact
          :current="sourcePage"
          :last="Math.ceil(rows.length / pageSize)"
          :total="rows.length"
          aria-label="Що зміниться"
          @page="sourcePage = $event"
        />
      </AppCard>
      <AppCard v-if="warnings.length" title="Варто врахувати" class="replanning-warnings">
        <ul class="replanning-list">
          <li v-for="(warning, index) in visibleWarnings" :key="index" class="replanning-source">
            <WorkLink
              v-if="number(warning.task_id)"
              :task-id="number(warning.task_id)"
              :subtask-id="number(warning.subtask_id)"
            />
            <p v-for="reason in replanningReasons(warning)" :key="reason">{{ reason }}</p>
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
    </template>
    <template v-else-if="result">
      <AppCard title="Зміни збережено" class="replanning-saved-summary">
        <template #action><span class="badge success">Збережено</span></template>
        <p v-if="savedDates" class="helper replanning-saved-dates">
          Дати доданих сесій: {{ savedDates.start }} — {{ savedDates.end }} · {{ timezone }}
        </p>
        <p v-else class="helper">Нових сесій не створено.</p>
        <dl class="replanning-metrics">
          <div>
            <dt>Перенесено початкових сесій</dt>
            <dd>
              {{
                result.original_sessions.filter((source) => source.status === 'rescheduled').length
              }}
            </dd>
          </div>
          <div>
            <dt>Додано до плану</dt>
            <dd>{{ result.replacement_sessions.length }}</dd>
          </div>
          <div v-if="result.original_sessions.some((source) => source.status === 'cancelled')">
            <dt>Скасовано без заміни</dt>
            <dd>
              {{
                result.original_sessions.filter((source) => source.status === 'cancelled').length
              }}
            </dd>
          </div>
        </dl>
      </AppCard>
      <AppCard
        v-if="savedRows.length"
        title="Збережені перенесення"
        class="replanning-saved-changes"
      >
        <div class="replanning-list">
          <article v-for="source in visibleSaved" :key="source.id" class="replanning-source">
            <div class="replanning-row-heading">
              <WorkLink
                v-if="source.sessions[0]"
                :task-id="source.sessions[0].task_id"
                :subtask-id="source.sessions[0].subtask_id"
              />
              <RouterLink :to="`/planning/sessions/${source.id}`">
                Початкова сесія №{{ source.id }}
              </RouterLink>
              <span class="badge" :class="source.status === 'cancelled' ? 'warning' : 'success'">
                {{ source.status === 'cancelled' ? 'Скасовано без заміни' : 'Перенесено' }}
              </span>
            </div>
            <ul v-if="source.sessions.length" class="replanning-intervals">
              <li v-for="session in source.sessions" :key="session.id">
                <RouterLink :to="`/planning/sessions/${session.id}`">
                  {{ intervalLabel(session, timezone) }}
                </RouterLink>
                · {{ duration(session.duration_seconds) }}
              </li>
            </ul>
          </article>
        </div>
        <PageNavigation
          v-if="savedRows.length > pageSize"
          compact
          :current="savedPage"
          :last="Math.ceil(savedRows.length / pageSize)"
          :total="savedRows.length"
          aria-label="Збережені перенесення"
          @page="savedPage = $event"
        />
      </AppCard>
      <AppCard v-if="ungrouped.length" title="Додані навчальні сесії" class="replanning-created">
        <ul class="replanning-list">
          <li v-for="session in visibleUngrouped" :key="session.id" class="replanning-source">
            <WorkLink :task-id="session.task_id" :subtask-id="session.subtask_id" />
            <p>
              <RouterLink :to="`/planning/sessions/${session.id}`">
                {{ intervalLabel(session, timezone) }}
              </RouterLink>
              · {{ duration(session.duration_seconds) }}
            </p>
          </li>
        </ul>
        <PageNavigation
          v-if="ungrouped.length > pageSize"
          compact
          :current="ungroupedPage"
          :last="Math.ceil(ungrouped.length / pageSize)"
          :total="ungrouped.length"
          aria-label="Додані навчальні сесії"
          @page="ungroupedPage = $event"
        />
      </AppCard>
      <AppCard
        v-if="remaining !== null && remaining > 0"
        title="Залишок без нового часу"
        class="replanning-saved-remainder"
      >
        <strong>Без нового часу: {{ duration(remaining) }}</strong>
        <p class="helper">Для цієї частини роботи нові сесії не створено.</p>
      </AppCard>
      <AppCard class="replanning-saved-actions">
        <RouterLink
          :to="{
            path: '/planning/sessions',
            query: savedDates ? { start_date: savedDates.start, end_date: savedDates.end } : {},
          }"
          class="button primary"
        >
          Навчальні сесії
        </RouterLink>
      </AppCard>
    </template>
    <slot />
  </div>
</template>
<style scoped>
.replanning-report {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.replanning-period,
.replanning-saved-dates {
  margin-bottom: 16px;
}
.replanning-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.replanning-metrics > div {
  padding: 14px;
  background: var(--subtle);
  border-radius: var(--radius-sm);
}
.replanning-metrics dt {
  color: var(--text-secondary);
  font-size: 12px;
}
.replanning-metrics dd {
  margin: 6px 0 0;
  font-size: 24px;
  font-weight: 700;
}
.replanning-state {
  margin-top: 12px;
  font-weight: 600;
}
.attention,
.replanning-remainder {
  color: var(--warning);
}
.replanning-list {
  display: grid;
  gap: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.replanning-source {
  min-width: 0;
  padding: 16px;
  border-radius: var(--radius-sm);
  background: var(--subtle);
  overflow-wrap: anywhere;
}
.replanning-row-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.replanning-reason {
  margin-top: 4px;
}
.replanning-times {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin: 12px 0;
}
.replanning-times dt {
  font-size: 12px;
  color: var(--text-secondary);
}
.replanning-times dd {
  margin: 4px 0 0;
}
.replanning-intervals {
  display: grid;
  gap: 6px;
  padding: 0;
  margin: 8px 0 0;
  list-style: none;
}
.replanning-times .replanning-intervals {
  margin-top: 0;
}
.replanning-remainder {
  margin-top: 8px;
  font-weight: 600;
  font-size: 13px;
}
.replanning-more {
  margin-top: 8px;
}
.replanning-more summary {
  cursor: pointer;
  font-size: 12px;
  padding-block: 4px;
}
.replanning-report :deep(.pagination) {
  border: 0;
  margin-top: 16px;
  padding-top: 0;
}
@media (max-width: 600px) {
  .replanning-metrics,
  .replanning-times {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  .replanning-metrics > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .replanning-metrics dd {
    margin: 0;
    font-size: 20px;
  }
  .replanning-report :deep(.pagination) {
    justify-content: center;
    gap: 8px;
  }
  .replanning-report :deep(.pagination .button) {
    padding-inline: 12px;
  }
}
</style>
