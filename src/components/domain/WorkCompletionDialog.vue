<script setup lang="ts">
import { computed } from 'vue'
import { useWorkCompletion } from '@/composables/useWorkCompletion'
import { dateTime, localDate, time } from '@/utils/dates'
import type { StudySession } from '@/types/api'
import AppCard from '@/components/ui/AppCard.vue'
import { duration } from '@/utils/planning'
import AppModal from '@/components/ui/AppModal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import RangeFields from '@/components/planning/RangeFields.vue'
const props = defineProps<{
  taskId: number
  subtaskId?: number | null
  title: string
  timezone: string
}>()
const emit = defineEmits<{ close: []; completed: [type: 'task' | 'subtask'] }>()
const flow = useWorkCompletion(props.taskId, props.subtaskId ?? null, props.timezone, (type) =>
  emit('completed', type),
)
const displayTitle = computed(() =>
  props.subtaskId
    ? (flow.work.data.value?.children.find((child) => child.id === props.subtaskId)?.title ??
      props.title)
    : (flow.work.data.value?.task.title ?? props.title),
)
const selectedWorkTitle = computed(() => {
  const childId = flow.selected.value?.subtask_id
  return childId
    ? (flow.work.data.value?.children.find((child) => child.id === childId)?.title ??
        'Обране підзавдання')
    : displayTitle.value
})
function sessionTime(session: StudySession) {
  const end =
    localDate(session.starts_at, props.timezone) === localDate(session.ends_at, props.timezone)
      ? time(session.ends_at, props.timezone)
      : dateTime(session.ends_at, props.timezone)
  return `${dateTime(session.starts_at, props.timezone)} — ${end}`
}
</script>
<template>
  <AppModal title="Завершення роботи" :busy="flow.busy.value" @close="emit('close')">
    <p>
      <strong>{{ displayTitle }}</strong>
    </p>
    <LoadingState v-if="flow.work.loading.value" />
    <ErrorState
      v-if="flow.work.error.value"
      :error="flow.work.error.value"
      retry
      @retry="flow.refresh"
    />
    <div v-if="flow.work.data.value" class="completion-cards">
      <AppCard
        :title="`Завершити тільки ${subtaskId ? 'підзавдання' : 'завдання'}`"
        class="completion-work-only"
      >
        <form class="stack" @submit.prevent="flow.submit('work')">
          <p
            v-if="flow.work.data.value.review.future_sessions_count > 0"
            class="completion-consequence"
            role="status"
          >
            Майбутніх сесій: {{ flow.work.data.value.review.future_sessions_count }}. Їх буде
            скасовано, а час звільниться.
          </p>
          <AppButton
            type="submit"
            variant="primary"
            :busy="flow.busy.value"
            :disabled="!flow.workReady.value"
          >
            Завершити тільки {{ subtaskId ? 'підзавдання' : 'завдання' }}
          </AppButton>
        </form>
      </AppCard>
      <AppCard title="Завершити разом із сесією" class="completion-with-session">
        <LoadingState v-if="flow.sessions.loading.value" />
        <ErrorState
          v-if="flow.sessions.error.value"
          :error="flow.sessions.error.value"
          retry
          @retry="flow.sessions.reload"
        />
        <p
          v-if="
            !flow.sessions.loading.value &&
            !flow.sessions.error.value &&
            !flow.candidates.value.length
          "
          class="helper completion-empty"
        >
          За цей період немає сесій, доступних для завершення
        </p>
        <form
          v-if="flow.candidates.value.length"
          class="stack completion-session-form"
          novalidate
          @submit.prevent="flow.submit('session')"
        >
          <fieldset
            :disabled="flow.busy.value || flow.blocked.value"
            class="planning-fieldset stack"
          >
            <div
              v-if="flow.candidates.value.length"
              class="completion-candidates"
              role="group"
              aria-label="Оберіть сесію"
            >
              <label
                v-for="session in flow.candidates.value"
                :key="session.id"
                class="completion-choice"
              >
                <input
                  type="radio"
                  name="work-completion-session"
                  :value="session.id"
                  v-model="flow.sessionId.value"
                />
                <span>
                  {{ sessionTime(session) }}
                  <span class="helper">· {{ duration(session.duration_seconds) }} за планом</span>
                </span>
              </label>
            </div>
            <div v-if="flow.selected.value" class="stack completion-selected">
              <p v-if="flow.selected.value.subtask_id" class="scope-notice">
                Буде завершено підзавдання «{{ selectedWorkTitle }}». Основне завдання залишиться у
                своєму стані.
              </p>
              <div class="field">
                <label for="work-actual-minutes">Фактична тривалість, хв</label>
                <input
                  id="work-actual-minutes"
                  v-model="flow.actual.value"
                  type="number"
                  min="1"
                  max="65535"
                  step="1"
                  required
                />
              </div>
              <LoadingState v-if="flow.sessionReview.loading.value" />
              <ErrorState
                v-if="flow.sessionReview.error.value"
                :error="flow.sessionReview.error.value"
                retry
                @retry="flow.sessionReview.reload"
              />
              <p
                v-if="
                  flow.sessionReview.data.value && !flow.sessionReview.data.value.can_complete_work
                "
                role="status"
              >
                Пов’язану роботу вже не можна завершити цією дією. Отримайте новий огляд.
              </p>
              <p
                v-if="
                  flow.sessionReview.data.value?.completion_review &&
                  flow.sessionReview.data.value.completion_review.future_sessions_count > 0
                "
                class="completion-consequence"
                role="status"
              >
                Інших майбутніх сесій:
                {{ flow.sessionReview.data.value.completion_review.future_sessions_count }}. Їх буде
                скасовано, а час звільниться.
              </p>
            </div>
          </fieldset>
          <AppButton
            v-if="flow.candidates.value.length"
            type="submit"
            variant="primary"
            :busy="flow.busy.value"
            :disabled="!flow.sessionReady.value"
          >
            Завершити сесію та
            {{ flow.selected.value?.subtask_id || subtaskId ? 'підзавдання' : 'завдання' }}
          </AppButton>
        </form>
        <details class="completion-search">
          <summary>Не бачиш потрібної сесії?</summary>
          <form class="stack" @submit.prevent="flow.search">
            <RangeFields
              v-model="flow.range.value"
              compact
              :disabled="flow.busy.value || flow.blocked.value"
            />
            <p v-if="flow.searchError.value" class="field-error" role="alert">
              {{ flow.searchError.value }}
            </p>
            <AppButton type="submit" :disabled="flow.busy.value || flow.blocked.value">
              Знайти сесії
            </AppButton>
          </form>
        </details>
      </AppCard>
    </div>
    <p v-if="flow.localError.value" role="alert" class="field-error">{{ flow.localError.value }}</p>
    <FormNotice :error="flow.error.value" />
    <p v-if="flow.blocked.value" class="planning-warning" role="status">
      Запит не повторювався. Перевірте поточний стан перед наступною дією.
    </p>
    <div class="actions completion-actions">
      <AppButton
        v-if="flow.blocked.value || flow.error.value"
        :busy="flow.busy.value"
        @click="flow.refresh"
      >
        Отримати новий огляд
      </AppButton>
      <AppButton :disabled="flow.busy.value" @click="emit('close')">Скасувати</AppButton>
    </div>
  </AppModal>
</template>
<style scoped>
.completion-cards {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}
.completion-cards > .card {
  padding: 16px;
}
.completion-cards .stack {
  gap: 12px;
}
.completion-cards :deep(.card-heading) {
  margin-bottom: 12px;
}
.completion-selected .scope-notice {
  padding: 12px;
  font-size: 13px;
}
.completion-cards :deep(.card-heading h2) {
  font-size: 16px;
}
.completion-choice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: var(--subtle);
  border-radius: var(--radius-sm);
}
.completion-choice input {
  width: auto;
  flex-shrink: 0;
  margin-top: 5px;
}
.completion-candidates {
  display: grid;
  gap: 8px;
  max-height: 14rem;
  overflow-y: auto;
}
.completion-search {
  margin-top: 12px;
}
.completion-search summary {
  cursor: pointer;
  padding-block: 8px;
}
.completion-search form {
  margin-top: 8px;
}
.completion-consequence {
  color: var(--warning);
  font-size: 13px;
}
.completion-actions {
  margin-top: 16px;
}
@media (max-width: 600px) {
  .completion-cards .button {
    width: 100%;
  }
}
</style>
