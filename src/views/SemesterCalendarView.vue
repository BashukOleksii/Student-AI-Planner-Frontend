<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSemesterSelection } from '@/stores/semesterSelection'
import { useResource } from '@/composables/useResource'
import { semesterScheduleImportsApi } from '@/api/semesterScheduleImports'
import SemesterImportReceipt from '@/components/schedule/SemesterImportReceipt.vue'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { addDays, calendarLabel, today } from '@/utils/dates'
import {
  calendarDate,
  displayDates,
  inPeriod,
  patterns,
  plannerSourceNotice,
  weekdays,
} from '@/utils/semesterSchedule'
import { importReturnId } from '@/utils/scheduleImport'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import SemesterSelector from '@/components/schedule/SemesterSelector.vue'
import SemesterOccurrenceCard from '@/components/schedule/SemesterOccurrenceCard.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const preference = useSemesterSelection()
const currentDate = computed(() => today(auth.user?.timezone ?? 'UTC'))
const date = computed(() => (calendarDate(route.query.date) ? route.query.date : currentDate.value))
const mode = computed(() => (route.query.view === 'week' ? 'week' : 'date'))
const list = useResource(semesterSchedulesApi.list)
const receiptId = computed(() => importReturnId(route.query.receipt))
const receiptResource = useResource(
  (signal) =>
    receiptId.value
      ? semesterScheduleImportsApi.get(receiptId.value, signal)
      : Promise.resolve(null),
  [receiptId],
)
const receipt = computed(() =>
  receiptResource.data.value?.receipt?.semester_schedule_id === selection.value
    ? receiptResource.data.value?.receipt
    : null,
)
const explicit = computed(() => importReturnId(route.query.semester))
const selection = computed({
  get() {
    const schedules = list.data.value ?? []
    if (explicit.value) return explicit.value
    const remembered = schedules.find((item) => item.id === preference.selected)
    if (remembered) return remembered.id
    const matching = schedules.filter((item) => inPeriod(item, date.value))
    if (matching.length === 1) return matching[0]!.id
    return schedules.length === 1 ? schedules[0]!.id : null
  },
  set(id) {
    if (!id) return
    preference.selected = id
    const selected = list.data.value?.find((item) => item.id === id)
    void navigate({
      semester: String(id),
      date:
        selected && !inPeriod(selected, date.value)
          ? selected.academic_period.starts_on
          : date.value,
    })
  },
})
watch([explicit, list.data], ([id, schedules]) => {
  if (id && schedules?.some((item) => item.id === id)) preference.selected = id
})
function navigate(query: Record<string, string | undefined>) {
  return router.replace({
    path: '/schedule/semester-calendar',
    query: {
      ...route.query,
      semester: selection.value ? String(selection.value) : undefined,
      ...query,
    },
  })
}
function move(days: number) {
  const next = addDays(date.value, days)
  if (calendarDate(next)) void navigate({ date: next })
}
function setDate(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (calendarDate(value)) void navigate({ date: value })
}

const detail = useResource(
  (signal) =>
    selection.value ? semesterSchedulesApi.get(selection.value, signal) : Promise.resolve(null),
  [selection],
)
const occurrences = useResource(
  (signal) =>
    selection.value
      ? semesterSchedulesApi.occurrences(selection.value, mode.value, date.value, signal)
      : Promise.resolve(null),
  [selection, mode, date],
)
const definitions = useResource(
  async (signal) => {
    if (!selection.value) return null
    const [rules, exceptions] = await Promise.all([
      semesterSchedulesApi.rules(selection.value, signal),
      semesterSchedulesApi.exceptions(selection.value, signal),
    ])
    return {
      patterns: new Map(rules.data.map((rule) => [rule.id, rule.week_pattern])),
      exceptions: new Map(exceptions.data.map((exception) => [exception.occurs_on, exception])),
    }
  },
  [selection, date, mode],
)
const days = computed(() => {
  const result = occurrences.data.value
  if (!result) return []
  return displayDates(result.meta.start_date, result.meta.end_date).map((day) => ({
    date: day,
    lessons: result.data.filter((item) => item.occurs_on === day),
    exception: definitions.data.value?.exceptions.get(day),
  }))
})
</script>

