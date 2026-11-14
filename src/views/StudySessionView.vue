<script setup lang="ts">
import { localErrorText, publicText } from '@/utils/publicText'

import { sessionStatuses } from '@/utils/planning'
import { useWorkLabels } from '@/composables/useWorkLabels'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { studySessionsApi } from '@/api/studySessions'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { ApiError } from '@/api/client'
import { planningSessionsLocation } from '@/utils/planningNavigation'
import { localDate, localEndDate, toLocalInput, toUtc } from '@/utils/dates'
import { nullableMinutes, exactDateTime, duration } from '@/utils/planning'
import { useWorkName } from '@/composables/useWorkLabels'
import SessionCard from '@/components/planning/SessionCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
const route = useRoute(),
  router = useRouter()
const returnTo = computed(() =>
  typeof route.query.return_to === 'string' &&
  /^\/planning\/sessions(?:\?|$)/.test(route.query.return_to)
    ? route.query.return_to
    : '/planning/sessions',
)
const id = Number(route.params.id),
  auth = useAuthStore(),
  timezone = computed(() => auth.user?.timezone ?? 'UTC')
const resource = useResource((signal) => studySessionsApi.get(id, signal))
const completion = useResource((signal) => studySessionsApi.completionReview(id, signal))
const completeWork = ref(false)
const busy = ref(false),
  error = ref<unknown>(null),
  actual = ref(''),
  localError = ref(''),
  notice = ref(''),
  cancelling = ref(false),
  rescheduling = ref(false)
const start = ref(''),
  end = ref(''),
  reviewedInterval = ref<{ starts_at: string; ends_at: string } | null>(null)
