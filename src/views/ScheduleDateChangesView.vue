<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Temporal } from '@js-temporal/polyfill'
import { fieldErrors } from '@/api/client'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { useSemesterManagement } from '@/composables/useSemesterManagement'
import {
  calendarDate,
  inPeriod,
  patterns,
  semesterTeacherNames,
  weekdays,
} from '@/utils/semesterSchedule'
import type { Parity, Weekday } from '@/types/semesterSchedule'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppModal from '@/components/ui/AppModal.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormField from '@/components/ui/FormField.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import SemesterMutationNotice from '@/components/schedule/SemesterMutationNotice.vue'

const { id } = defineProps<{ id: number }>()
const emit = defineEmits<{ created: [date: string] }>()
const path = `/schedule/semesters/${id}`
const management = useSemesterManagement(id)
const { state, resource, busy, dirty, blocked, error, review, save } = management
const data = computed(() => state.value?.data)
const saturday = ref('')
const confirming = ref(false)
const weekday = ref<Weekday | null>(null)
const parity = ref<Parity>('numerator')
const selectedRuleIds = ref<number[]>([])
const errors = computed(() => fieldErrors(error.value))
const unavailable = computed(
  () =>
    busy.value ||
    !!blocked.value ||
    review.value ||
    resource.loading.value ||
    !!resource.error.value,
)
const validSaturday = computed(
  () =>
    calendarDate(saturday.value) &&
    Temporal.PlainDate.from(saturday.value).dayOfWeek === 6 &&
    !!data.value &&
    inPeriod(data.value.schedule, saturday.value),
)
const eligibleRules = computed(() =>
  (data.value?.weekly_rules ?? [])
    .filter(
      (rule) =>
        rule.weekday === weekday.value &&
        (rule.week_pattern === 'all' || rule.week_pattern === parity.value),
    )
    .sort((a, b) => a.pair_number - b.pair_number || a.id - b.id),
)
watch([weekday, parity], () => {
  selectedRuleIds.value = []
})
watch(eligibleRules, (rules) => {
  selectedRuleIds.value = selectedRuleIds.value.filter((id) => rules.some((rule) => rule.id === id))
})
const selectionErrors = computed(() =>
  Object.entries(errors.value)
    .filter(
      ([field]) =>
        field === 'selected_weekly_rule_ids' || field.startsWith('selected_weekly_rule_ids.'),
    )
    .flatMap(([, messages]) => messages),
)
const conflicts = computed(() =>
  data.value?.date_exceptions.find((item) => item.occurs_on === saturday.value),
)
function requestSaturday() {
  if (
    !unavailable.value &&
    validSaturday.value &&
    weekday.value &&
    !conflicts.value &&
    selectedRuleIds.value.length
  )
    confirming.value = true
}
async function copySaturday() {
  if (
    !confirming.value ||
    unavailable.value ||
    !validSaturday.value ||
    !weekday.value ||
    conflicts.value ||
    !selectedRuleIds.value.length
  )
    return
  const selected = saturday.value
  const result = await save((token) =>
    semesterSchedulesApi.createSaturday(id, token, selected, weekday.value!, parity.value, [
      ...selectedRuleIds.value,
    ]),
  )
  confirming.value = false
  if (result) {
    saturday.value = ''
    weekday.value = null
    parity.value = 'numerator'
    selectedRuleIds.value = []
    error.value = null
    dirty.value = false
    emit('created', selected)
  }
}
</script>
<template>
  <div class="schedule-date-changes">
    <LoadingState v-if="resource.loading.value" />
    <ErrorState
      v-if="resource.error.value"
      :error="resource.error.value"
      retry
      @retry="resource.reload"
    />
    <SemesterMutationNotice
      :blocked="blocked"
      :review="review"
      :busy="busy || resource.loading.value"
      :error="error"
      @reload="resource.reload"
      @reviewed="review = false"
    />
    <div v-if="data" class="saturday-content">
      <AppCard id="saturday-classes">
        <p>
          Оберіть будній день, чисельник або знаменник та потрібні щотижневі пари. Копія діє тільки
          в обрану суботу. Подальші зміни щотижневих правил не змінять її розклад.
        </p>
        <form
          class="semester-form"
          @submit.prevent="requestSaturday"
          @input="dirty = true"
          @change="dirty = true"
        >
          <fieldset class="schedule-fieldset semester-form-grid" :disabled="busy">
            <FormField
              id="working-saturday"
              label="Дата суботи"
              :errors="errors.occurs_on ?? errors.date"
            >
              <template #default="{ id: field, invalid, describedby }">
                <input
                  :id="field"
                  v-model="saturday"
                  type="date"
                  required
                  :min="data.schedule.academic_period.starts_on"
                  :max="data.schedule.academic_period.ends_on"
                  :aria-invalid="invalid"
                  :aria-describedby="describedby"
                />
              </template>
            </FormField>
            <FormField id="copied-weekday" label="Скопіювати день" :errors="errors.copied_weekday">
              <template #default="{ id: field, invalid, describedby }">
                <select
                  :id="field"
                  v-model="weekday"
                  required
                  :aria-invalid="invalid"
                  :aria-describedby="describedby"
                >
                  <option :value="null" disabled>Оберіть будній день</option>
                  <option v-for="(label, day) in weekdays" :key="day" :value="Number(day)">
                    {{ label }}
                  </option>
                </select>
              </template>
            </FormField>
            <FormField
              id="source-parity"
              label="Парність тижня"
              :errors="errors.source_week_parity"
            >
              <template #default="{ id: field, invalid, describedby }">
                <select
                  :id="field"
                  v-model="parity"
                  required
                  :aria-invalid="invalid"
                  :aria-describedby="describedby"
                >
                  <option value="numerator">Чисельник</option>
                  <option value="denominator">Знаменник</option>
                </select>
              </template>
            </FormField>
          </fieldset>
          <fieldset
            class="schedule-fieldset semester-form"
            :disabled="busy"
            :aria-invalid="!!selectionErrors.length"
            :aria-describedby="selectionErrors.length ? 'saturday-selection-errors' : undefined"
          >
            <legend>Пари для копіювання</legend>
            <p v-if="!weekday" class="helper">Спочатку оберіть будній день.</p>
            <p v-else-if="!eligibleRules.length" role="status" class="helper">
              Для обраного дня та парності щотижневих пар немає.
            </p>
            <template v-else>
              <p class="helper">Оберіть одну або кілька пар.</p>
              <label v-for="rule in eligibleRules" :key="rule.id" class="schedule-consent">
                <input v-model="selectedRuleIds" type="checkbox" :value="rule.id" />
                <span>
                  Пара {{ rule.pair_number }}{{ rule.pair_label ? ` (${rule.pair_label})` : '' }} ·
                  {{ rule.subject.name }} · Викладач: {{ semesterTeacherNames(rule) }} · Аудиторія:
                  {{ rule.room ?? 'Не вказано' }} · {{ rule.starts_at_local }}–{{
                    rule.ends_at_local
                  }}
                </span>
              </label>
            </template>
            <ul v-if="selectionErrors.length" id="saturday-selection-errors" class="field-error">
              <li v-for="message in selectionErrors" :key="message">{{ message }}</li>
            </ul>
          </fieldset>
          <p v-if="weekday" class="helper">
            Джерело копії · {{ weekdays[weekday] }} · {{ patterns[parity] }}
          </p>
          <p v-if="saturday && !validSaturday" class="field-error">
            Оберіть суботу в межах навчального періоду.
          </p>
          <p v-if="conflicts" role="status" class="field-error">
            На цю дату вже є збережена заміна або робоча субота.
          </p>
          <div class="actions">
            <RouterLink v-if="conflicts" :to="`${path}/dates/${saturday}`" class="text-link">
              Редагувати вже збережений день
            </RouterLink>
            <AppButton
              v-else
              type="submit"
              variant="primary"
              :disabled="unavailable || !validSaturday || !weekday || !selectedRuleIds.length"
              :busy="busy"
            >
              Створити робочу суботу
            </AppButton>
          </div>
        </form>
      </AppCard>
    </div>
    <AppModal
      v-if="confirming"
      title="Створити робочу суботу?"
      :busy="busy"
      @close="confirming = false"
    >
      <p>
        Дата: {{ saturday }}. День для копіювання: {{ weekday ? weekdays[weekday] : '' }} ·
        {{ patterns[parity] }}. Вибрано пар: {{ selectedRuleIds.length }}.
      </p>
      <p class="helper">Копія діятиме лише в обрану суботу.</p>
      <div class="actions">
        <AppButton :disabled="busy" @click="confirming = false">Скасувати</AppButton>
        <AppButton variant="primary" :busy="busy" :disabled="unavailable" @click="copySaturday">
          Створити робочу суботу
        </AppButton>
      </div>
    </AppModal>
  </div>
</template>
