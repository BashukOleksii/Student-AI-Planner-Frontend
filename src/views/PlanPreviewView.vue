<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { planningApi } from '@/api/planning'
import { tasksApi } from '@/api/endpoints'
import { subtasksApi } from '@/api/subtasks'
import { studySessionsApi } from '@/api/studySessions'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { usePlanningScope } from '@/composables/usePlanningScope'
import { validateRange, exactDateTime } from '@/utils/planning'
import type { StudyPlan, ReplanningReview, ReplanningResult, PersistedPlan } from '@/types/planning'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import RangeFields from '@/components/planning/RangeFields.vue'
import PlanningReview from '@/components/planning/PlanningReview.vue'
import SessionCard from '@/components/planning/SessionCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
const adaptive = useRoute().path.endsWith('/replanning'),
  auth = useAuthStore()
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const { range, taskId, subtaskId, page, tasks, children } = usePlanningScope(timezone.value)
type Review = { kind: 'plan'; data: StudyPlan } | { kind: 'replan'; data: ReplanningReview }
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
  review.value?.kind === 'plan'
    ? !review.value.data.summary.fully_allocated
    : !!review.value &&
      (review.value.data.summary.partial_replacements > 0 ||
        review.value.data.summary.unplaced_sessions > 0),
)
const needsCancellation = computed(
  () => review.value?.kind === 'replan' && review.value.data.summary.unplaced_sessions > 0,
)
const actionable = computed(() =>
  review.value?.kind === 'plan'
    ? review.value.data.sessions.length > 0
    : !!review.value && review.value.data.summary.affected_sessions > 0,
)
const persistedSessions = computed(
  () =>
    result.value &&
    ('sessions' in result.value ? result.value.sessions : result.value.replacement_sessions),
)
function discard() {
  token.value = null
  review.value = null
  expires.value = ''
  acceptPartial.value = false
  acceptCancellation.value = false
}
watch(
  [range, taskId, subtaskId],
  () => {
    if (!busy.value) {
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
  if (busy.value) return
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
  previewController = new AbortController()
  try {
    const body = { ...range.value, task_id: taskId.value, subtask_id: subtaskId.value }
    if (adaptive) {
      const response = (await planningApi.replanPreview(body, previewController.signal)).data
      if (!active) return
      const { preview_token, expires_at, ...data } = response
      token.value = preview_token
      expires.value = expires_at
      review.value = { kind: 'replan', data }
    } else {
      const response = (await planningApi.preview(body, previewController.signal)).data
      if (!active) return
      const { preview_token, expires_at, ...data } = response
      token.value = preview_token
      expires.value = expires_at
      review.value = { kind: 'plan', data }
    }
  } catch (e) {
    if (active) error.value = e
  } finally {
    if (active) busy.value = false
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
      recovery.value =
        e instanceof ApiError && [0, 500, 502, 503, 409].includes(e.status)
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
    !!token.value &&
    actionable.value &&
    (!needsPartial.value || acceptPartial.value) &&
    (!needsCancellation.value || acceptCancellation.value),
)
</script>
<template>
  <header class="page-heading">
    <div>
      <h1>{{ adaptive ? 'Адаптивне перепланування' : 'Попередній перегляд плану' }}</h1>
      <p class="muted">
        Часовий пояс профілю: {{ timezone }}. План враховує актуальні навчальні дані.
      </p>
    </div>
  </header>
  <PlanningNav />
  <AppCard title="Період і робота">
    <form class="stack" @submit.prevent="preview">
      <fieldset :disabled="busy" class="planning-fieldset">
        <RangeFields v-model="range" :disabled="busy" />
        <ErrorState
          v-if="tasks.error.value"
          :error="tasks.error.value"
          retry
          @retry="tasks.reload"
        />
        <div class="field">
          <label for="scope-task">Завдання для планування</label>
          <select id="scope-task" v-model="taskId" :disabled="tasks.loading.value">
            <option :value="null">Уся доступна робота</option>
            <option
              v-if="taskId && !tasks.data.value?.data.some((t) => t.id === taskId)"
              :value="taskId"
            >
              Обрано завдання №{{ taskId }}
            </option>
            <option v-for="task in tasks.data.value?.data" :key="task.id" :value="task.id">
              {{ task.title }}
            </option>
          </select>
        </div>
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
      <AppButton
        type="submit"
        variant="primary"
        :busy="busy && !confirming"
        :disabled="busy || !!children.error.value"
      >
        Створити огляд
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
      буде скасовано без перенесення. Дійсні й недоступні для перепланування джерела зберігаються.
    </p>
    <PlanningReview :review="review.data" :timezone="review.data.timezone" />
    <p v-if="!actionable" role="status">
      Немає змін для підтвердження. Перевірте завдання, доступність і вподобання.
    </p>
    <div v-if="actionable" class="stack">
      <label v-if="needsPartial" class="planning-consent">
        <input v-model="acceptPartial" type="checkbox" :disabled="busy" />
        Приймаю частковий результат і неперенесену тривалість
      </label>
      <label v-if="needsCancellation" class="planning-consent">
        <input v-model="acceptCancellation" type="checkbox" :disabled="busy" />
        Дозволяю скасувати початкові сесії без заміни та їхні заплановані нагадування
      </label>
      <div class="actions">
        <AppButton
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
    <PlanningReview :review="result" :timezone="timezone" />
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
</template>
