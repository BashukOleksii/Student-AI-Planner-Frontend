<script setup lang="ts">
import WorkPicker from '@/components/planning/WorkPicker.vue'
import WorkflowSteps from '@/components/ui/WorkflowSteps.vue'
import { useWorkLabels } from '@/composables/useWorkLabels'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { planningApi } from '@/api/planning'
import { tasksApi } from '@/api/endpoints'
import { subtasksApi } from '@/api/subtasks'
import { studySessionsApi } from '@/api/studySessions'
import { ApiError, fieldErrors } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { usePlanningScope } from '@/composables/usePlanningScope'
import { useResource } from '@/composables/useResource'
import { validateRange } from '@/utils/planning'
import { dateTime } from '@/utils/dates'
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
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
const route = useRoute(),
  adaptive = route.path.endsWith('/replanning'),
  recoveryMode = route.path.endsWith('/recovery'),
  auth = useAuthStore()
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const {
  range,
  taskId,
  subtaskId,
  page,
  search,
  childSearch,
  childPage,
  childLabel,
  tasks,
  children,
  selectedTask,
  scopeError,
} = usePlanningScope(
  timezone.value,
  () => (recoveryMode ? route.query.task_id : undefined),
  adaptive
    ? () => ({ start_date: route.query.start_date, end_date: route.query.end_date })
    : undefined,
  adaptive ? 'replanning' : 'planning',
)
const scopeBlocked = computed(
  () =>
    !!scopeError.value ||
    selectedTask.loading.value ||
    !!selectedTask.error.value ||
    children.loading.value ||
    !!children.error.value ||
    (taskId.value !== null && children.data.value?.meta.task_available === false),
)
type Review =
  | { kind: 'plan'; data: StudyPlan }
  | { kind: 'recovery'; data: StudyPlan; diagnostics: RecoveryDiagnostics }
  | { kind: 'replan'; data: ReplanningReview }
const resultPeriod = ref<{ start_date: string; end_date: string; timezone: string } | null>(null)
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
const validationMessages = computed(() =>
  Object.values(fieldErrors(error.value))
    .flat()
    .filter((message) => /[А-Яа-яІіЇїЄєҐґ]/u.test(message) && !/[a-z]+_[a-z]+/.test(message)),
)
const refreshError = ref<unknown>(null)
const acceptPartial = ref(false),
  acceptCancellation = ref(false),
  acceptSplit = ref(false)
