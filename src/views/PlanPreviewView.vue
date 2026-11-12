<script setup lang="ts">
import WorkflowSteps from '@/components/ui/WorkflowSteps.vue'
import { useWorkLabels } from '@/composables/useWorkLabels'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { planningApi } from '@/api/planning'
import { tasksApi } from '@/api/endpoints'
import { subtasksApi } from '@/api/subtasks'
import { studySessionsApi } from '@/api/studySessions'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { usePlanningScope } from '@/composables/usePlanningScope'
import { useResource } from '@/composables/useResource'
import { validateRange, exactDateTime } from '@/utils/planning'
import type {
  StudyPlan,
  ReplanningReview,
  ReplanningResult,
  PersistedPlan,
  RecoveryDiagnostics,
} from '@/types/planning'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import AvailabilityNotice from '@/components/planning/AvailabilityNotice.vue'
import RangeFields from '@/components/planning/RangeFields.vue'
import PlanningReview from '@/components/planning/PlanningReview.vue'
import RecoveryHistory from '@/components/planning/RecoveryHistory.vue'
import SessionCard from '@/components/planning/SessionCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
const route = useRoute(),
  adaptive = route.path.endsWith('/replanning'),
  recoveryMode = route.path.endsWith('/recovery'),
  auth = useAuthStore()
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const { range, taskId, subtaskId, page, tasks, children, selectedTask, scopeError } =
  usePlanningScope(timezone.value, () => (recoveryMode ? route.query.task_id : undefined))
const scopeBlocked = computed(
  () =>
    !!scopeError.value ||
    selectedTask.loading.value ||
    !!selectedTask.error.value ||
    children.loading.value ||
    !!children.error.value,
)
type Review =
  | { kind: 'plan'; data: StudyPlan }
  | { kind: 'recovery'; data: StudyPlan; diagnostics: RecoveryDiagnostics }
  | { kind: 'replan'; data: ReplanningReview }
const review = ref<Review | null>(null),
  result = ref<PersistedPlan | ReplanningResult | null>(null)
// Never persist, expose in the template, URL, storage or diagnostic output.
const token = ref<string | null>(null)
let previewController: AbortController | undefined,
  active = true
const expires = ref(''),
  busy = ref(false),
  confirming = ref(false),
  error = ref<unknown>(null),
  localError = ref(''),
  recovery = ref('')
const refreshError = ref<unknown>(null)
const acceptPartial = ref(false),
  acceptCancellation = ref(false)
