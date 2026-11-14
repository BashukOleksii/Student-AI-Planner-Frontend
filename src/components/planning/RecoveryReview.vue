<script setup lang="ts">
import { computed } from 'vue'
import ReplanningReport from './ReplanningReport.vue'
import { isReplanningReview } from '@/utils/replanningPresentation'
import type { PublicObject } from '@/types/ai'
import StudyProposal from './StudyProposal.vue'
import WorkLink from './WorkLink.vue'
import { duration } from '@/utils/planning'
import { dateTime } from '@/utils/dates'
import { isPublicObject } from '@/utils/ai'
const props = defineProps<{ review: PublicObject; kind: string; timezone: string }>()
const explanations: Record<string, string> = {
  create_plan: 'Є невиконана робота, для якої можна виділити час. Перевірте запропоновані сесії.',
  replan:
    'Частина навчальних сесій потребує перенесення. Перевірте початкові сесії, заміни й роботу без нового місця.',
  decision_required:
    'Система не знає результату розпочатих сесій. Спочатку вкажіть, що вдалося виконати.',
  warning: 'Перегляньте роботу без нового часу та пояснення нижче.',
}
const plan = computed(() => {
  const value =
    props.kind === 'replan'
      ? props.review.adaptive_replanning
      : props.kind === 'create_plan'
        ? props.review.new_work_plan
        : null
  return isPublicObject(value) ? value : null
})
const advice = computed(() =>
  isPublicObject(props.review.workload_advice) ? props.review.workload_advice : null,
)
const blockedChanges = computed(() =>
  isPublicObject(props.review.adaptive_replanning) &&
  Array.isArray(props.review.adaptive_replanning.session_results)
    ? props.review.adaptive_replanning.session_results
        .filter(isPublicObject)
        .filter((row) => row.classification === 'cannot_replan')
    : [],
)
const reasons: Record<string, string> = {
  session_outcome_unknown: 'Для розпочатих сесій ще не вказано результат.',
  existing_sessions_require_replanning:
    'Частина запланованих сесій більше не підходить до поточних умов.',
  sessions_require_manual_review:
    'Деякі сесії потребують вашого рішення про результат або новий час.',
  excluded_work_requires_input: 'Для частини роботи потрібно уточнити дані.',
  insufficient_allocation_in_period: 'У вибраному періоді не вистачає часу на всю роботу.',
  persisted_workload_exceeded: 'Збережений план перевищує ваші обмеження навантаження.',
  eligible_remaining_work: 'Є невиконана робота, для якої ще не заплановано час.',
}
const causes = computed(() =>
  Array.isArray(props.review.reason_codes)
    ? props.review.reason_codes.filter(
        (code): code is string => typeof code === 'string' && code in reasons,
      )
    : [],
)
const history = computed(() =>
  isPublicObject(props.review.recovery) && isPublicObject(props.review.recovery.summary)
    ? props.review.recovery.summary
    : null,
)
</script>
<template>
  <p class="review-introduction">{{ explanations[kind] ?? 'Перевірте зміни перед рішенням.' }}</p>
  <section
    v-if="
      !plan &&
      (causes.length ||
        (history &&
          (typeof history.missed_session_count === 'number' ||
            typeof history.past_planned_session_count === 'number')))
    "
    class="review-block"
  >
    <h3>Що потребує уваги</h3>
    <ul v-if="causes.length">
      <li v-for="code in causes" :key="code">{{ reasons[code] }}</li>
    </ul>
    <dl v-if="history" class="proposal-summary">
      <div v-if="typeof history.missed_session_count === 'number'">
        <dt>Пропущено сесій</dt>
        <dd>{{ history.missed_session_count }}</dd>
      </div>
      <div v-if="typeof history.past_planned_session_count === 'number'">
        <dt>Минулих сесій без результату</dt>
        <dd>{{ history.past_planned_session_count }}</dd>
      </div>
    </dl>
  </section>
  <section
    v-if="
      Array.isArray(review.unknown_session_decisions) && review.unknown_session_decisions.length
    "
    class="review-block"
  >
    <h3>Потрібно вказати результат</h3>
    <article
      v-for="(session, index) in review.unknown_session_decisions.filter(isPublicObject)"
      :key="index"
      class="proposal-row"
    >
      <WorkLink
        :task-id="typeof session.task_id === 'number' ? session.task_id : null"
        :subtask-id="typeof session.subtask_id === 'number' ? session.subtask_id : null"
      />
      <p v-if="typeof session.starts_at === 'string'">
        {{ dateTime(session.starts_at, timezone) }}
      </p>
      <p v-if="typeof session.duration_seconds === 'number'">
        {{ duration(session.duration_seconds) }}
      </p>
      <RouterLink
        v-if="typeof (session.study_session_id ?? session.id) === 'number'"
        :to="`/planning/sessions/${session.study_session_id ?? session.id}`"
        class="button primary"
      >
        Записати результат сесії →
      </RouterLink>
    </article>
  </section>
  <StudyProposal
    v-if="kind === 'warning' && blockedChanges.length"
    :review="{ session_results: blockedChanges }"
    :timezone="timezone"
    replanning
  />
  <ReplanningReport
    v-if="kind === 'replan' && isReplanningReview(plan)"
    :review="plan"
    :timezone="timezone"
  />
  <StudyProposal
    v-else-if="plan"
    :review="plan"
    :timezone="timezone"
    :replanning="kind === 'replan'"
  />
  <StudyProposal
    v-if="advice && !plan && kind === 'warning'"
    :review="advice"
    :timezone="timezone"
  />
  <section
    v-if="
      advice &&
      Array.isArray(advice.persisted_workload_violations) &&
      advice.persisted_workload_violations.length
    "
    class="review-block report-warning"
  >
    <h3>План перевищує ваші ліміти</h3>
    <p
      v-for="(item, index) in advice.persisted_workload_violations.filter(isPublicObject)"
      :key="index"
    >
      {{ item.period }} ·
      <template v-if="typeof item.scheduled_seconds === 'number'">
        Заплановано {{ duration(item.scheduled_seconds) }}
      </template>
      <template v-if="typeof item.limit_seconds === 'number'">
        · ліміт {{ duration(item.limit_seconds) }}
      </template>
    </p>
  </section>
  <p
    v-if="Array.isArray(review.unknown_duration_work) && review.unknown_duration_work.length"
    class="report-warning"
  >
    Для частини роботи не вказано тривалість. Додайте оцінку в завданні, щоб її можна було
    запланувати.
  </p>
  <section v-if="kind === 'replan'" class="review-block">
    <h3>Що залишиться без змін</h3>
    <p>
      Виконана робота й історія зберігаються. Заняття університету не переносяться. Сесії, позначені
      в огляді як збережені, залишаться на своєму місці.
    </p>
  </section>
  <p
    v-if="
      kind === 'replan' &&
      Array.isArray(review.required_confirmation_fields) &&
      review.required_confirmation_fields.includes('accept_unplaced_cancellation')
    "
    class="report-warning"
  >
    Скасування сесій без нового місця також скасовує їхні заплановані нагадування. Перевірте кожну
    сесію в огляді та надайте окремий дозвіл нижче.
  </p>
</template>
