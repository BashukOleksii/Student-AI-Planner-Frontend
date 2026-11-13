<script setup lang="ts">
import { computed, ref } from 'vue'
import { dateTime, time } from '@/utils/dates'
import { duration } from '@/utils/planning'
import WorkLink from './WorkLink.vue'
const props = defineProps<{ review: object; timezone: string; replanning?: boolean }>()
type Row = Record<string, unknown>
const record = (value: unknown): Row =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}
const list = (value: unknown): Row[] => (Array.isArray(value) ? value.map(record) : [])
const review = computed(() => record(props.review))
const noEligible = computed(
  () =>
    record(review.value.summary).requested_seconds === 0 &&
    list(review.value.excluded_items).length > 0,
)
const summary = computed(() =>
  noEligible.value
    ? []
    : Object.entries(record(review.value.summary)).filter(
        ([key, v]) =>
          [
            'requested_seconds',
            'allocated_seconds',
            'unscheduled_seconds',

            'affected_sessions',
            'proposed_replacements',
            'unplaced_sessions',
            'untransferred_seconds',
            'unallocated_minutes',
            'created_count',
            'rescheduled_sessions',
            'created_replacements',
            'cancelled_unplaced_sessions',
            'not_transferred_seconds',
            'unallocated_work_seconds',
          ].includes(key) &&
          (typeof v === 'number' || typeof v === 'boolean') &&
          !(key === 'fully_allocated' && noEligible.value),
      ),
)
const sessions = computed(() => list(review.value.sessions ?? review.value.replacement_sessions))
const changes = computed(() => list(review.value.session_results))
const work = computed(() => [
  ...list(review.value.work_results),
  ...list(review.value.excluded_items),
])
const showExcluded = ref(false)
const workGroups = computed(() => [
  {
    title: 'Не вдалося розмістити повністю',
    rows: list(review.value.work_results).filter(
      (row) => typeof row.unscheduled_seconds === 'number' && row.unscheduled_seconds > 0,
    ),
  },
  {
    title: 'Робота, виключена з планування',
    rows: list(review.value.excluded_items).filter(
      (row) =>
        !(
          Array.isArray(row.reason_codes) &&
          row.reason_codes.length === 1 &&
          row.reason_codes[0] === 'subtasks_authoritative'
        ),
    ),
  },
])
const warnings = computed(() => list(review.value.warnings ?? review.value.alerts))
const labels: Record<string, string> = {
  created_count: 'Створено сесій',
  rescheduled_sessions: 'Перенесено сесій',
  created_replacements: 'Нових сесій',
  cancelled_unplaced_sessions: 'Скасовано сесій без заміни',
  requested_seconds: 'Потрібно часу',
  allocated_seconds: 'Запропоновано часу',
  unscheduled_seconds: 'Залишилося без часу',
  fully_allocated: 'Усю допущену роботу розміщено',
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
function reasons(row: Row): string[] {
  return Array.isArray(row.explanations)
    ? row.explanations.filter((text): text is string => typeof text === 'string')
    : Array.isArray(row.reason_codes) && row.reason_codes.length
      ? ['Перевірте умови планування цієї роботи.']
      : []
}
function replacementRows(row: Row) {
  return list(row.replacements ?? (row.replacement ? [row.replacement] : []))
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
    <p v-if="typeof record(review.user_summary).next_step === 'string'" class="helper">
      {{ record(review.user_summary).next_step }}
    </p>
    <p v-if="noEligible" role="status">Немає роботи, яку можна запланувати за поточних умов.</p>
    <dl v-if="summary.length" class="proposal-summary" aria-label="Підсумок плану">
      <div v-for="[key, value] in summary" :key="key">
        <template
          v-if="
            replanning &&
            ['untransferred_seconds', 'not_transferred_seconds'].includes(key) &&
            typeof value === 'number'
          "
        >
          <dt>
            {{
              value === 0
                ? 'Увесь час, який потрібно було перенести, розміщено'
                : `У цьому періоді не знайдено нового часу для ${duration(value)} роботи`
            }}
          </dt>
          <dd class="sr-only">{{ metric(key, value) }}</dd>
        </template>
        <template v-else>
          <dt>{{ labels[key] ?? 'Підсумок' }}</dt>
          <dd>{{ metric(key, value) }}</dd>
        </template>
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
            <p v-if="typeof record(change.original).duration_seconds === 'number'">
              Початкова сесія: {{ duration(record(change.original).duration_seconds as number) }}
            </p>
            <p>{{ start(change.original) }} — {{ end(change.original) }}</p>
          </div>
          <div>
            <strong>Після підтвердження</strong>
            <p v-if="change.classification === 'cannot_replan'" class="helper">
              Неможливо перепланувати цю сесію.
            </p>
            <p>
              {{
                ['valid', 'cannot_replan'].includes(String(change.classification))
                  ? 'Час залишається без змін'
                  : replacementRows(change).length > 1
                    ? 'Поділ на декілька сесій'
                    : start(change.replacement)
              }}
              <template v-if="end(change.replacement)">— {{ end(change.replacement) }}</template>
            </p>
          </div>
        </div>
        <article
          v-for="(replacement, replacementIndex) in replacementRows(change)"
          :key="replacementIndex"
          class="session-card"
        >
          <strong>
            Нова сесія №{{ replacementIndex + 1 }}:
            {{ duration(number(replacement.duration_seconds) ?? 0) }}
          </strong>
          <p>{{ start(replacement) }} — {{ end(replacement) }}</p>
        </article>
        <p v-if="typeof change.untransferred_seconds === 'number'" class="report-warning">
          Неперенесено: {{ duration(change.untransferred_seconds) }}
        </p>
        <p v-for="reason in reasons(change)" :key="reason" class="helper">{{ reason }}</p>
      </article>
    </section>
    <section
      v-for="group in workGroups.filter((group) => group.rows.length)"
      :key="group.title"
      class="review-block"
    >
      <h3>{{ group.title }}</h3>
      <article
        v-for="(item, index) in showExcluded ? group.rows : group.rows.slice(0, 5)"
        :key="index"
        class="proposal-row"
      >
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
        <p v-if="typeof item.effective_deadline_at === 'string'">
          Дедлайн: {{ dateTime(item.effective_deadline_at, timezone) }}
        </p>
        <RouterLink
          v-if="
            Array.isArray(item.reason_codes) &&
            item.reason_codes.includes('deadline_expired') &&
            number(item.task_id)
          "
          :to="`/tasks/${item.task_id}`"
        >
          Переглянути роботу та змінити дедлайн
        </RouterLink>
        <p v-for="reason in reasons(item)" :key="reason">{{ reason }}</p>
      </article>
      <button
        v-if="group.rows.length > 5"
        type="button"
        class="text-link"
        @click="showExcluded = !showExcluded"
      >
        {{ showExcluded ? 'Згорнути' : `Показати ще (${group.rows.length - 5})` }}
      </button>
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
      </article>
    </section>
    <p
      v-if="
        !summary.length && !sessions.length && !changes.length && !work.length && !warnings.length
      "
      class="helper"
    >
      Додаткових змін немає.
    </p>
  </div>
</template>
