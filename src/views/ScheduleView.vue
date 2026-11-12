<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCurrentSemester } from '@/composables/useCurrentSemester'
import { useResource } from '@/composables/useResource'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import type { AcademicLesson } from '@/types/academicCalendar'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { academicCalendarApi } from '@/api/academicCalendar'
import { today, addDays, calendarLabel, localDate, localEndDate } from '@/utils/dates'
import { calendarDate, displayDates, inPeriod } from '@/utils/semesterSchedule'
import AcademicLessonCard from '@/components/schedule/AcademicLessonCard.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore()
const date = computed(() =>
  typeof route.query.date === 'string' && calendarDate(route.query.date)
    ? route.query.date
    : today(auth.user?.timezone ?? 'UTC'),
)
const week = computed(() => route.query.view === 'week')
const result = useResource(
  (signal) =>
    week.value
      ? academicCalendarApi.week(date.value, signal)
      : route.query.date
        ? academicCalendarApi.date(date.value, signal)
        : academicCalendarApi.today(signal),
  [date, week],
)
const semesters = useResource(semesterSchedulesApi.list)
const { status: semesterStatus } = useCurrentSemester(() => semesters.data.value ?? [])
interface DayEditor {
  id: number
  label: string
}
const choosingDay = ref<string | null>(null)
function dayEditors(day: string, lessons: AcademicLesson[]) {
  const observed = [
    ...new Set(
      lessons
        .filter((lesson) => lesson.source_type === 'semester_occurrence')
        .map((lesson) => lesson.semester_schedule_id)
        .filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0),
    ),
  ]
  const uncertain =
    !!result.data.value?.meta.truncated ||
    lessons.some(
      (lesson) =>
        lesson.source_type === 'semester_occurrence' &&
        !observed.includes(lesson.semester_schedule_id ?? 0),
    )
  const relevant = semesters.data.value?.filter((semester) => inPeriod(semester, day)) ?? []
  const ids =
    observed.length && !uncertain
      ? observed
      : [...new Set([...observed, ...relevant.map((semester) => semester.id)])]
  const candidates: DayEditor[] = ids.map((id) => {
    const semester = semesters.data.value?.find((semester) => semester.id === id)
    const subjects = [
      ...new Set(
        lessons
          .filter((lesson) => lesson.semester_schedule_id === id)
          .map((lesson) => lesson.subject?.name)
          .filter(Boolean),
      ),
    ]
    return {
      id,
      label: semester
        ? `${semester.group_name} · ${semester.academic_period.name} · ${semester.education_institution.name}`
        : `Розклад із заняттями: ${subjects.join(', ') || 'назва семестру недоступна'}`,
    }
  })
  return {
    candidates,
    direct: !uncertain && candidates.length === 1 ? candidates[0] : null,
    uncertain,
  }
}
const selectedDay = computed(() => days.value.find((day) => day.date === choosingDay.value))
const editorPath = (semesterId: number, day: string) =>
  `/schedule/semesters/${semesterId}/dates/${day}`
