<script setup lang="ts">
import { computed } from 'vue'
import type { AiAction, ConsentField } from '@/types/ai'
import {
  actionLabels,
  consentFields,
  receiptTaskId,
  receiptReminderId,
  receiptSessionIds,
  reviewSupported,
  statusLabels,
  sessionLifecycleReview,
  receiptLifecycleSessionId,
} from '@/utils/ai'
import { isLessonAction, lessonPreview, lessonReceipt } from '@/utils/aiLesson'
import AiLessonReview from './AiLessonReview.vue'
import AiAvailabilityReview from './AiAvailabilityReview.vue'
import {
  isAvailabilityAction,
  availabilityPreview,
  availabilityReceipt,
} from '@/utils/aiAvailability'
import type { AvailabilityWindow } from '@/types/planning'
import { weekdays } from '@/utils/planning'
import { dateTime } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AiFields from './AiFields.vue'
import AiWorkReview from './AiWorkReview.vue'
import AiReminderReview from './AiReminderReview.vue'
import AiPlanningReview from './AiPlanningReview.vue'
import AiNotice from './AiNotice.vue'
import AiSemesterReview from './AiSemesterReview.vue'
import { isSemesterAction } from '@/utils/aiSemester'
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
  currentAvailability?: AvailabilityWindow[] | null
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
const availability = computed(() => isAvailabilityAction(props.action.type))
const availabilityReview = computed(() =>
  availabilityPreview(props.action.preview, props.action.type),
)
const availabilityResult = computed(() =>
  availabilityReceipt(props.action.receipt, props.action.type, props.action.id),
)
const reminderId = computed(() =>
  availability.value ? null : receiptReminderId(props.action.receipt),
)
const taskId = computed(() => (availability.value ? null : receiptTaskId(props.action.receipt)))
const lifecycleReview = computed(() => sessionLifecycleReview(props.action))
const lifecycleSessionId = computed(() =>
  receiptLifecycleSessionId(props.action.receipt, props.action),
)
const lesson = computed(() => isLessonAction(props.action.type))
const lessonReview = computed(() => lessonPreview(props.action.preview, props.action.type))
const lessonResult = computed(() =>
  lessonReceipt(props.action.receipt, props.action.type, props.action.id),
)
const sessionIds = computed(() =>
  lesson.value || availability.value ? [] : receiptSessionIds(props.action.receipt),
)
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
  <AppCard
    class="ai-action-review"
    :data-action-id="action.id"
    :title="actionLabels[action.type] ?? 'Пропозиція іншого типу'"
  >
    <div class="inline">
      <strong
        class="badge"
        :class="
          action.status === 'executed' ? 'success' : action.status === 'pending' ? 'warning' : ''
        "
      >
        {{ statusLabels[action.status] }}
      </strong>
      <details class="tool-metadata">
        <summary>Номер пропозиції</summary>
        <span class="helper">{{ action.id }}</span>
      </details>
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
    <section v-if="lifecycleReview" class="ai-review-section">
      <h3>Навчальна сесія №{{ lifecycleReview.study_session_id }}</h3>
      <p>
        Завдання №{{ lifecycleReview.task_id }}
        <template v-if="lifecycleReview.subtask_id !== null">
          · підзавдання №{{ lifecycleReview.subtask_id }}
        </template>
      </p>
      <p>
        Поточний стан: Заплановано · після підтвердження:
        {{ lifecycleReview.proposed_status === 'completed' ? 'Виконано' : 'Пропущено' }}
      </p>
      <p>Початок: {{ dateTime(lifecycleReview.starts_at, timezone) }}</p>
      <p>Завершення: {{ dateTime(lifecycleReview.ends_at, timezone) }}</p>
      <p v-if="lifecycleReview.proposed_status === 'completed'">
        Фактичний час:
        {{
          lifecycleReview.actual_minutes === null
            ? 'Не вказано; час не вигадується.'
            : `${lifecycleReview.actual_minutes} хв`
        }}
      </p>
      <p>
        Після підтвердження буде скасовано заплановані нагадування:
        {{ lifecycleReview.dependent_reminders.scheduled_count }}.
      </p>
      <ul v-if="lifecycleReview.dependent_reminders.scheduled_reminder_ids.length">
        <li v-for="id in lifecycleReview.dependent_reminders.scheduled_reminder_ids" :key="id">
          Нагадування №{{ id }}
        </li>
      </ul>
      <p>Нові або замінні сесії автоматично не створюються.</p>
    </section>
    <AiSemesterReview v-if="isSemesterAction(action.type)" :action="action" />
    <AiAvailabilityReview
      v-else-if="availabilityReview"
      :preview="availabilityReview"
      :historical="action.status !== 'pending'"
    />
    <AiLessonReview v-else-if="lessonReview" :preview="lessonReview" :timezone="timezone" />
    <AiPlanningReview
      v-else-if="planning"
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
    <template v-else-if="lifecycleReview"></template>
    <AiFields v-else :value="action.preview" :timezone="timezone" />
    <section
      v-if="
        action.preview.effects && !lessonReview && !availability && !isSemesterAction(action.type)
      "
      class="ai-material-effect ai-review-section"
    >
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
      <AiAvailabilityReview v-if="availabilityResult" :receipt="availabilityResult" />
      <p v-else-if="availability" role="alert" class="field-error">
        Квитанція доступності не пройшла перевірку. Перевірте стан дії на сервері.
      </p>
      <AiFields v-else :value="action.receipt" :timezone="timezone" />
      <RouterLink
        v-if="lifecycleSessionId"
        :to="`/planning/sessions/${lifecycleSessionId}`"
        class="button secondary"
      >
        Відкрити сесію №{{ lifecycleSessionId }}
      </RouterLink>
      <div class="actions">
        <RouterLink v-if="availability" to="/planning/availability" class="button secondary">
          До навчальної доступності
        </RouterLink>
        <template v-if="lesson">
          <RouterLink to="/schedule/legacy" class="button secondary">
            До старого розкладу
          </RouterLink>
          <RouterLink
            v-if="lessonResult"
            :to="`/schedule/lessons/${lessonResult.lesson.id}`"
            class="button secondary"
          >
            Відкрити заняття №{{ lessonResult.lesson.id }}
          </RouterLink>
          <RouterLink
            v-if="lessonResult?.original"
            :to="`/schedule/lessons/${lessonResult.original.id}`"
            class="button secondary"
          >
            Початкове заняття №{{ lessonResult.original.id }}
          </RouterLink>
        </template>
        <RouterLink v-if="taskId" :to="`/tasks/${taskId}`" class="button secondary">
          Відкрити завдання #{{ taskId }}
        </RouterLink>
        <RouterLink v-else-if="!lesson && !availability" to="/tasks" class="button secondary">
          До завдань
        </RouterLink>
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
        <RouterLink v-if="reminderId" :to="`/reminders/${reminderId}`" class="button secondary">
          Відкрити нагадування №{{ reminderId }}
        </RouterLink>
        <RouterLink
          v-if="action.type.startsWith('propose_reminder_')"
          to="/reminders"
          class="text-link"
        >
          До нагадувань
        </RouterLink>
        <AppButton :busy="domainBusy" @click="emit('refreshDomains')">
          Оновити пов’язані дані
        </AppButton>
      </div>
      <p v-if="domainError" class="helper">Дію виконано, але пов’язані дані не вдалося оновити.</p>
      <AiNotice :error="domainError" />
    </section>
    <section v-if="domainError && action.status !== 'executed'" class="ai-review-section">
      <p>
        {{
          availability
            ? 'Поточну доступність не вдалося перевірити.'
            : 'Поточний розклад не вдалося перевірити.'
        }}
        Потрібна нова пропозиція на актуальних даних.
      </p>
      <AiNotice :error="domainError" />
      <AppButton :busy="domainBusy" @click="emit('refreshDomains')">
        Оновити пов’язані дані
      </AppButton>
    </section>
    <section
      v-if="availability && needsProposal && action.status === 'pending'"
      class="ai-review-section ai-availability-current"
    >
      <h3>Актуальна доступність</h3>
      <p>
        Поточна доступність або її часовий пояс змінилися чи більше не допускають цю зміну. Навіть
        редагування іншого дня тижня робить старий огляд непридатним. Попросіть нову AI-пропозицію
        на актуальних даних.
      </p>
      <AppButton :busy="domainBusy" @click="emit('refreshDomains')">
        Оновити поточну доступність
      </AppButton>
      <p class="helper">
        Поточний часовий пояс профілю: {{ timezone }}. Старий огляд вище зберігає власний часовий
        пояс.
      </p>
      <template v-if="currentAvailability && !domainError">
        <p v-if="!currentAvailability.length">Поточних інтервалів немає.</p>
        <ul v-else>
          <li v-for="window in currentAvailability" :key="window.id">
            №{{ window.id }} · {{ weekdays[window.day_of_week - 1] }} · {{ window.starts_at }} —
            {{ window.ends_at }}
          </li>
        </ul>
      </template>
      <RouterLink to="/planning/availability" class="button secondary">
        До навчальної доступності
      </RouterLink>
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