const needsPartial = computed(() =>
  review.value?.kind === 'replan'
    ? review.value.data.summary.partial_replacements > 0 ||
      review.value.data.summary.unplaced_sessions > 0
    : !!review.value && !review.value.data.summary.fully_allocated,
)
const needsCancellation = computed(
  () => review.value?.kind === 'replan' && review.value.data.summary.unplaced_sessions > 0,
)
const actionable = computed(() =>
  review.value?.kind === 'replan'
    ? review.value.data.summary.affected_sessions > 0
    : !!review.value && review.value.data.sessions.length > 0,
)
const persistedSessions = computed(
  () =>
    result.value &&
    ('sessions' in result.value ? result.value.sessions : result.value.replacement_sessions),
)
function selectAllWork() {
  taskId.value = null
  scopeError.value = ''
}
function discard() {
  token.value = null
  review.value = null
  expires.value = ''
  acceptPartial.value = false
  acceptCancellation.value = false
}
watch(
  [range, taskId, subtaskId, scopeError],
  () => {
    if (!confirming.value) {
      previewController?.abort()
      busy.value = false
      discard()
      result.value = null
      recovery.value = ''
    }
  },
  { deep: true },
)
onScopeDispose(() => {
  active = false
  previewController?.abort()
  token.value = null
})
async function preview() {
  if (busy.value || scopeBlocked.value) return
  void availability.reload()
  error.value = null
  refreshError.value = null
  localError.value = ''
  recovery.value = ''
  result.value = null
  discard()
  try {
    validateRange(range.value)
  } catch (e) {
    localError.value = e instanceof Error ? e.message : ''
    return
  }
  busy.value = true
  previewController?.abort()
  const controller = new AbortController()
  previewController = controller
  try {
    const body = { ...range.value, task_id: taskId.value, subtask_id: subtaskId.value }
    if (adaptive) {
      const response = (await planningApi.replanPreview(body, controller.signal)).data
      if (!active || controller.signal.aborted) return
      const { preview_token, expires_at, ...data } = response
      token.value = preview_token
      expires.value = expires_at
      review.value = { kind: 'replan', data }
    } else if (recoveryMode) {
      const response = (await planningApi.recoveryPreview(body, controller.signal)).data
      if (!active || controller.signal.aborted) return
      const { preview_token, expires_at, ...data } = response.study_plan
      token.value = preview_token ?? null
      expires.value = expires_at ?? ''
      review.value = { kind: 'recovery', data, diagnostics: response.recovery }
    } else {
      const response = (await planningApi.preview(body, controller.signal)).data
      if (!active || controller.signal.aborted) return
      const { preview_token, expires_at, ...data } = response
      token.value = preview_token
      expires.value = expires_at
      review.value = { kind: 'plan', data }
    }
  } catch (e) {
    if (active && !controller.signal.aborted) error.value = e
  } finally {
    if (active && !controller.signal.aborted) busy.value = false
  }
}
async function inspect(confirmed = false) {
  refreshError.value = null
  const reads = await Promise.allSettled([
    studySessionsApi.list({ ...range.value }),
    planningApi.freeSlots({ ...range.value }),
    tasksApi.list({ per_page: 20 }),
    ...(taskId.value
      ? [
          tasksApi.get(taskId.value),
          subtasksApi.list(taskId.value),
          subtasksApi.progress(taskId.value),
        ]
      : []),
  ])
  if (!active) return
  const sessions = reads[0]!
  if (sessions.status === 'fulfilled' && 'meta' in sessions.value)
    recovery.value += confirmed
      ? ' Поточні пов’язані дані оновлено.'
      : ` Поточні сесії перевірено: ${sessions.value.data.length}. Зіставте їх із переглянутим планом на сторінці сесій. Це не підтверджує результат попереднього запиту. Для нової дії створіть новий огляд.`
  const failure = reads.find((read) => read.status === 'rejected')
  if (failure?.status === 'rejected') refreshError.value = failure.reason
}
async function confirm() {
  if (
    busy.value ||
    scopeBlocked.value ||
    !token.value ||
    !actionable.value ||
    (needsPartial.value && !acceptPartial.value) ||
    (needsCancellation.value && !acceptCancellation.value)
  )
    return
  busy.value = true
  confirming.value = true
  error.value = null
  try {
    const response = adaptive
      ? await planningApi.replanConfirm(token.value, acceptPartial.value, acceptCancellation.value)
      : await planningApi.confirm(token.value, acceptPartial.value)
    if (!active) return
    result.value = response.data
    discard()
    recovery.value = 'Зміни підтверджено сервером. Нижче показано фактично збережений результат.'
    await inspect(true)
  } catch (e) {
    if (!active) return
    error.value = e
    const consentOnly =
      e instanceof ApiError &&
      e.status === 422 &&
      Object.keys(e.fields).length > 0 &&
      Object.keys(e.fields).every((k) =>
        ['accept_partial', 'accept_unplaced_cancellation'].includes(k),
      )
    if (!consentOnly) {
      token.value = null
      recovery.value = recoveryMode
        ? 'Результат підтвердження не встановлено або огляд недійсний. Старий огляд більше не можна підтвердити. Перевірте поточні сесії перед створенням нового огляду: запит міг зберегти нові сесії. Підтвердження не повторювалося.'
        : e instanceof ApiError && [0, 500, 502, 503, 409].includes(e.status)
          ? 'Результат підтвердження не встановлено або дані змінилися. Не повторюйте цей запит: перевірте поточні сесії та створіть новий огляд. Конфлікт після повторного підтвердження не означає, що попередні зміни не збереглися.'
          : 'Огляд більше не можна підтвердити. Відновіть сеанс за потреби й отримайте новий огляд.'
      await inspect()
    }
  } finally {
    if (active) {
      busy.value = false
      confirming.value = false
    }
  }
}
const canConfirm = computed(
  () =>
    !!review.value &&
    !scopeBlocked.value &&
    !!token.value &&
    actionable.value &&
    (!needsPartial.value || acceptPartial.value) &&
    (!needsCancellation.value || acceptCancellation.value),
)
useWorkLabels(() => [review.value, result.value])
const availability = useResource((signal) => planningApi.availability(signal))
</script>
<template>
  <div class="page-workspace page-workflow">
    <header class="page-heading">
      <div>
        <h1>
          {{
            recoveryMode
              ? 'Відновлення невиконаної роботи'
              : adaptive
                ? 'Перенести заплановане навчання'
                : 'Попередній перегляд плану'
          }}
        </h1>
        <p class="muted">
          Часовий пояс профілю: {{ timezone }}. План враховує актуальні навчальні дані.
        </p>
      </div>
    </header>
    <PlanningNav />
    <AvailabilityNotice :missing="availability.data.value?.data.length === 0" />
    <ErrorState
      v-if="availability.error.value"
      :error="availability.error.value"
      retry
      @retry="availability.reload"
    />
    <WorkflowSteps
      :steps="['Робота й період', 'Огляд та підтвердження', 'Збережений план']"
      :current="result ? 2 : review ? 1 : 0"
      label="Кроки планування"
    />
    <p v-if="recoveryMode" class="helper">
      Знайдіть час для залишку невиконаної роботи. Огляд не зберігає сесій; новий план потребує
      вашого підтвердження. Відновлення не змінює старі сесії та їхні нагадування й не є заміною
      кожного пропуску один до одного.
    </p>
    <div class="scope-notice">
      <strong>
        {{ adaptive ? 'Перевірте зміни наявного плану' : 'Спочатку пропозиція, потім збереження' }}
      </strong>
      <p>
        {{
          adaptive
            ? 'Огляд порівняє наявні сесії з новим часом. Збереження потребує вашого рішення.'
            : 'Оберіть роботу та дати. Ви побачите запропоновані сесії й залишок роботи перед підтвердженням.'
        }}
      </p>
    </div>
    <AppCard title="Що і коли планувати">
      <form class="stack" @submit.prevent="preview">
        <fieldset :disabled="busy" class="planning-fieldset">
          <RangeFields v-model="range" :disabled="busy" />
          <LoadingState v-if="tasks.loading.value" />
          <ErrorState
            v-if="tasks.error.value"
            :error="tasks.error.value"
            retry
            @retry="tasks.reload"
          />
          <div class="field">
            <label for="scope-task">Завдання для планування</label>
            <select
              id="scope-task"
              v-model="taskId"
              :disabled="tasks.loading.value"
              @change="scopeError = ''"
            >
              <option :value="null">Уся доступна робота</option>
              <option
                v-if="taskId && !tasks.data.value?.data.some((t) => t.id === taskId)"
                :value="taskId"
              >
                {{ selectedTask.data.value?.title ?? 'Обране завдання недоступне' }}
              </option>
              <option v-for="task in tasks.data.value?.data" :key="task.id" :value="task.id">
                {{ task.title }}
              </option>
            </select>
          </div>
          <p v-if="scopeError" role="alert" class="field-error">{{ scopeError }}</p>
          <AppButton v-if="scopeError" @click="selectAllWork">
            Вибрати всю доступну роботу
          </AppButton>
          <LoadingState v-if="selectedTask.loading.value" />
          <ErrorState
            v-if="selectedTask.error.value"
            :error="selectedTask.error.value"
            retry
            @retry="selectedTask.reload"
          />
          <div v-if="tasks.data.value && tasks.data.value.meta.last_page > 1" class="actions">
            <AppButton :disabled="page <= 1 || tasks.loading.value" @click="page--">
              Попередні завдання
            </AppButton>
            <span>{{ page }} / {{ tasks.data.value.meta.last_page }}</span>
            <AppButton
              :disabled="page >= tasks.data.value.meta.last_page || tasks.loading.value"
              @click="page++"
            >
              Наступні завдання
            </AppButton>
          </div>
          <ErrorState
            v-if="children.error.value"
            :error="children.error.value"
            retry
            @retry="children.reload"
          />
          <div v-if="taskId" class="field">
            <label for="scope-subtask">Підзавдання для планування</label>
            <select id="scope-subtask" v-model="subtaskId" :disabled="children.loading.value">
              <option :value="null">Уся робота цього завдання</option>
              <option v-for="child in children.data.value?.data" :key="child.id" :value="child.id">
                {{ child.title }}
              </option>
            </select>
          </div>
        </fieldset>
        <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
        <p v-if="recoveryMode" class="helper">
          «Уся доступна робота» охоплює придатні невиконані завдання, навіть якщо пропущених сесій
          для них немає. Дати визначають період для нових сесій, а не межі історії.
        </p>
        <AppButton
          type="submit"
          variant="primary"
          :busy="busy && !confirming"
          :disabled="busy || scopeBlocked"
        >
          {{ recoveryMode ? 'Знайти час для невиконаної роботи' : 'Створити огляд' }}
        </AppButton>
      </form>
    </AppCard>
    <FormNotice :error="error" />
    <div v-if="refreshError">
      <p class="helper">
        Частину поточних даних не вдалося перевірити. Результат операції не змінено.
      </p>
      <ErrorState :error="refreshError" retry @retry="inspect(!!result)" />
    </div>
    <p v-if="recovery" role="status" class="planning-warning">{{ recovery }}</p>
    <AppCard v-if="review" title="Пропозиція — ще не збережено">
      <p v-if="expires" class="helper">
        Строк огляду: {{ exactDateTime(expires, timezone) }}. Дійсність визначає сервер.
      </p>
      <p v-if="adaptive" class="planning-warning">
        Підтвердження замінить або скасує перелічені початкові сесії. Їхні заплановані нагадування
        буде скасовано без перенесення. Сесії, які не потребують або не допускають перенесення,
        залишаться без змін.
      </p>
      <RecoveryHistory
        v-if="review.kind === 'recovery'"
        :diagnostics="review.diagnostics"
        :timezone="review.data.timezone"
      />
      <PlanningReview
        :review="review.data"
        :timezone="review.data.timezone"
        :explain-reasons="recoveryMode"
      />
      <p v-if="!actionable" role="status">
        {{
          recoveryMode
            ? 'Немає нових сесій для відновлення. Перевірте залишок роботи, доступність, попередження та рішення щодо минулих сесій.'
            : 'Немає змін для підтвердження. Перевірте завдання, доступність і вподобання.'
        }}
      </p>
      <div class="stack">
        <label v-if="actionable && needsPartial" class="planning-consent">
          <input v-model="acceptPartial" type="checkbox" :disabled="busy" />
          {{
            recoveryMode
              ? 'Приймаю частковий план і нерозподілений залишок роботи'
              : 'Приймаю частковий результат і неперенесену тривалість'
          }}
        </label>
        <label v-if="actionable && needsCancellation" class="planning-consent">
          <input v-model="acceptCancellation" type="checkbox" :disabled="busy" />
          Дозволяю скасувати початкові сесії без заміни та їхні заплановані нагадування
        </label>
        <div class="actions">
          <AppButton
            v-if="actionable"
            variant="primary"
            :busy="confirming"
            :disabled="busy || !canConfirm"
            @click="confirm"
          >
            Підтвердити зміни
          </AppButton>
          <AppButton :disabled="busy" @click="discard">Відхилити огляд</AppButton>
        </div>
      </div>
    </AppCard>
    <AppCard v-if="result" title="Збережений результат">
      <PlanningReview :review="result" :timezone="timezone" :explain-reasons="recoveryMode" />
      <SessionCard
        v-for="session in persistedSessions"
        :key="session.id"
        :session="session"
        :timezone="timezone"
      />
    </AppCard>
    <div class="actions">
      <RouterLink :to="{ path: '/planning/sessions', query: range }" class="button secondary">
        Перевірити поточні сесії
      </RouterLink>
      <RouterLink to="/planning/availability" class="text-link">Доступність</RouterLink>
      <RouterLink to="/tasks" class="text-link">Завдання</RouterLink>
    </div>
  </div>
</template>