const days = computed(() => {
  const value = result.data.value
  if (!value) return []
  return displayDates(value.meta.start_date, value.meta.end_date).map((day) => {
    const lessons = value.data.filter(
      (item) =>
        localDate(item.starts_at, value.meta.timezone) <= day &&
        localEndDate(item.ends_at, value.meta.timezone) >= day,
    )
    return { date: day, lessons, ...dayEditors(day, lessons) }
  })
})
function move(days: number) {
  try {
    const next = addDays(date.value, days)
    if (calendarDate(next)) navigate(next)
  } catch {
    /* Calendar bounds: retain current date. */
  }
}
function navigate(next: string = date.value, mode = week.value) {
  void router.replace({ path: '/schedule', query: { date: next, view: mode ? 'week' : undefined } })
}
</script>
<template>
  <div class="page-workspace page-calendar">
    <header class="page-heading">
      <div>
        <p class="eyebrow">Навчальні заняття</p>
        <h1>Розклад</h1>
        <p class="muted">Усі ваші заняття в одному календарі.</p>
      </div>
      <div class="segmented">
        <button :aria-pressed="!week" @click="navigate(date, false)">День</button>
        <button :aria-pressed="week" @click="navigate(date, true)">Тиждень</button>
      </div>
    </header>
    <p v-if="semesters.data.value" class="semester-week-status" role="status">
      {{ semesterStatus }}
    </p>
    <div class="toolbar">
      <div class="inline">
        <button
          class="button secondary"
          aria-label="Попередній період"
          @click="move(week ? -7 : -1)"
        >
          ←
        </button>
        <label class="sr-only" for="calendar-date">Дата розкладу</label>
        <input
          id="calendar-date"
          type="date"
          :value="date"
          @change="
            calendarDate(($event.target as HTMLInputElement).value) &&
            navigate(($event.target as HTMLInputElement).value)
          "
        />
        <button class="button secondary" aria-label="Наступний період" @click="move(week ? 7 : 1)">
          →
        </button>
      </div>
      <button class="button secondary" @click="navigate(today(auth.user?.timezone ?? 'UTC'))">
        Сьогодні
      </button>
    </div>
    <details class="secondary-disclosure">
      <summary>Керування розкладом та імпорт</summary>
      <div class="actions">
        <RouterLink to="/schedule/semester-calendar">Семестри та щотижневі правила</RouterLink>
        <RouterLink to="/schedule/legacy">Окремі заняття</RouterLink>
        <RouterLink to="/schedule/semester-import">Імпорт семестру з Excel</RouterLink>
      </div>
    </details>
    <LoadingState v-if="result.loading.value" />
    <ErrorState
      v-else-if="result.error.value"
      :error="result.error.value"
      retry
      @retry="result.reload"
    />
    <template v-else-if="result.data.value">
      <p v-if="result.data.value.meta.truncated" role="status" class="warning-notice">
        Показано {{ result.data.value.meta.returned }} із {{ result.data.value.meta.total }} занять.
        Перейдіть до окремого дня або керування джерелами для повного перегляду.
      </p>
      <p class="helper">Часовий пояс: {{ result.data.value.meta.timezone }}</p>
      <div class="calendar-grid" :class="{ 'calendar-week': week }">
        <section v-for="day in days" :key="day.date" class="calendar-day">
          <header class="calendar-day-heading">
            <div class="section-heading">
              <h2 :id="`calendar-day-${day.date}`">{{ calendarLabel(day.date) }}</h2>
              <span class="helper">Занять: {{ day.lessons.length }}</span>
            </div>
            <RouterLink
              v-if="day.direct"
              :to="editorPath(day.direct.id, day.date)"
              class="button secondary day-edit-button"
              :aria-describedby="`calendar-day-${day.date}`"
            >
              <AppIcon name="schedule" />
              Змінити розклад на цей день
            </RouterLink>
            <AppButton
              v-else-if="day.candidates.length || day.uncertain"
              class="day-edit-button"
              :aria-describedby="`calendar-day-${day.date}`"
              @click="choosingDay = day.date"
            >
              <AppIcon name="schedule" />
              Змінити розклад на цей день
            </AppButton>
            <p v-else-if="semesters.loading.value" class="helper" role="status">
              Шукаємо семестр для редагування дня…
            </p>
            <div v-else-if="semesters.error.value" class="helper">
              <p>Не вдалося визначити семестр для редагування цього дня.</p>
              <AppButton :busy="semesters.loading.value" @click="semesters.reload">
                Повторити пошук семестру
              </AppButton>
              <RouterLink
                :to="{ path: '/schedule/semester-calendar', query: { date: day.date } }"
                class="text-link"
              >
                Переглянути семестрові розклади
              </RouterLink>
            </div>
          </header>
          <EmptyState compact v-if="!day.lessons.length" title="Занять немає" />
          <AcademicLessonCard
            v-for="lesson in day.lessons"
            :key="lesson.source_identity"
            :lesson="lesson"
            :timezone="result.data.value.meta.timezone"
            :show-semester-actions="false"
          />
        </section>
      </div>
    </template>
    <AppModal
      v-if="selectedDay"
      :title="`Оберіть семестр · ${calendarLabel(selectedDay.date)}`"
      @close="choosingDay = null"
    >
      <p>
        Оберіть, розклад якого семестру потрібно змінити. Зміни діятимуть лише для вибраного
        семестру та дати.
      </p>
      <p v-if="selectedDay.uncertain" class="schedule-warning">
        Розклад дня неповний або містить заняття без визначеного семестру. Перевірте вибір перед
        редагуванням.
      </p>
      <nav class="day-semester-choices" aria-label="Семестр для редагування дня">
        <RouterLink
          v-for="editor in selectedDay.candidates"
          :key="editor.id"
          :to="editorPath(editor.id, selectedDay.date)"
          class="button secondary"
        >
          {{ editor.label }}
        </RouterLink>
      </nav>
      <p v-if="!selectedDay.candidates.length" class="helper">
        Семестр не вдалося визначити за наявними даними.
      </p>
      <RouterLink
        :to="{ path: '/schedule/semester-calendar', query: { date: selectedDay.date } }"
        class="text-link"
      >
        Переглянути семестри та керування розкладом
      </RouterLink>
    </AppModal>
  </div>
</template>
