<script setup lang="ts">
import { computed } from 'vue'
import { useSemesterSelection } from '@/stores/semesterSelection'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { inPeriod, plannerSourceNotice } from '@/utils/semesterSchedule'
import SemesterSelector from '@/components/schedule/SemesterSelector.vue'
import SemesterOccurrenceCard from '@/components/schedule/SemesterOccurrenceCard.vue'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import SessionCard from '@/components/planning/SessionCard.vue'
import { studySessionsApi } from '@/api/studySessions'
import { addDays } from '@/utils/dates'
import { scheduleApi, tasksApi, progressApi } from '@/api/endpoints'
import { today, monthStart, calendarLabel } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LessonCard from '@/components/domain/LessonCard.vue'
import TaskCard from '@/components/domain/TaskCard.vue'
const auth = useAuthStore()
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const date = computed(() => today(timezone.value))
const preference = useSemesterSelection()
const semesters = useResource(semesterSchedulesApi.list)
const current = computed(
  () => semesters.data.value?.filter((item) => inPeriod(item, date.value)) ?? [],
)
const selected = computed({
  get: () =>
    semesters.data.value?.find((item) => item.id === preference.selected)?.id ??
    (current.value.length === 1 ? current.value[0]!.id : null),
  set: (id) => {
    preference.selected = id
  },
})
const semester = computed(() => semesters.data.value?.find((item) => item.id === selected.value))
const useLegacy = computed(() => !!semesters.data.value && !selected.value && !current.value.length)
const schedule = useResource(
  (signal) => (useLegacy.value ? scheduleApi('today', date.value, signal) : Promise.resolve(null)),
  [useLegacy, date],
)
const semesterToday = useResource(
  async (signal) => {
    const id = selected.value
    if (!id) return null
    const [occurrences, rules] = await Promise.all([
      semesterSchedulesApi.occurrences(id, 'date', date.value, signal),
      semesterSchedulesApi.rules(id, signal),
    ])
    return {
      occurrences,
      patterns: new Map(rules.data.map((rule) => [rule.id, rule.week_pattern])),
    }
  },
  [selected, date],
)
const scheduleLink = computed(() => ({
  path: useLegacy.value ? '/schedule/legacy' : '/schedule',
  query: { semester: selected.value ? String(selected.value) : undefined },
}))
const weekLink = computed(() => ({
  ...scheduleLink.value,
  query: { ...scheduleLink.value.query, view: 'week' },
}))

