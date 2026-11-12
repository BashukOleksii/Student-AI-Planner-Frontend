<script setup lang="ts">
import { computed } from 'vue'
import { dateTime, time } from '@/utils/dates'
import { duration, planningReasonLabel } from '@/utils/planning'
import { fieldLabel } from '@/utils/ai'
import WorkLink from './WorkLink.vue'
const props = defineProps<{ review: object; timezone: string }>()
type Row = Record<string, unknown>
const record = (value: unknown): Row =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}
const list = (value: unknown): Row[] => (Array.isArray(value) ? value.map(record) : [])
const review = computed(() => record(props.review))
const summary = computed(() =>
  Object.entries(record(review.value.summary)).filter(
    ([key, v]) =>
      [
        'requested_seconds',
        'allocated_seconds',
        'unscheduled_seconds',
        'fully_allocated',
        'affected_sessions',
        'proposed_replacements',
        'unplaced_sessions',
        'untransferred_seconds',
        'unallocated_minutes',
        'created_count',
        'not_transferred_seconds',
        'unallocated_work_seconds',
      ].includes(key) &&
      (typeof v === 'number' || typeof v === 'boolean'),
  ),
)
const sessions = computed(() => list(review.value.sessions ?? review.value.replacement_sessions))
const changes = computed(() => list(review.value.session_results))
const work = computed(() => [
  ...list(review.value.work_results),
  ...list(review.value.excluded_items),
])
const warnings = computed(() => list(review.value.warnings ?? review.value.alerts))
const labels: Record<string, string> = {
  created_count: 'Створено сесій',
  requested_seconds: 'Потрібно часу',
  allocated_seconds: 'Запропоновано часу',
  unscheduled_seconds: 'Залишилося без часу',
  fully_allocated: 'Уся робота має час',
  inspected_sessions: 'Перевірено сесій',
  valid_sessions: 'Залишаться на місці',
  cannot_replan_sessions: 'Не можна перенести',
  affected_sessions: 'Потребують зміни',
  proposed_replacements: 'Запропоновано замін',
  unplaced_sessions: 'Сесії без нового часу',
  partial_replacements: 'Частково перенесено',
  no_changes_needed: 'Зміни не потрібні',
  original_affected_seconds: 'Початкова тривалість',
  replacement_seconds: 'Час після перенесення',
  untransferred_seconds: 'Залишилося перенести',
  not_transferred_seconds: 'Залишилося перенести',
  unallocated_work_seconds: 'Робота без часу',
  unallocated_minutes: 'Робота без часу, хв',
  allocated_minutes: 'Заплановано, хв',
  requested_minutes: 'Потрібно, хв',
}
function metric(key: string, value: unknown) {
  return typeof value === 'boolean'
    ? value
      ? 'Так'
      : 'Ні'
    : typeof value === 'number' && key.endsWith('_seconds')
      ? duration(value)
      : String(value)
}
function number(value: unknown) {
  return typeof value === 'number' ? value : null
}
function reasons(row: Row) {
  const codes = Array.isArray(row.reason_codes)
    ? row.reason_codes
    : typeof row.code === 'string'
      ? [row.code]
      : []
  const all = [
    ...codes,
    ...(Array.isArray(row.replacement_reason_codes) ? row.replacement_reason_codes : []),
  ]
  return [...new Set(all.filter((code): code is string => typeof code === 'string'))].map(
    planningReasonLabel,
  )
}
function start(value: unknown) {
  const row = record(value)
  return typeof row.starts_at === 'string'
    ? dateTime(row.starts_at, props.timezone)
    : 'Новий час не запропоновано'
}
function end(value: unknown) {
  const row = record(value)
  return typeof row.ends_at === 'string' ? time(row.ends_at, props.timezone) : ''
}
</script>
<template>
  <div class="study-proposal">
    <dl v-if="summary.length" class="proposal-summary" aria-label="Підсумок плану">
      <div v-for="[key, value] in summary" :key="key">
        <dt>{{ labels[key] ?? fieldLabel(key) }}</dt>
        <dd>{{ metric(key, value) }}</dd>
      </div>
    </dl>
    <section v-if="sessions.length" class="review-block">
      <h3>Час для роботи</h3>
      <article v-for="(session, index) in sessions" :key="index" class="proposal-row">
        <strong>
          <WorkLink :task-id="number(session.task_id)" :subtask-id="number(session.subtask_id)" />
        </strong>
        <p>{{ start(session) }} — {{ end(session) }}</p>
        <p v-if="typeof session.duration_seconds === 'number'" class="helper">
          {{ duration(session.duration_seconds) }}
        </p>
      </article>
    </section>
    <section v-if="review.original && review.replacement" class="review-block">
      <h3>Перенесення сесії</h3>
      <div class="proposal-compare">
        <div>
          <strong>Зараз</strong>
          <p>{{ start(review.original) }} — {{ end(review.original) }}</p>
        </div>
        <div>
          <strong>Після підтвердження</strong>
          <p>{{ start(review.replacement) }} — {{ end(review.replacement) }}</p>
        </div>
      </div>
    </section>
    <section v-if="changes.length" class="review-block">
      <h3>Як зміняться сесії</h3>
      <article v-for="(change, index) in changes" :key="index" class="proposal-row">
        <strong>
          <WorkLink :task-id="number(change.task_id)" :subtask-id="number(change.subtask_id)" />
        </strong>
        <div class="proposal-compare">
          <div>
            <strong>Зараз</strong>
            <p>{{ start(change.original) }} — {{ end(change.original) }}</p>
          </div>
          <div>
            <strong>Після підтвердження</strong>
            <p>
              {{
                ['valid', 'cannot_replan'].includes(String(change.classification))
                  ? 'Час залишається без змін'
                  : start(change.replacement)
              }}
              <template v-if="end(change.replacement)">— {{ end(change.replacement) }}</template>
            </p>
          </div>
        </div>
        <p
          v-if="
            typeof change.untransferred_seconds === 'number' && change.untransferred_seconds > 0
          "
          class="report-warning"
        >
          Без нового часу: {{ duration(change.untransferred_seconds) }}
        </p>
        <p v-for="reason in reasons(change)" :key="reason" class="helper">{{ reason }}</p>
      </article>
    </section>
    <section v-if="work.length" class="review-block">
      <h3>Залишок роботи та обмеження</h3>
      <article v-for="(item, index) in work" :key="index" class="proposal-row">
        <WorkLink :task-id="number(item.task_id)" :subtask-id="number(item.subtask_id)" />
        <p v-if="typeof item.unscheduled_seconds === 'number'">
          Без часу: {{ duration(item.unscheduled_seconds) }}
        </p>
        <p v-else-if="typeof item.unallocated_after_replacements === 'number'">
          Робота без нового часу: {{ duration(item.unallocated_after_replacements) }}
        </p>
        <p v-else-if="typeof item.unallocated_minutes === 'number'">
          Без часу: {{ item.unallocated_minutes }} хв
        </p>
        <p v-for="reason in reasons(item)" :key="reason">{{ reason }}</p>
      </article>
    </section>
    <section v-if="warnings.length" class="review-block report-warning">
      <h3>Варто врахувати</h3>
      <article v-for="(warning, index) in warnings" :key="index" class="proposal-row">
        <WorkLink
          v-if="number(warning.task_id)"
          :task-id="number(warning.task_id)"
          :subtask-id="number(warning.subtask_id)"
        />
        <p v-for="reason in reasons(warning)" :key="reason">{{ reason }}</p>
        <p v-if="typeof warning.message === 'string'">{{ warning.message }}</p>
      </article>
    </section>
    <p
      v-if="
        !summary.length && !sessions.length && !changes.length && !work.length && !warnings.length
      "
      class="helper"
    >
      Додаткові результати доступні в повному огляді нижче.
    </p>
  </div>
</template>
