<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Temporal } from '@js-temporal/polyfill'
import { ApiError, fieldErrors } from '@/api/client'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { useSemesterManagement } from '@/composables/useSemesterManagement'
import { today } from '@/utils/dates'
import {
  calendarDate,
  inPeriod,
  lessonTypeLabel,
  patterns,
  semesterTeacherNames,
  weekdays,
} from '@/utils/semesterSchedule'
import type { Parity, SuppressedSlot, Weekday } from '@/types/semesterSchedule'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormField from '@/components/ui/FormField.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import SemesterMutationNotice from '@/components/schedule/SemesterMutationNotice.vue'

const id = Number(useRoute().params.id)
const router = useRouter()
const path = `/schedule/semesters/${id}`
const management = useSemesterManagement(id, async (signal) => {
  const [state, slots] = await Promise.all([
    semesterSchedulesApi.management(id, signal),
    semesterSchedulesApi.suppressions(id, signal),
  ])
  if (state.meta.schedule_token !== slots.meta.schedule_token) throw new ApiError(409)
  return { ...state, data: { ...state.data, suppressed_slots: slots.data } }
})
const { state, resource, busy, dirty, blocked, error, review, run, save } = management
const data = computed(() => state.value?.data)
const slot = ref<SuppressedSlot | null>(null)
const deleting = ref(false)
const saturday = ref('')
const weekday = ref<Weekday | null>(null)
const parity = ref<Parity>('numerator')
const selectedRuleIds = ref<number[]>([])
const date = ref('')
const notice = ref('')
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
const dateLink = computed(() =>
  calendarDate(date.value) && data.value && inPeriod(data.value.schedule, date.value)
    ? `${path}/dates/${date.value}`
    : null,
)
const conflicts = computed(() =>
  data.value?.date_exceptions.find((item) => item.occurs_on === saturday.value),
)
const timetableDate = computed(() => {
  if (!state.value) return undefined
  const schedule = state.value.data.schedule
  const current = today(state.value.meta.timezone)
  return inPeriod(schedule, current) ? current : schedule.academic_period.starts_on
})
const timetable = computed(() =>
  timetableDate.value
    ? {
        path: '/schedule',
        query: { semester: String(id), date: timetableDate.value, view: 'week' },
      }
    : '/schedule',
)
watch(timetableDate, (value) => {
  if (value && !date.value) date.value = value
})
async function copySaturday() {
  if (
    unavailable.value ||
    !validSaturday.value ||
    !weekday.value ||
    conflicts.value ||
    !selectedRuleIds.value.length
  )
    return
  notice.value = ''
  const selected = saturday.value
  const result = await save((token) =>
    semesterSchedulesApi.createSaturday(id, token, selected, weekday.value!, parity.value, [
      ...selectedRuleIds.value,
    ]),
  )
  if (result) await router.push(`${path}/dates/${selected}`)
}
async function removeSlot() {
  if (!slot.value) return
  const slotId = slot.value.id
  notice.value = ''
  const hasSaturdayDraft = dirty.value
  const result = await save((token) =>
    semesterSchedulesApi.releaseSuppression(id, slotId, token, true),
  )
  if (result) dirty.value = hasSaturdayDraft
  slot.value = null
  if (result)
    notice.value = 'Захист знято. Тепер можна додати пару вручну або повторно перевірити Excel.'
}
async function removeSchedule() {
  if (!state.value || unavailable.value) return
  const token = state.value.meta.schedule_token
  const result = await run(() => semesterSchedulesApi.remove(id, token, true))
  deleting.value = false
  if (result) await router.replace('/schedule')
}
async function reload() {
  await resource.reload()
  if (
    blocked.value === 'uncertain' &&
    resource.error.value instanceof ApiError &&
    resource.error.value.status === 404
  ) {
    notice.value = 'Семестр більше недоступний. Перевірте список семестрів.'
    blocked.value = null
    dirty.value = false
  }
}
</script>

