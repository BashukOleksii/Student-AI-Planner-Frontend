<script setup lang="ts">
import { computed } from 'vue'
import { useWorkCompletion } from '@/composables/useWorkCompletion'
import { dateTime } from '@/utils/dates'
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
    <form
      v-if="flow.work.data.value"
      class="stack completion-form"
      novalidate
      @submit.prevent="flow.submit"
    >
      <fieldset :disabled="flow.busy.value || flow.blocked.value" class="planning-fieldset stack">
        <label class="completion-choice">
          <input
            type="radio"
            name="work-completion-choice"
            :checked="flow.sessionId.value === null"
            @change="flow.sessionId.value = null"
          />
          Завершити тільки {{ subtaskId ? 'підзавдання' : 'завдання' }}
        </label>
        <p class="helper">
          Оберіть сесію, якщо хочете записати результат навчання разом із роботою.
        </p>
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
          class="helper"
        >
          За вибрані дати немає розпочатих сесій для спільного завершення.
        </p>
        <div class="completion-candidates">
          <label
            v-for="session in flow.candidates.value"
            :key="session.id"
            class="completion-choice"
          >
            <input
              type="radio"
              name="work-completion-choice"
              :value="session.id"
              v-model="flow.sessionId.value"
            />
            <span>
              <strong>
                {{
                  session.subtask_id
                    ? flow.work.data.value.children.find((child) => child.id === session.subtask_id)
                        ?.title
                    : displayTitle
                }}
              </strong>
              <br />
              {{ dateTime(session.starts_at, timezone) }} · {{ duration(session.duration_seconds) }}
              <br />
              <span class="helper">
                Сесія {{ session.subtask_id ? 'підзавдання' : 'завдання' }}
              </span>
            </span>
          </label>
        </div>
        <div v-if="flow.selected.value" class="field">
          <p v-if="flow.selected.value.subtask_id && !subtaskId" class="scope-notice">
            Буде завершено лише вибране підзавдання. Основне завдання залишиться у своєму стані.
          </p>
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
          <LoadingState v-if="flow.sessionReview.loading.value" />
          <ErrorState
            v-if="flow.sessionReview.error.value"
            :error="flow.sessionReview.error.value"
            retry
            @retry="flow.sessionReview.reload"
          />
          <p
            v-if="flow.sessionReview.data.value && !flow.sessionReview.data.value.can_complete_work"
            role="status"
          >
            Пов’язану роботу вже не можна завершити цією дією. Отримайте новий огляд.
          </p>
        </div>
      </fieldset>
      <p v-if="flow.localError.value" role="alert" class="field-error">
        {{ flow.localError.value }}
      </p>
      <FormNotice :error="flow.error.value" />
      <p v-if="flow.blocked.value" class="planning-warning" role="status">
        Запит не повторювався. Перевірте поточний стан перед наступною дією.
      </p>
      <AppButton
        v-if="flow.blocked.value || flow.error.value"
        :busy="flow.busy.value"
        @click="flow.refresh"
      >
        Отримати новий огляд
      </AppButton>
      <div class="actions">
        <AppButton
          type="submit"
          variant="primary"
          :busy="flow.busy.value"
          :disabled="!flow.ready.value"
        >
          {{
            flow.selected.value
              ? `Завершити сесію та ${flow.linkedType.value === 'subtask' ? 'підзавдання' : 'завдання'}`
              : `Завершити тільки ${subtaskId ? 'підзавдання' : 'завдання'}`
          }}
        </AppButton>
        <AppButton :disabled="flow.busy.value" @click="emit('close')">Скасувати</AppButton>
      </div>
    </form>
    <details class="completion-search">
      <summary>Шукати сесію за іншими датами</summary>
      <form class="stack" @submit.prevent="flow.search">
        <RangeFields v-model="flow.range.value" compact :disabled="flow.busy.value" />
        <AppButton type="submit" :disabled="flow.busy.value">Знайти сесії</AppButton>
      </form>
    </details>
  </AppModal>
</template>
<style scoped>
.completion-form,
.completion-search {
  margin-top: 16px;
}
.completion-choice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
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
  max-height: 17rem;
  overflow-y: auto;
}
.completion-search summary {
  cursor: pointer;
  padding-block: 8px;
}
@media (max-width: 600px) {
  .completion-form .actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