const needsPartial = computed(() =>
  review.value?.kind === 'replan'
    ? review.value.data.summary.partial_replacements > 0 ||
      review.value.data.summary.unplaced_sessions > 0
    : !!review.value && !review.value.data.summary.fully_allocated,
)
const needsCancellation = computed(
  () => review.value?.kind === 'replan' && review.value.data.summary.unplaced_sessions > 0,
)
const needsSplit = computed(
  () =>
    review.value?.kind === 'replan' &&
    review.value.data.session_results.some((row) => (row.replacements?.length ?? 0) > 1),
)
const actionable = computed(() =>
  review.value?.kind === 'replan'
    ? review.value.data.summary.affected_sessions > 0
    : !!review.value && review.value.data.sessions.length > 0,
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
  acceptSplit.value = false
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
    if (taskId.value !== null) {
      const options = await planningApi.workOptions(
        {
          task_id: taskId.value,
          subtask_id: subtaskId.value ?? undefined,
          mode: adaptive ? 'replanning' : 'planning',
        },
        controller.signal,
      )
      if (
        !options.meta.task_available ||
        (subtaskId.value !== null && !options.data.some((item) => item.id === subtaskId.value))
      ) {
        scopeError.value =
          'Вибрана робота вже завершена або недоступна для планування. Виберіть іншу.'
        await children.reload()
        return
      }
    }
    if (!active || controller.signal.aborted) return
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
      ? ''
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
    (needsCancellation.value && !acceptCancellation.value) ||
    (needsSplit.value && !acceptSplit.value)
  )
    return
  busy.value = true
  confirming.value = true
  error.value = null
  try {
    const response = adaptive
      ? await planningApi.replanConfirm(
          token.value,
          acceptPartial.value,
          acceptCancellation.value,
          acceptSplit.value,
        )
      : await planningApi.confirm(token.value, acceptPartial.value)
    if (!active) return
    result.value = response.data
    if (review.value)
      resultPeriod.value = {
        start_date: review.value.data.start_date,
        end_date: review.value.data.end_date,
        timezone: review.value.data.timezone,
      }
    discard()
    recovery.value = 'План збережено.'
    await inspect(true)
  } catch (e) {
    if (!active) return
    error.value = e
    const consentOnly =
      e instanceof ApiError &&
      e.status === 422 &&
      Object.keys(e.fields).length > 0 &&
      Object.keys(e.fields).every((k) =>
        ['accept_partial', 'accept_unplaced_cancellation', 'accept_split_replacements'].includes(k),
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
    (!needsCancellation.value || acceptCancellation.value) &&
    (!needsSplit.value || acceptSplit.value),
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
        <p class="muted">Оберіть роботу й період — ми запропонуємо час для навчання.</p>
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
    <AppCard title="Що і коли планувати">
      <form class="stack" @submit.prevent="preview">
        <fieldset :disabled="busy" class="planning-fieldset">
          <RangeFields v-model="range" :disabled="busy" compact />
          <LoadingState v-if="tasks.loading.value" />
          <ErrorState
            v-if="tasks.error.value"
            :error="tasks.error.value"
            retry
            @retry="tasks.reload"
          />
          <WorkPicker
            id="scope-task"
            v-model="taskId"
            v-model:search="search"
            label="Завдання для планування"
            :options="tasks.data.value?.data ?? []"
            :selected-label="
              taskId ? (selectedTask.data.value?.title ?? 'Обране завдання недоступне') : undefined
            "
            all-label="Уся доступна робота"
            :loading="tasks.loading.value"
            @update:model-value="scopeError = ''"
          />
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
          <template v-if="taskId">
            <p v-if="children.data.value?.meta.all_subtasks_completed" class="helper">
              Усі підзавдання виконано. Можна завершити основне завдання.
            </p>
            <p
              v-else-if="children.data.value && !children.data.value.meta.has_subtasks"
              class="helper"
            >
              У цього завдання немає підзавдань.
            </p>
            <template v-else>
              <WorkPicker
                id="scope-subtask"
                v-model="subtaskId"
                v-model:search="childSearch"
                label="Підзавдання для планування"
                :options="children.data.value?.data ?? []"
                :selected-label="childLabel"
                all-label="Усі доступні підзавдання"
                :loading="children.loading.value"
              />
              <p v-if="children.data.value?.meta.total === 0 && !childSearch" class="helper">
                Немає підзавдань, доступних для планування за поточних умов.
              </p>
              <div v-if="(children.data.value?.meta.last_page ?? 1) > 1" class="actions">
                <AppButton
                  :disabled="childPage <= 1 || children.loading.value"
                  @click="childPage--"
                >
                  Попередні підзавдання
                </AppButton>
                <AppButton
                  :disabled="
                    childPage >= (children.data.value?.meta.last_page ?? 1) ||
                    children.loading.value
                  "
                  @click="childPage++"
                >
                  Наступні підзавдання
                </AppButton>
              </div>
            </template>
          </template>
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
    <ErrorState v-if="error" :error="error" />
    <ul v-if="validationMessages.length" class="field-error">
      <li v-for="message in validationMessages" :key="message">{{ message }}</li>
    </ul>
    <div v-if="refreshError">
      <p class="helper">
        Частину поточних даних не вдалося перевірити. Результат операції не змінено.
      </p>
      <ErrorState :error="refreshError" retry @retry="inspect(!!result)" />
    </div>
    <p v-if="recovery" role="status" class="planning-warning">{{ recovery }}</p>
    <AppCard v-if="review" title="Пропозиція — ще не збережено">
      <p class="helper">
        Період огляду: {{ review.data.start_date }} — {{ review.data.end_date }} ({{
          review.data.timezone
        }})
      </p>
      <p v-if="expires && actionable" class="helper">
        Строк огляду: {{ dateTime(expires, timezone) }}. Після цього створіть новий огляд.
      </p>
      <p v-if="adaptive" class="planning-warning">
        Підтвердження замінить або скасує перелічені початкові сесії. Їхні заплановані нагадування
        буде скасовано без перенесення. Сесії, які не потребують або не допускають перенесення,
        залишаться без змін.
      </p>
      <PlanningReview
        :replanning="adaptive"
        :review="review.data"
        :timezone="review.data.timezone"
        :explain-reasons="recoveryMode"
      />
      <RecoveryHistory
        v-if="review.kind === 'recovery'"
        :diagnostics="review.diagnostics"
        :timezone="review.data.timezone"
      />
      <p v-if="!actionable" role="status">
        {{
          recoveryMode
            ? 'Немає нових сесій для відновлення. Перевірте залишок роботи, доступність, попередження та рішення щодо минулих сесій.'
            : 'Немає змін для підтвердження. Перевірте завдання, доступність і вподобання.'
        }}
      </p>
      <p v-if="actionable" class="helper">
        Підтвердження застосує весь огляд, включно з усіма сторінками карток.
      </p>
      <div class="stack">
        <label v-if="actionable && needsSplit" class="planning-consent">
          <input v-model="acceptSplit" type="checkbox" :disabled="busy" />
          Перевірив усі нові сесії та погоджуюся на поділ початкової сесії.
        </label>
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
          <AppButton :disabled="busy" @click="discard">
            {{ actionable ? 'Відхилити огляд' : 'Змінити умови' }}
          </AppButton>
        </div>
      </div>
    </AppCard>
    <AppCard v-if="result" title="Збережений результат">
      <p v-if="resultPeriod" class="helper">
        Період огляду: {{ resultPeriod.start_date }} — {{ resultPeriod.end_date }} ({{
          resultPeriod.timezone
        }})
      </p>
      <PlanningReview
        :replanning="adaptive"
        :review="result"
        :timezone="timezone"
        :explain-reasons="recoveryMode"
      />
    </AppCard>
    <RouterLink
      v-if="result || recovery"
      :to="{ path: '/planning/sessions', query: range }"
      class="button secondary"
    >
      Повернутися до сесій
    </RouterLink>
  </div>
</template>