const now = ref(Date.now())
const session = computed(() => resource.data.value?.data)
const canChange = computed(
  () => session.value?.status === 'planned' && now.value < Date.parse(session.value.starts_at),
)
const canComplete = computed(
  () => session.value?.status === 'planned' && now.value >= Date.parse(session.value.starts_at),
)
const canMiss = computed(
  () => session.value?.status === 'planned' && now.value >= Date.parse(session.value.ends_at),
)
let boundaryTimer: ReturnType<typeof setTimeout> | undefined
function refreshAvailability() {
  clearTimeout(boundaryTimer)
  now.value = Date.now()
  if (session.value?.status !== 'planned') return
  const next = [Date.parse(session.value.starts_at), Date.parse(session.value.ends_at)]
    .filter((boundary) => boundary > now.value)
    .sort((a, b) => a - b)[0]
  // Browser timers cannot safely represent delays above the signed 32-bit limit.
  if (next !== undefined)
    boundaryTimer = setTimeout(refreshAvailability, Math.min(next - now.value, 2_147_483_647))
}
watch(session, refreshAvailability, { immediate: true })
document.addEventListener('visibilitychange', refreshAvailability)
window.addEventListener('focus', refreshAvailability)
let active = true
onScopeDispose(() => {
  active = false
  clearTimeout(boundaryTimer)
  document.removeEventListener('visibilitychange', refreshAvailability)
  window.removeEventListener('focus', refreshAvailability)
})
function askCancel() {
  refreshAvailability()
  if (!canChange.value) return
  cancelling.value = true
  error.value = null
}
function openReschedule() {
  refreshAvailability()
  if (!canChange.value) return
  start.value = toLocalInput(resource.data.value?.data.starts_at ?? null, timezone.value)
  end.value = toLocalInput(resource.data.value?.data.ends_at ?? null, timezone.value)
  reviewedInterval.value = null
  localError.value = ''
  error.value = null
  rescheduling.value = true
}
function reviewInterval() {
  localError.value = ''
  try {
    const starts_at = toUtc(start.value, timezone.value),
      ends_at = toUtc(end.value, timezone.value)
    if (!starts_at || !ends_at || ends_at <= starts_at)
      throw new Error('Вкажіть початок і пізніше завершення.')
    reviewedInterval.value = { starts_at, ends_at }
  } catch (e) {
    localError.value = localErrorText(e, '')
  }
}
async function mutate(action: 'complete' | 'miss' | 'cancel' | 'reschedule') {
  refreshAvailability()
  if (busy.value || resource.data.value?.data.status !== 'planned') return
  const allowed =
    action === 'complete' ? canComplete.value : action === 'miss' ? canMiss.value : canChange.value
  if (!allowed) {
    localError.value = 'Ця дія вже недоступна для поточного часу сесії.'
    return
  }
  error.value = null
  localError.value = ''
  notice.value = ''
  let minutes: number | undefined
  if (action === 'complete') {
    try {
      minutes = nullableMinutes(actual.value) ?? undefined
      if (minutes === undefined)
        throw new Error('Вкажіть фактичну тривалість навчання: ціле число від 1 до 65535 хвилин.')
    } catch (e) {
      localError.value = localErrorText(e, '')
      return
    }
  }
  if (action === 'reschedule' && !reviewedInterval.value) return
  busy.value = true
  try {
    if (action === 'reschedule' && reviewedInterval.value) {
      const saved = await studySessionsApi.reschedule(id, reviewedInterval.value)
      if (!active) return
      await router.push(
        planningSessionsLocation(
          {
            start_date: localDate(saved.data.replacement.starts_at, timezone.value),
            end_date: localEndDate(saved.data.replacement.ends_at, timezone.value),
          },
          'session_rescheduled',
        ),
      )
      return
    } else if (action === 'complete') {
      if (completeWork.value) {
        const review = await studySessionsApi.completionReview(id)
        if (!review.can_complete_work || !review.completion_review)
          throw new Error('Стан роботи змінився. Перечитайте сесію.')
        if (
          review.completion_review.future_sessions_count > 0 &&
          !window.confirm(
            publicText(
              review.completion_review.message,
              'Завершення роботи скасує пов’язані майбутні сесії та нагадування. Підтвердити?',
            ),
          )
        )
          return
        await studySessionsApi.complete(id, minutes!, {
          complete_work: true,
          completion_token: review.completion_review.completion_token,
        })
      } else await studySessionsApi.complete(id, minutes!)
    } else if (action === 'miss') await studySessionsApi.miss(id)
    else if (action === 'cancel') await studySessionsApi.cancel(id)
    if (!active) return
    cancelling.value = false
    rescheduling.value = false
    if (action !== 'complete') {
      await router.push(returnTo.value)
      return
    }
    notice.value = 'Зміни збережено.'
    completeWork.value = false
    await Promise.all([resource.reload(), completion.reload()])
  } catch (e) {
    if (!active) return
    error.value = e
    if (e instanceof ApiError && [0, 409, 500, 502, 503].includes(e.status)) {
      cancelling.value = false
      rescheduling.value = false
      reviewedInterval.value = null
      notice.value =
        'Результат запиту може бути невизначеним або стан змінився. Перевірте поточну сесію та історію перед новою дією. Запит не повторювався.'
      completeWork.value = false
      await Promise.all([resource.reload(), completion.reload()])
    }
  } finally {
    if (active) busy.value = false
  }
}
const workLabels = useWorkLabels(() => resource.data.value)
const workName = useWorkName(
  () => resource.data.value?.data.task_id,
  () => resource.data.value?.data.subtask_id,
  workLabels,
)
</script>
<template>
  <div class="page-workspace page-detail">
    <header class="page-heading">
      <div>
        <h1>{{ resource.data.value ? workName : 'Навчальна сесія' }}</h1>
        <p class="muted">Самостійне навчання</p>
      </div>
      <div class="session-return">
        <RouterLink :to="returnTo" class="button secondary">Повернутися до сесій</RouterLink>
      </div>
    </header>
    <LoadingState v-if="resource.loading.value" />
    <ErrorState
      v-else-if="resource.error.value"
      :error="resource.error.value"
      retry
      @retry="resource.reload"
    />
    <template v-else-if="resource.data.value">
      <AppCard class="session-overview">
        <p v-if="resource.data.value.data.status !== 'planned'" role="status" class="success">
          {{ sessionStatuses[resource.data.value.data.status] ?? 'Стан сесії не визначено' }}
        </p>
        <SessionCard :session="resource.data.value.data" :timezone="timezone" compact />
        <RouterLink
          v-if="resource.data.value.data.status === 'planned'"
          to="/profile#session-reminders"
          class="button secondary"
        >
          Налаштувати нагадування про сесії
        </RouterLink>
      </AppCard>
      <AppCard
        v-if="resource.data.value.data.status === 'planned'"
        title="Результат навчання"
        class="session-outcome"
      >
        <form v-if="canComplete" class="stack" novalidate @submit.prevent="mutate('complete')">
          <div class="field">
            <label for="actual-minutes">Фактична тривалість, хв (обов’язково)</label>
            <input
              id="actual-minutes"
              required
              v-model="actual"
              type="number"
              min="1"
              max="65535"
              step="1"
              :disabled="busy"
            />
          </div>
          <label v-if="completion.data.value?.can_complete_work" class="checkbox-field">
            <input type="checkbox" v-model="completeWork" :disabled="busy" />
            {{
              completion.data.value.work_type === 'subtask'
                ? 'Також позначити підзавдання виконаним'
                : 'Також позначити завдання виконаним'
            }}
          </label>
          <AppButton type="submit" variant="primary" :busy="busy">Завершити сесію</AppButton>
        </form>
        <section v-if="canChange || canMiss" class="content-form-section">
          <h3>Змінити заплановане</h3>
          <p class="helper">
            Пропуск означає, що заплановане навчання не відбулося. Скасування прибирає майбутню
            сесію з плану. Історія зберігається в обох випадках.
          </p>
          <div class="actions">
            <AppButton v-if="canMiss" :disabled="busy" @click="mutate('miss')">
              Позначити пропущеною
            </AppButton>
            <AppButton v-if="canChange" :disabled="busy" @click="openReschedule">
              Перенести сесію
            </AppButton>
            <AppButton v-if="canChange" variant="danger" :disabled="busy" @click="askCancel">
              Скасувати сесію
            </AppButton>
          </div>
        </section>
      </AppCard>
    </template>
    <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
    <FormNotice :error="error" />
    <p v-if="notice" role="status" class="planning-warning">{{ notice }}</p>
    <AppModal
      v-if="cancelling"
      title="Скасувати навчальну сесію?"
      :busy="busy"
      @close="cancelling = false"
    >
      <p>
        Сесію та її заплановані залежні нагадування буде скасовано. Історія збережеться; нагадування
        не переносяться.
      </p>
      <p v-if="!canChange" role="status" class="helper">
        Скасування вже недоступне: час або стан сесії змінився.
      </p>
      <FormNotice :error="error" />
      <div class="actions">
        <AppButton :disabled="busy" @click="cancelling = false">Залишити сесію</AppButton>
        <AppButton variant="danger" :busy="busy" :disabled="!canChange" @click="mutate('cancel')">
          Підтвердити скасування
        </AppButton>
      </div>
    </AppModal>
    <AppModal
      v-if="rescheduling"
      title="Перенесення сесії"
      :busy="busy"
      @close="rescheduling = false"
    >
      <p v-if="!canChange" role="status" class="helper">
        Перенесення вже недоступне: час або стан сесії змінився.
      </p>
      <form class="stack" @submit.prevent="reviewInterval">
        <p>Новий час у поясі {{ timezone }}. Перед збереженням перевірте наслідки нижче.</p>
        <div class="field">
          <label for="session-start">Новий початок</label>
          <input
            id="session-start"
            v-model="start"
            type="datetime-local"
            step="1"
            required
            :disabled="busy"
            @input="reviewedInterval = null"
          />
        </div>
        <div class="field">
          <label for="session-end">Нове завершення</label>
          <input
            id="session-end"
            v-model="end"
            type="datetime-local"
            step="1"
            required
            :disabled="busy"
            @input="reviewedInterval = null"
          />
        </div>
        <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
        <AppButton type="submit" :disabled="busy">Переглянути наслідки</AppButton>
      </form>
      <div v-if="reviewedInterval" class="planning-warning">
        <p>
          {{ exactDateTime(reviewedInterval.starts_at, timezone) }} —
          {{ exactDateTime(reviewedInterval.ends_at, timezone) }}
        </p>
        <p>
          Запитана тривалість:
          {{
            duration(
              (Date.parse(reviewedInterval.ends_at) - Date.parse(reviewedInterval.starts_at)) /
                1000,
            )
          }}. Початкова: {{ duration(resource.data.value?.data.duration_seconds ?? 0) }}.
        </p>
        <p>
          Початкову сесію буде позначено перенесеною й створено заміну. Коротша заміна залишає
          неперенесену роботу. Заплановані нагадування початкової сесії буде скасовано без
          копіювання. Після підтвердження буде перевірено, чи можна навчатися в цей час. Якщо часу
          недостатньо, ви побачите залишок роботи.
        </p>
        <AppButton
          variant="primary"
          :busy="busy"
          :disabled="!canChange"
          @click="mutate('reschedule')"
        >
          Підтвердити перенесення
        </AppButton>
      </div>
      <FormNotice :error="error" />
    </AppModal>
  </div>
</template>

<style scoped>
.session-return {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.session-return .button {
  max-width: 100%;
  white-space: normal;
}
</style>