<template>
  <div class="page-workspace page-calendar">
    <header class="page-heading">
      <div>
        <h1>Семестровий розклад</h1>
        <p class="muted">{{ plannerSourceNotice }}</p>
      </div>
      <div v-if="selection" class="segmented" aria-label="Режим розкладу">
        <button
          type="button"
          :aria-pressed="mode === 'date'"
          @click="navigate({ view: undefined })"
        >
          День
        </button>
        <button type="button" :aria-pressed="mode === 'week'" @click="navigate({ view: 'week' })">
          Тиждень
        </button>
      </div>
    </header>
    <div class="actions">
      <RouterLink
        to="/schedule/semesters/new"
        :class="selection ? 'button secondary' : 'button primary'"
      >
        Створити семестр
      </RouterLink>
      <RouterLink to="/schedule/semester-import" class="button secondary">
        Імпорт семестру з Excel
      </RouterLink>
      <RouterLink to="/planning" class="text-link">Планування навчання</RouterLink>
      <RouterLink
        :to="{ path: '/schedule/legacy', query: { date, view: route.query.view } }"
        class="text-link"
      >
        Окремі заняття
      </RouterLink>
    </div>
    <ErrorState
      v-if="receiptResource.error.value"
      :error="receiptResource.error.value"
      retry
      @retry="receiptResource.reload"
    />
    <SemesterImportReceipt
      v-if="receipt && receiptId"
      :receipt="receipt"
      :import-id="receiptId"
      :timezone="auth.user?.timezone ?? 'UTC'"
    >
      <RouterLink :to="`/schedule/semester-imports/${receiptId}`" class="text-link">
        Відкрити пакет імпорту
      </RouterLink>
    </SemesterImportReceipt>
    <LoadingState v-if="list.loading.value" />
    <ErrorState v-else-if="list.error.value" :error="list.error.value" retry @retry="list.reload" />
    <template v-if="list.data.value">
      <SemesterSelector
        v-if="list.data.value.length"
        v-model="selection"
        :schedules="list.data.value"
      />
      <EmptyState
        v-else-if="!selection"
        title="Семестрових розкладів ще немає"
        description="Створіть розклад вручну або імпортуйте правила з Excel."
      />
      <EmptyState
        v-if="list.data.value.length && !selection"
        title="Оберіть семестр, щоб побачити заняття"
      />
    </template>

    <template v-if="selection">
      <LoadingState v-if="detail.loading.value" />
      <ErrorState
        v-else-if="detail.error.value"
        :error="detail.error.value"
        retry
        @retry="detail.reload"
      />
      <template v-else-if="detail.data.value">
        <div class="section-heading semester-heading">
          <div>
            <h2>
              {{ detail.data.value.academic_period.name }} · {{ detail.data.value.group_name }}
            </h2>
            <p class="helper">
              {{ detail.data.value.education_institution.name }} ·
              {{ detail.data.value.academic_period.starts_on }} —
              {{ detail.data.value.academic_period.ends_on }}
            </p>
            <p class="helper">
              {{ patterns[detail.data.value.first_week_parity] }} з
              {{ detail.data.value.parity_anchor_on }}
            </p>
          </div>
          <RouterLink :to="`/schedule/semesters/${selection}`" class="button secondary">
            Керувати семестром
          </RouterLink>
        </div>
        <div class="toolbar">
          <div class="inline">
            <AppButton aria-label="Попередній період" @click="move(mode === 'week' ? -7 : -1)">
              ←
            </AppButton>
            <label for="semester-date" class="sr-only">Дата розкладу</label>
            <input
              id="semester-date"
              type="date"
              :value="date"
              min="0001-01-01"
              max="9999-12-31"
              @change="setDate"
            />
            <AppButton aria-label="Наступний період" @click="move(mode === 'week' ? 7 : 1)">
              →
            </AppButton>
          </div>
          <AppButton @click="navigate({ date: undefined, view: undefined })">Сьогодні</AppButton>
        </div>
        <LoadingState v-if="occurrences.loading.value" />
        <ErrorState
          v-else-if="occurrences.error.value"
          :error="occurrences.error.value"
          retry
          @retry="occurrences.reload"
        />
        <template v-else-if="occurrences.data.value">
          <ErrorState
            v-if="definitions.error.value"
            :error="definitions.error.value"
            retry
            @retry="definitions.reload"
          />
          <p class="helper">Часовий пояс {{ occurrences.data.value.meta.timezone }}</p>
          <div class="schedule-days" :class="{ 'week-view': mode === 'week' }">
            <AppCard v-for="day in days" :key="day.date" :title="calendarLabel(day.date)">
              <template v-if="inPeriod(detail.data.value, day.date)">
                <p v-if="day.exception" class="helper">
                  {{
                    day.exception.kind === 'working_saturday' ? 'Робоча субота' : 'Заміна на дату'
                  }}
                  <template v-if="day.exception.copied_weekday">
                    · {{ weekdays[day.exception.copied_weekday] }} ·
                    {{
                      day.exception.source_week_parity
                        ? patterns[day.exception.source_week_parity]
                        : 'Парність не збережено'
                    }}
                  </template>
                </p>
                <EmptyState
                  compact
                  v-if="!day.lessons.length"
                  :title="day.exception ? 'Заняття на цю дату скасовано' : 'Занять немає'"
                />
                <div v-else class="lesson-list">
                  <SemesterOccurrenceCard
                    v-for="occurrence in day.lessons"
                    :key="occurrence.occurrence_id"
                    :occurrence="occurrence"
                    :schedule-id="selection"
                    :timezone="occurrences.data.value.meta.timezone"
                    :pattern="
                      occurrence.weekly_lesson_rule_id
                        ? definitions.data.value?.patterns.get(occurrence.weekly_lesson_rule_id)
                        : undefined
                    "
                  />
                </div>
                <RouterLink
                  :to="`/schedule/semesters/${selection}/dates/${day.date}`"
                  class="text-link"
                >
                  Редагувати весь день
                </RouterLink>
              </template>
              <EmptyState v-else title="Поза межами семестру" />
            </AppCard>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
