<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue'
import { useRoute } from 'vue-router'
import { studySessionsApi } from '@/api/studySessions'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { ApiError } from '@/api/client'
import { toLocalInput, toUtc, localDate } from '@/utils/dates'
import { nullableMinutes, exactDateTime, duration } from '@/utils/planning'
import type { ReschedulingResult } from '@/types/planning'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import SessionCard from '@/components/planning/SessionCard.vue'
import PlanningReview from '@/components/planning/PlanningReview.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
const id = Number(useRoute().params.id),
  auth = useAuthStore(),
  timezone = computed(() => auth.user?.timezone ?? 'UTC')
const resource = useResource((signal) => studySessionsApi.get(id, signal))
const busy = ref(false),
  error = ref<unknown>(null),
  actual = ref(''),
  localError = ref(''),
  notice = ref(''),
  cancelling = ref(false),
  rescheduling = ref(false)
const start = ref(''),
  end = ref(''),
  reviewedInterval = ref<{ starts_at: string; ends_at: string } | null>(null),
  result = ref<ReschedulingResult | null>(null)
let active = true
onScopeDispose(() => {
  active = false
})
function askCancel() {
  cancelling.value = true
  error.value = null
}
function openReschedule() {
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
    localError.value = e instanceof Error ? e.message : ''
  }
}
async function mutate(action: 'complete' | 'miss' | 'cancel' | 'reschedule') {
  if (busy.value || resource.data.value?.data.status !== 'planned') return
  error.value = null
  localError.value = ''
  notice.value = ''
  let minutes: number | undefined
  if (action === 'complete') {
    try {
      minutes = nullableMinutes(actual.value) ?? undefined
    } catch (e) {
      localError.value = e instanceof Error ? e.message : ''
      return
    }
  }
  if (action === 'reschedule' && !reviewedInterval.value) return
  busy.value = true
  try {
    if (action === 'reschedule' && reviewedInterval.value) {
      const response = await studySessionsApi.reschedule(id, reviewedInterval.value)
      if (active) result.value = response.data
    } else if (action === 'complete') await studySessionsApi.complete(id, minutes)
    else if (action === 'miss') await studySessionsApi.miss(id)
    else if (action === 'cancel') await studySessionsApi.cancel(id)
    if (!active) return
    cancelling.value = false
    rescheduling.value = false
    notice.value = 'Зміну сесії збережено. Завдання й підзавдання мають незалежний стан.'
    await resource.reload()
  } catch (e) {
    if (!active) return
    error.value = e
    if (e instanceof ApiError && [0, 409, 500, 502, 503].includes(e.status)) {
      cancelling.value = false
      rescheduling.value = false
      reviewedInterval.value = null
      notice.value =
        'Результат запиту може бути невизначеним або стан змінився. Перевірте поточну сесію та історію перед новою дією. Запит не повторювався.'
      await resource.reload()
    }
  } finally {
    if (active) busy.value = false
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <h1>Навчальна сесія №{{ id }}</h1>
      <p class="muted">{{ timezone }}</p>
    </div>
  </header>
  <PlanningNav />
  <LoadingState v-if="resource.loading.value" />
  <ErrorState
    v-else-if="resource.error.value"
    :error="resource.error.value"
    retry
    @retry="resource.reload"
  />
  <template v-else-if="resource.data.value">
    <AppCard>
      <SessionCard :session="resource.data.value.data" :timezone="timezone" />
      <RouterLink
        :to="{ path: '/reminders/new', query: { study_session_id: resource.data.value.data.id } }"
        class="button secondary"
      >
        Нагадування для сесії
      </RouterLink>
      <RouterLink
        :to="{
          path: '/planning/sessions',
          query: {
            start_date: localDate(resource.data.value.data.starts_at, timezone),
            end_date: localDate(resource.data.value.data.ends_at, timezone),
          },
        }"
        class="text-link"
      >
        Історія сесій у цей період →
      </RouterLink>
    </AppCard>
    <AppCard v-if="resource.data.value.data.status === 'planned'" title="Керування сесією">
      <p class="helper">
        Завершення дозволене після початку, пропуск — після кінця, скасування й перенесення — до
        початку. Остаточні умови перевіряє сервер.
      </p>
      <form class="stack" @submit.prevent="mutate('complete')">
        <div class="field">
          <label for="actual-minutes">Фактична тривалість, хв (необов’язково)</label>
          <input
            id="actual-minutes"
            v-model="actual"
            type="number"
            min="1"
            max="65535"
            step="1"
            :disabled="busy"
          />
        </div>
        <AppButton type="submit" variant="primary" :busy="busy">Завершити сесію</AppButton>
      </form>
      <div class="actions">
        <AppButton :disabled="busy" @click="mutate('miss')">Позначити пропущеною</AppButton>
        <AppButton :disabled="busy" @click="openReschedule">Перенести сесію</AppButton>
        <AppButton variant="danger" :disabled="busy" @click="askCancel">Скасувати сесію</AppButton>
      </div>
    </AppCard>
    <p v-else class="helper">
      Історичний стан збережено. Повторне відкриття й довільне редагування сесії не підтримуються.
    </p>
  </template>
  <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
  <FormNotice :error="error" />
  <p v-if="notice" role="status" class="planning-warning">{{ notice }}</p>
  <AppCard v-if="result" title="Фактичний результат перенесення">
    <PlanningReview :review="result" :timezone="timezone" />
    <SessionCard :session="result.replacement" :timezone="timezone" />
  </AppCard>
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
    <FormNotice :error="error" />
    <div class="actions">
      <AppButton :disabled="busy" @click="cancelling = false">Залишити сесію</AppButton>
      <AppButton variant="danger" :busy="busy" @click="mutate('cancel')">
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
    <form class="stack" @submit.prevent="reviewInterval">
      <p>Місцевий час {{ timezone }}. Неоднозначний і неіснуючий DST-час буде відхилено.</p>
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
            (Date.parse(reviewedInterval.ends_at) - Date.parse(reviewedInterval.starts_at)) / 1000,
          )
        }}. Початкова: {{ duration(resource.data.value?.data.duration_seconds ?? 0) }}.
      </p>
      <p>
        Початкову сесію буде позначено перенесеною й створено заміну. Коротша заміна залишає
        неперенесену роботу. Заплановані нагадування початкової сесії буде скасовано без копіювання.
        Це негайна операція, а не серверний preview. Здійсненність перевіряється під час запиту;
        фактичні залишки покаже відповідь сервера.
      </p>
      <AppButton variant="primary" :busy="busy" @click="mutate('reschedule')">
        Підтвердити перенесення
      </AppButton>
    </div>
    <FormNotice :error="error" />
  </AppModal>
</template>