<template>
  <header class="page-heading">
    <div>
      <RouterLink :to="timetable" class="text-link">← Семестровий розклад</RouterLink>
      <h1>Керування семестром</h1>
      <p v-if="data" class="helper">
        {{ data.schedule.academic_period.name }} · {{ data.schedule.group_name }} ·
        {{ data.schedule.education_institution.name }}
      </p>
    </div>
    <RouterLink v-if="data" :to="`${path}/settings`" class="button secondary">
      Налаштування семестру
    </RouterLink>
  </header>
  <LoadingState v-if="resource.loading.value" />
  <ErrorState v-if="resource.error.value" :error="resource.error.value" retry @retry="reload" />
  <SemesterMutationNotice
    :blocked="blocked"
    :review="review"
    :busy="busy || resource.loading.value"
    :error="error"
    @reload="reload"
    @reviewed="review = false"
  />
  <p v-if="notice" role="status" class="schedule-warning">{{ notice }}</p>
  <template v-if="data">
    <nav class="section-nav" aria-label="Що змінити в семестрі">
      <a href="#regular-classes">Регулярні заняття</a>
      <a href="#date-changes">Окрема дата</a>
      <a href="#saturday-classes">Робоча субота</a>
      <a href="#import-protection">Захист від імпорту</a>
    </nav>
    <AppCard id="regular-classes" title="Регулярні заняття">
      <p class="helper">
        Ці пари повторюються протягом семестру. Зміни на окремі дати зберігаються незалежно.
      </p>
      <template #action>
        <RouterLink :to="`${path}/rules/new`" class="button primary">Додати пару</RouterLink>
      </template>
      <p v-if="!data.weekly_rules.length" class="helper">Щотижневих пар ще немає.</p>
      <article v-for="rule in data.weekly_rules" :key="rule.id" class="semester-item">
        <h3>
          <RouterLink :to="`${path}/rules/${rule.id}`" class="text-link">
            {{ rule.subject.name }} · пара {{ rule.pair_number }}
          </RouterLink>
        </h3>
        <p class="helper">
          {{ weekdays[rule.weekday] }} · {{ patterns[rule.week_pattern] }} ·
          {{ rule.starts_at_local }}–{{ rule.ends_at_local }}
        </p>
        <p class="helper">Тип заняття: {{ lessonTypeLabel(rule.lesson_type) }}</p>
        <p class="helper">Викладач: {{ semesterTeacherNames(rule) }}</p>
        <p class="helper">Аудиторія: {{ rule.room ?? 'Не вказано' }}</p>
        <p class="helper" v-if="rule.is_manually_managed">Захищено від перезапису імпортом</p>
      </article>
    </AppCard>
    <AppCard id="date-changes" title="Змінити конкретний день">
      <p class="helper">Зміна на одну дату зберігає незалежний список пар на цей день.</p>
      <div class="actions">
        <FormField id="exception-date" label="Дата">
          <input
            id="exception-date"
            v-model="date"
            type="date"
            :min="data.schedule.academic_period.starts_on"
            :max="data.schedule.academic_period.ends_on"
          />
        </FormField>
        <RouterLink v-if="dateLink" :to="dateLink" class="button secondary">
          Відкрити редактор дати
        </RouterLink>
      </div>
      <p v-if="!data.date_exceptions.length" class="helper">
        Збережених замін і робочих субот ще немає.
      </p>
      <ul v-else>
        <li v-for="item in data.date_exceptions" :key="item.id">
          <RouterLink :to="`${path}/dates/${item.occurs_on}`" class="text-link">
            {{ item.occurs_on }} ·
            {{ item.kind === 'working_saturday' ? 'Робоча субота' : 'Заміна' }}
          </RouterLink>
          <template v-if="item.copied_weekday">
            · {{ weekdays[item.copied_weekday] }} ·
            {{
              item.source_week_parity ? patterns[item.source_week_parity] : 'Парність не збережено'
            }}
          </template>
          · {{ item.lessons.length ? `Пар: ${item.lessons.length}` : 'Усі пари скасовано' }}
        </li>
      </ul>
    </AppCard>
    <AppCard id="saturday-classes" title="Робоча субота">
      <p>
        Оберіть будній день, чисельник або знаменник та потрібні щотижневі пари. Копія діє тільки в
        обрану суботу. Подальші зміни щотижневих правил не змінять її розклад.
      </p>
      <form
        class="semester-form"
        @submit.prevent="copySaturday"
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
          <FormField id="source-parity" label="Парність тижня" :errors="errors.source_week_parity">
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
    <AppCard id="import-protection" title="Пари, які імпорт не відновить">
      <p>
        Ви прибрали ці регулярні пари вручну. Повторний імпорт не додасть їх знову, доки ви не
        знімете захист. Після зняття захисту пару потрібно додати або імпортувати окремо.
      </p>
      <p v-if="!data.suppressed_slots.length" class="helper">
        Немає видалених пар, захищених від повторного імпорту.
      </p>
      <div
        v-for="item in data.suppressed_slots"
        :key="item.id"
        class="semester-item section-heading semester-heading"
      >
        <span>
          {{ weekdays[item.weekday] }} · пара {{ item.pair_number }} ·
          {{ patterns[item.week_pattern] }}
        </span>
        <AppButton :disabled="unavailable" @click="slot = item">Зняти захист</AppButton>
      </div>
    </AppCard>
    <AppCard title="Видалення семестру">
      <p class="helper">
        Видалити можна лише порожній семестр без історії імпорту. Сервер перевіряє правила, заміни,
        захищені слоти та всі пакети імпорту.
      </p>
      <AppButton variant="danger" :disabled="unavailable" @click="deleting = true">
        Видалити семестр
      </AppButton>
    </AppCard>
  </template>
  <ConfirmDialog
    v-if="deleting"
    title="Видалити семестр?"
    :busy="busy"
    @close="deleting = false"
    @confirm="removeSchedule"
  >
    Сервер перевірить залежності. Порожній семестр без історії імпорту буде видалено.
  </ConfirmDialog>
  <ConfirmDialog
    v-if="slot"
    title="Дозволити знову додати цю пару?"
    confirm-label="Зняти захист"
    :busy="busy"
    @close="slot = null"
    @confirm="removeSlot"
  >
    {{ weekdays[slot.weekday] }} · пара {{ slot.pair_number }} · {{ patterns[slot.week_pattern] }}.
    Видаляється запис захисту. Для створення пари потрібна окрема дія.
  </ConfirmDialog>
</template>
