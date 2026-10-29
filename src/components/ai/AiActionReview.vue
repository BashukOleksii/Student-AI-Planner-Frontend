<script setup lang="ts">
import { computed } from 'vue'
import type { AiAction, ConsentField } from '@/types/ai'
import {
  actionLabels,
  consentFields,
  receiptTaskId,
  receiptSessionIds,
  reviewSupported,
  statusLabels,
} from '@/utils/ai'
import { dateTime } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AiFields from './AiFields.vue'
import AiWorkReview from './AiWorkReview.vue'
import AiReminderReview from './AiReminderReview.vue'
import AiPlanningReview from './AiPlanningReview.vue'
import AiNotice from './AiNotice.vue'
const props = defineProps<{
  action: AiAction
  timezone: string
  consent: Partial<Record<ConsentField, boolean>>
  busy: boolean
  blocked: boolean
  needsProposal: boolean
  uncertain: boolean
  error: unknown
  notice: string
  domainError: unknown
  domainBusy: boolean
}>()
const emit = defineEmits<{
  decision: [operation: 'confirm' | 'reject']
  consent: [field: ConsentField, checked: boolean]
  refreshDomains: []
  recover: []
}>()
const required = computed(() => consentFields(props.action))
const allowed = computed(() => reviewSupported(props.action))
const canConfirm = computed(
  () =>
    allowed.value &&
    !props.needsProposal &&
    !props.uncertain &&
    required.value.every((field) => props.consent[field] === true),
)
const taskId = computed(() => receiptTaskId(props.action.receipt))
const sessionIds = computed(() => receiptSessionIds(props.action.receipt))
const planning = computed(() =>
  [
    'propose_study_plan_create',
    'propose_adaptive_replanning',
    'propose_session_reschedule',
  ].includes(props.action.type),
)
const consentLabels: Record<ConsentField, string> = {
  accept_partial:
    'Погоджуюся на частковий результат: не всю роботу або тривалість буде розміщено / перенесено, як показано в огляді.',
  accept_unplaced_cancellation:
    'Окремо погоджуюся скасувати початкові сесії без нового місця та їхні заплановані нагадування, як показано в огляді.',
}
</script>
<template>
  <AppCard class="ai-action-review" :title="actionLabels[action.type] ?? 'Пропозиція іншого типу'">
    <div class="inline">
      <strong
        class="badge"
        :class="
          action.status === 'executed' ? 'success' : action.status === 'pending' ? 'warning' : ''
        "
      >
        {{ statusLabels[action.status] }}
      </strong>
      <span class="helper">Дія {{ action.id }}</span>
    </div>
    <p v-if="action.expires_at" class="helper">
      Строк дії: {{ dateTime(action.expires_at, timezone) }}. Остаточний стан визначає сервер.
    </p>
    <p v-if="action.status === 'pending'" class="ai-review-notice">
      Це пропозиція. Бізнес-зміни ще не виконано. Повідомлення «так» у чаті не є підтвердженням.
    </p>
    <p v-else-if="action.status === 'rejected'" class="ai-review-notice">
      Пропозицію відхилено без виконання змін. Відхилення не є скасуванням раніше виконаної дії.
    </p>
    <p v-else-if="action.status === 'expired'" class="ai-review-notice">
      Термін минув. Цю пропозицію неможливо відновити; попросіть нову.
    </p>
    <AiPlanningReview
      v-if="planning"
      :preview="action.preview"
      :type="action.type"
      :timezone="timezone"
    />
    <AiReminderReview
      v-else-if="action.type.startsWith('propose_reminder_')"
      :preview="action.preview"
      :timezone="timezone"
    />
    <AiWorkReview
      v-else-if="
        action.type.startsWith('propose_task_') || action.type.startsWith('propose_subtask_')
      "
      :preview="action.preview"
      :timezone="timezone"
    />
    <AiFields v-else :value="action.preview" :timezone="timezone" />
    <section v-if="action.preview.effects" class="ai-material-effect ai-review-section">
      <h3>Наслідки, визначені сервером</h3>
      <AiFields :value="action.preview.effects" :timezone="timezone" />
    </section>
    <section
      v-if="action.receipt && action.status === 'executed'"
      class="ai-receipt ai-review-section"
    >
      <h3>Квитанція виконання</h3>
      <p class="helper">
        Історичний результат підтвердженої операції. Пізніші зміни записів не змінюють цю квитанцію.
      </p>
      <AiFields :value="action.receipt" :timezone="timezone" />
      <div class="actions">
        <RouterLink v-if="taskId" :to="`/tasks/${taskId}`" class="button secondary">
          Відкрити завдання #{{ taskId }}
        </RouterLink>
        <RouterLink v-else to="/tasks" class="button secondary">До завдань</RouterLink>
        <RouterLink v-if="planning" to="/planning/sessions" class="button secondary">
          До навчальних сесій
        </RouterLink>
        <RouterLink
          v-for="id in sessionIds"
          :key="id"
          :to="`/planning/sessions/${id}`"
          class="button secondary"
        >
          Відкрити сесію №{{ id }}
        </RouterLink>
        <AppButton :busy="domainBusy" @click="emit('refreshDomains')">
          Оновити пов’язані дані
        </AppButton>
      </div>
      <p v-if="domainError" class="helper">Дію виконано, але пов’язані дані не вдалося оновити.</p>
      <AiNotice :error="domainError" />
    </section>
    <p v-if="notice" class="success-notice" role="status">{{ notice }}</p>
    <AiNotice :error="error" />
    <template v-if="action.status === 'pending'">
      <p v-if="!allowed" class="field-error">
        Цей тип або вимоги огляду не підтримуються для безпечного підтвердження. Ви можете відхилити
        пропозицію.
      </p>
      <p v-if="needsProposal" class="field-error">
        Огляд більше не придатний для виконання. Попросіть нову пропозицію; поточну можна відхилити.
      </p>
      <fieldset :disabled="busy || blocked || uncertain" class="ai-consent">
        <legend v-if="required.length">Окремі дозволи на наслідки</legend>
        <label v-for="field in required" :key="field" class="checkbox-field">
          <input
            type="checkbox"
            :checked="consent[field] === true"
            @change="emit('consent', field, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ consentLabels[field] }}</span>
        </label>
      </fieldset>
      <div class="actions">
        <AppButton
          variant="primary"
          :busy="busy"
          :disabled="blocked || !canConfirm"
          @click="emit('decision', 'confirm')"
        >
          Підтвердити зміни
        </AppButton>
        <AppButton
          variant="danger"
          :disabled="busy || blocked || uncertain"
          @click="emit('decision', 'reject')"
        >
          Відхилити пропозицію
        </AppButton>
        <AppButton v-if="uncertain" :disabled="busy" @click="emit('recover')">
          Перевірити стан дії
        </AppButton>
      </div>
    </template>
  </AppCard>
</template>