const sessions = useResource(
  (signal) =>
    studySessionsApi.list({ start_date: date.value, end_date: addDays(date.value, 6) }, signal),
  [date],
)
const upcoming = computed(
  () =>
    sessions.data.value?.data
      .filter((s) => s.status === 'planned' && Date.parse(s.ends_at) > Date.now())
      .slice(0, 4) ?? [],
)
const tasks = useResource((signal) => tasksApi.list({ status: 'pending', per_page: 5 }, signal))
const progress = useResource((signal) => progressApi(monthStart(date.value), date.value, signal))
</script>
<template>
  <header class="page-heading">
    <div>
      <p class="eyebrow">{{ calendarLabel(date) }}</p>
      <h1>Вітаємо, {{ auth.user?.name }}!</h1>
      <p class="muted">Зосередьтеся на тому, що важливо сьогодні.</p>
    </div>
    <RouterLink to="/tasks/new" class="button primary">+ Створити завдання</RouterLink>
  </header>
  <LoadingState v-if="progress.loading.value" />
  <ErrorState
    v-else-if="progress.error.value"
    :error="progress.error.value"
    retry
    @retry="progress.reload"
  />
  <template v-else-if="progress.data.value">
    <div class="summary-grid">
      <AppCard>
        <p class="helper">Очікує виконання</p>
        <strong class="metric">{{ progress.data.value.data.tasks.current.pending }}</strong>
        <span class="helper">лише зі статусом «Очікує виконання»</span>
      </AppCard>
      <AppCard>
        <p class="helper">Виконано цього місяця</p>
        <strong class="metric">
          {{ progress.data.value.data.tasks.completed_in_period.total }}
        </strong>
        <span class="helper">завдань до сьогодні</span>
      </AppCard>
      <AppCard>
        <p class="helper">Прострочені серед тих, що очікують виконання</p>
        <strong class="metric">{{ progress.data.value.data.tasks.current.overdue_pending }}</strong>
        <span class="helper">без статусу «Не виконано»; повні дані — у статистиці</span>
      </AppCard>
    </div>
    <p
      v-if="
        !progress.data.value.data.tasks.current.total &&
        !progress.data.value.data.study_sessions.started_in_period.completed.count
      "
      class="helper statistics-note"
    >
      Статистики ще немає. Почніть зі свого першого завдання.
    </p>
  </template>
  <div class="dashboard-grid">
    <AppCard title="Сьогодні в розкладі">
      <template #action>
        <RouterLink :to="scheduleLink" class="text-link">Увесь розклад →</RouterLink>
      </template>
      <LoadingState v-if="semesters.loading.value" />
      <ErrorState
        v-else-if="semesters.error.value"
        :error="semesters.error.value"
        retry
        @retry="semesters.reload"
      />
      <template v-else>
        <SemesterSelector
          v-if="
            (semesters.data.value?.length ?? 0) > 1 || (useLegacy && semesters.data.value?.length)
          "
          v-model="selected"
          :schedules="semesters.data.value ?? []"
        />
        <template v-if="semester">
          <p class="helper">
            Семестровий розклад · {{ semester.academic_period.name }} · {{ semester.group_name }}
          </p>
          <p class="helper">{{ plannerSourceNotice }}</p>
          <LoadingState v-if="semesterToday.loading.value" />
          <ErrorState
            v-else-if="semesterToday.error.value"
            :error="semesterToday.error.value"
            retry
            @retry="semesterToday.reload"
          />
          <EmptyState
            v-else-if="!inPeriod(semester, date)"
            title="Сьогодні поза межами цього семестру"
          />
          <EmptyState
            v-else-if="!semesterToday.data.value?.occurrences.data.length"
            title="Сьогодні немає занять"
          />
          <div v-else class="lesson-list">
            <SemesterOccurrenceCard
              v-for="item in semesterToday.data.value.occurrences.data"
              :key="item.occurrence_id"
              :occurrence="item"
              :schedule-id="semester.id"
              :timezone="semesterToday.data.value.occurrences.meta.timezone"
              :pattern="
                item.weekly_lesson_rule_id
                  ? semesterToday.data.value.patterns.get(item.weekly_lesson_rule_id)
                  : undefined
              "
            />
          </div>
        </template>
        <template v-else-if="useLegacy">
          <p class="helper">Старий розклад · датовані заняття</p>
          <LoadingState v-if="schedule.loading.value" />
          <ErrorState
            v-else-if="schedule.error.value"
            :error="schedule.error.value"
            retry
            @retry="schedule.reload"
          />
          <EmptyState v-else-if="!schedule.data.value?.data.length" title="Сьогодні немає занять" />
          <div v-else class="lesson-list">
            <LessonCard
              v-for="lesson in schedule.data.value.data"
              :key="lesson.id"
              :lesson="lesson"
              :timezone="schedule.data.value.meta.timezone"
            />
          </div>
        </template>
        <EmptyState v-else title="Оберіть семестр для перегляду занять" />
      </template>
    </AppCard>
    <AppCard title="Найближчі завдання">
      <p class="helper">
        Лише статус «Очікує виконання». Невиконану роботу також переглядайте у списку завдань.
      </p>
      <template #action><RouterLink to="/tasks" class="text-link">Усі →</RouterLink></template>
      <LoadingState v-if="tasks.loading.value" />
      <ErrorState
        v-else-if="tasks.error.value"
        :error="tasks.error.value"
        retry
        @retry="tasks.reload"
      />
      <EmptyState
        v-else-if="!tasks.data.value?.data.length"
        title="Немає відкритих завдань"
        description="Додайте завдання, коли будете готові."
      />
      <TaskCard
        v-for="task in tasks.data.value?.data"
        v-else
        :key="task.id"
        :task="task"
        :timezone="timezone"
      />
    </AppCard>
  </div>
  <AppCard title="Найближчі навчальні сесії">
    <template #action>
      <RouterLink to="/planning/sessions" class="text-link">Усі сесії →</RouterLink>
    </template>
    <LoadingState v-if="sessions.loading.value" />
    <ErrorState
      v-else-if="sessions.error.value"
      :error="sessions.error.value"
      retry
      @retry="sessions.reload"
    />
    <EmptyState v-else-if="!upcoming.length" title="Майбутніх сесій цього тижня немає" />
    <SessionCard
      v-for="session in upcoming"
      :key="session.id"
      :session="session"
      :timezone="sessions.data.value?.meta.timezone ?? timezone"
    />
  </AppCard>
  <AppCard title="Активність і сповіщення">
    <div class="actions">
      <RouterLink to="/statistics" class="button secondary">Повна статистика</RouterLink>
      <RouterLink to="/inbox" class="button secondary">Вхідні сповіщення</RouterLink>
      <RouterLink to="/reminders" class="button secondary">Усі нагадування</RouterLink>
    </div>
    <p class="helper">
      Inbox показує доставлені сервером записи. Відкриття цієї сторінки не запускає доставку.
    </p>
  </AppCard>
  <AppCard title="Ваш навчальний ритм" class="rhythm-card">
    <p class="muted">Розклад дає структуру, а невеликі кроки допомагають рухатися вперед.</p>
    <div class="actions">
      <RouterLink :to="weekLink" class="button secondary">Переглянути тиждень</RouterLink>
      <RouterLink to="/tasks/new" class="button secondary">Додати завдання</RouterLink>
    </div>
  </AppCard>
</template>
