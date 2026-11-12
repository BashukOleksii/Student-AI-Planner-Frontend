<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { academicCalendarApi } from '@/api/academicCalendar'
import { today, addDays, calendarLabel, localDate, localEndDate } from '@/utils/dates'
import { calendarDate, displayDates } from '@/utils/semesterSchedule'
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
const days = computed(() => {
  const value = result.data.value
  if (!value) return []
  return displayDates(value.meta.start_date, value.meta.end_date).map((day) => ({
    date: day,
    lessons: value.data.filter(
      (item) =>
        localDate(item.starts_at, value.meta.timezone) <= day &&
        localEndDate(item.ends_at, value.meta.timezone) >= day,
    ),
  }))
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
  <div class="toolbar">
    <div class="inline">
      <button class="button secondary" aria-label="Попередній період" @click="move(week ? -7 : -1)">
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
      <RouterLink to="/schedule/import">Імпорт датованих занять</RouterLink>
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
        <div class="section-heading">
          <h2>{{ calendarLabel(day.date) }}</h2>
          <span class="helper">Занять: {{ day.lessons.length }}</span>
        </div>
        <EmptyState compact v-if="!day.lessons.length" title="Занять немає" />
        <AcademicLessonCard
          v-for="lesson in day.lessons"
          :key="lesson.source_identity"
          :lesson="lesson"
          :timezone="result.data.value.meta.timezone"
        />
      </section>
    </div>
  </template>
</template>
