<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { scheduleApi } from '@/api/endpoints'
import { today, addDays, calendarLabel, localDate, localEndDate } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LessonCard from '@/components/domain/LessonCard.vue'
const auth = useAuthStore()
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const date = ref(today(timezone.value))
const mode = ref<'day' | 'week'>(useRoute().query.view === 'week' ? 'week' : 'day')
const useToday = ref(true)
const { data, loading, error, reload } = useResource(
  (signal) =>
    scheduleApi(useToday.value && mode.value === 'day' ? 'today' : mode.value, date.value, signal),
  [date, mode, useToday],
)
const days = computed(() => {
  if (!data.value) return []
  const result: { date: string; lessons: typeof data.value.data }[] = []
  for (
    let day = data.value.meta.start_date;
    day <= data.value.meta.end_date;
    day = addDays(day, 1)
  ) {
    result.push({
      date: day,
      lessons: data.value.data.filter(
        (l) =>
          localDate(l.starts_at, data.value!.meta.timezone) <= day &&
          localEndDate(l.ends_at, data.value!.meta.timezone) >= day,
      ),
    })
  }
  return result
})
function move(direction: number) {
  useToday.value = false
  date.value = addDays(date.value, direction * (mode.value === 'week' ? 7 : 1))
}
function reset() {
  const currentDate = today(timezone.value)
  const unchanged = date.value === currentDate && mode.value === 'day' && useToday.value
  date.value = currentDate
  mode.value = 'day'
  useToday.value = true
  if (unchanged) void reload()
}
function selectDate(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    useToday.value = false
    date.value = value
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <p class="eyebrow">ВАШ НАВЧАЛЬНИЙ ТИЖДЕНЬ</p>
      <h1>Розклад</h1>
      <p class="muted">Заняття у часовому поясі {{ timezone }}</p>
    </div>
    <div class="segmented" aria-label="Режим розкладу">
      <button :aria-pressed="mode === 'day'" @click="mode = 'day'">День</button>
      <button :aria-pressed="mode === 'week'" @click="mode = 'week'">Тиждень</button>
    </div>
  </header>
  <div class="toolbar">
    <div class="inline">
      <AppButton aria-label="Попередній період" @click="move(-1)">←</AppButton>
      <label class="sr-only" for="schedule-date">Дата розкладу</label>
      <input
        id="schedule-date"
        type="date"
        :value="date"
        min="1000-01-01"
        max="9999-12-31"
        @change="selectDate"
      />
      <AppButton aria-label="Наступний період" @click="move(1)">→</AppButton>
    </div>
    <AppButton @click="reset">Сьогодні</AppButton>
  </div>
  <LoadingState v-if="loading" />
  <ErrorState v-else-if="error" :error="error" retry @retry="reload" />
  <template v-else>
    <p v-if="data" class="helper period-label">
      {{ calendarLabel(data.meta.start_date) }}
      <template v-if="data.meta.start_date !== data.meta.end_date">
        — {{ calendarLabel(data.meta.end_date) }}
      </template>
    </p>
    <div class="schedule-days" :class="{ 'week-view': mode === 'week' }">
      <AppCard v-for="day in days" :key="day.date" :title="calendarLabel(day.date)">
        <EmptyState v-if="!day.lessons.length" title="Занять немає" />
        <div v-else class="lesson-list">
          <LessonCard
            v-for="lesson in day.lessons"
            :key="lesson.id"
            :lesson="lesson"
            :timezone="data?.meta.timezone ?? timezone"
          />
        </div>
      </AppCard>
    </div>
  </template>
</template>
