<script setup lang="ts">
import WorkLink from '@/components/planning/WorkLink.vue'
import { localizedEffects } from '@/utils/aiEffects'
import { computed } from 'vue'
import type { AiAction, ConsentField } from '@/types/ai'
import {
  actionLabels,
  positiveId,
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
import DetailSection from '@/components/ui/DetailSection.vue'
import WorkSnapshot from './WorkSnapshot.vue'
import StudyProposal from '@/components/planning/StudyProposal.vue'
import { isPublicObject } from '@/utils/ai'
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
const receiptData = computed(() =>
  isPublicObject(props.action.receipt?.result) ? props.action.receipt.result : props.action.receipt,
)
const receiptWork = computed(
  () =>
    receiptData.value?.task ??
    receiptData.value?.subtask ??
    receiptData.value?.reminder ??
    receiptData.value ??
    null,
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
const semesterScheduleId = computed(() =>
  isSemesterAction(props.action.type) && positiveId(props.action.preview.semester_schedule_id)
    ? props.action.preview.semester_schedule_id
    : null,
)
const planning = computed(() =>
  [
    'propose_study_plan_create',
    'propose_adaptive_replanning',
    'propose_session_reschedule',
  ].includes(props.action.type),
)
const consentLabels: Record<ConsentField, string> = {
  accept_split_replacements: 'Перевірив усі нові сесії та погоджуюся на поділ початкової сесії.',
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
      <details v-if="action.type !== 'propose_semester_occurrence_create'" class="tool-metadata">
        <summary>Технічні деталі</summary>
        <span class="helper">{{ action.id }}</span>
      </details>
    </div>
    <p v-if="action.expires_at" class="helper">
      Строк дії: {{ dateTime(action.expires_at, timezone) }}. Остаточний стан визначає сервер.
    </p>
    <p v-if="action.status === 'pending'" class="ai-review-notice">
      Це пропозиція — зміни ще не збережено. Перевірте огляд і натисніть «Підтвердити зміни», якщо
      погоджуєтеся.
    </p>
    <p v-else-if="action.status === 'rejected'" class="ai-review-notice">
      Пропозицію відхилено без виконання змін. Відхилення не є скасуванням раніше виконаної дії.
    </p>
    <p v-else-if="action.status === 'expired'" class="ai-review-notice">
      Термін минув. Цю пропозицію неможливо відновити; попросіть нову.
    </p>
    <section v-if="lifecycleReview" class="ai-review-section">
      <h3>
        <WorkLink :task-id="lifecycleReview.task_id" :subtask-id="lifecycleReview.subtask_id" />
      </h3>

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
            ? 'Не вказано'
            : `${lifecycleReview.actual_minutes} хв`
        }}
      </p>
      <p>
        Після підтвердження буде скасовано заплановані нагадування:
        {{ lifecycleReview.dependent_reminders.scheduled_count }}.
      </p>

      <p>Нові або замінні сесії автоматично не створюються.</p>
    </section>
    <AiSemesterReview
      v-if="
        isSemesterAction(action.type) &&
        !(action.type === 'propose_semester_occurrence_create' && action.status === 'executed')
      "
      :action="action"
    />
    <template v-else-if="action.type === 'propose_semester_occurrence_create'"></template>
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
    <DetailSection v-else title="Технічні деталі пропозиції">
      <AiFields :value="action.preview" :timezone="timezone" />
    </DetailSection>
    <section
      v-if="
        action.preview.effects && !lessonReview && !availability && !isSemesterAction(action.type)
      "
      class="ai-material-effect ai-review-section"
    >
      <h3>Що зміниться після підтвердження</h3>
      <AiFields :value="localizedEffects(action.preview.effects)" :timezone="timezone" />
      <DetailSection title="Технічні деталі наслідків">
        <AiFields :value="action.preview.effects" :timezone="timezone" />
      </DetailSection>
    </section>
    <section
      v-if="action.receipt && action.status === 'executed'"
      class="ai-receipt ai-review-section"
    >
      <h3>Зміни застосовано</h3>
      <p class="helper">Результат на момент підтвердження. Поточні дані могли змінитися.</p>
      <AiSemesterReview
        v-if="action.type === 'propose_semester_occurrence_create'"
        :action="action"
        saved
      />
      <AiAvailabilityReview v-else-if="availabilityResult" :receipt="availabilityResult" />
      <p v-else-if="availability" role="alert" class="field-error">
        Не вдалося перевірити результат зміни доступності. Оновіть стан дії.
      </p>
      <template v-else>
        <StudyProposal
          v-if="planning"
          :review="isPublicObject(action.receipt.result) ? action.receipt.result : action.receipt"
          :timezone="timezone"
        />
        <div v-else-if="lessonResult" class="saved-lesson">
          <h3>{{ lessonResult.lesson.subject?.name ?? 'Заняття' }}</h3>
          <p>
            {{ dateTime(lessonResult.lesson.starts_at, timezone) }} —
            {{ dateTime(lessonResult.lesson.ends_at, timezone) }}
          </p>
          <p v-if="lessonResult.lesson.teacher" class="helper">
            {{ lessonResult.lesson.teacher.name }}
          </p>
          <p v-if="lessonResult.lesson.room" class="helper">Ауд. {{ lessonResult.lesson.room }}</p>
        </div>
        <WorkSnapshot v-else-if="!semesterScheduleId" :value="receiptWork" :timezone="timezone" />
        <DetailSection title="Технічні деталі результату">
          <AiFields :value="action.receipt" :timezone="timezone" />
        </DetailSection>
      </template>
      <RouterLink
        v-if="lifecycleSessionId"
        :to="`/planning/sessions/${lifecycleSessionId}`"
        class="button secondary"
      >
        Відкрити навчальну сесію
      </RouterLink>
      <div class="actions">
        <RouterLink v-if="availability" to="/planning/availability" class="button secondary">
          До навчальної доступності
        </RouterLink>
        <template v-if="lesson">
          <RouterLink to="/schedule/legacy" class="button secondary">До окремих занять</RouterLink>
          <RouterLink
            v-if="lessonResult"
            :to="`/schedule/lessons/${lessonResult.lesson.id}`"
            class="button secondary"
          >
            Відкрити заняття
          </RouterLink>
          <RouterLink
            v-if="lessonResult?.original"
            :to="`/schedule/lessons/${lessonResult.original.id}`"
            class="button secondary"
          >
            Початкове заняття
          </RouterLink>
        </template>
        <RouterLink
          v-if="semesterScheduleId"
          :to="`/schedule/semesters/${semesterScheduleId}`"
          class="button secondary"
        >
          Переглянути семестр
        </RouterLink>
        <RouterLink v-if="taskId" :to="`/tasks/${taskId}`" class="button secondary">
          Відкрити завдання
        </RouterLink>
        <RouterLink
          v-else-if="!lesson && !availability && !semesterScheduleId"
          to="/tasks"
          class="button secondary"
        >
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
          Відкрити навчальну сесію
        </RouterLink>
        <RouterLink v-if="reminderId" :to="`/reminders/${reminderId}`" class="button secondary">
          Відкрити нагадування
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
            {{ weekdays[window.day_of_week - 1] }} · {{ window.starts_at }} —
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
