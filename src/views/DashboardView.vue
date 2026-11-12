<script setup lang="ts">
import { useWorkLabels } from '@/composables/useWorkLabels'
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { academicCalendarApi } from '@/api/academicCalendar'
import { recoveryApi } from '@/api/recovery'
import { tasksApi } from '@/api/endpoints'
import { studySessionsApi } from '@/api/studySessions'
import { today, addDays, calendarLabel } from '@/utils/dates'
import AcademicLessonCard from '@/components/schedule/AcademicLessonCard.vue'
import TaskCard from '@/components/domain/TaskCard.vue'
import SessionCard from '@/components/planning/SessionCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
const auth = useAuthStore()
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const date = computed(() => today(timezone.value))
const calendar = useResource(academicCalendarApi.today, [date])
const tasks = useResource((signal) => tasksApi.list({ status: 'pending', per_page: 5 }, signal))
const sessions = useResource(
  (signal) =>
    studySessionsApi.list({ start_date: date.value, end_date: addDays(date.value, 6) }, signal),
  [date],
)
const recovery = useResource((signal) => recoveryApi.list('pending', 1, signal))
const upcoming = computed(
  () =>
    sessions.data.value?.data
      .filter((s) => s.status === 'planned' && Date.parse(s.ends_at) > Date.now())
      .slice(0, 3) ?? [],
)
const lessons = computed(
  () =>
    calendar.data.value?.data.filter((s) => Date.parse(s.ends_at) > Date.now()).slice(0, 3) ?? [],
)
useWorkLabels(() => [sessions.data.value, tasks.data.value])
</script>
<template>
  <header class="page-heading">
    <div>
      <p class="eyebrow">{{ calendarLabel(date) }}</p>
      <h1>Ваш день, {{ auth.user?.name }}</h1>
      <p class="muted">Заняття, важливі завдання та час для навчання.</p>
    </div>
    <RouterLink to="/tasks/new" class="button primary">Додати завдання</RouterLink>
  </header>
  <dl class="content-overview" aria-label="Ваші найближчі справи">
    <div>
      <dt>Занять попереду сьогодні</dt>
      <dd>
        {{ calendar.loading.value ? '…' : calendar.error.value ? '—' : lessons.length }}
        <small v-if="lessons.length === 3">найближчі</small>
      </dd>
    </div>
    <div>
      <dt>Відкритих завдань</dt>
      <dd>
        {{
          tasks.loading.value
            ? '…'
            : tasks.error.value
              ? '—'
              : (tasks.data.value?.meta.total ?? '—')
        }}
      </dd>
    </div>
    <div>
      <dt>Сесій попереду цього тижня</dt>
      <dd>
        {{ sessions.loading.value ? '…' : sessions.error.value ? '—' : upcoming.length }}
        <small v-if="upcoming.length === 3">найближчі</small>
      </dd>
    </div>
  </dl>
  <section class="daily-attention">
    <ErrorState
      v-if="recovery.error.value"
      :error="recovery.error.value"
      retry
      @retry="recovery.reload"
    />
    <RouterLink
      v-else-if="recovery.data.value?.data.length"
      to="/planning/suggestions"
      class="attention-link"
    >
      <strong>Є пропозиції, що потребують вашої уваги</strong>
      <span>Переглянути зміни перед рішенням →</span>
    </RouterLink>
  </section>
  <div class="dashboard-grid">
    <AppCard title="Найближчі заняття">
      <template #action><RouterLink to="/schedule">Розклад →</RouterLink></template>
      <LoadingState v-if="calendar.loading.value" />
      <ErrorState
        v-else-if="calendar.error.value"
        :error="calendar.error.value"
        retry
        @retry="calendar.reload"
      />
      <template v-else>
        <EmptyState v-if="!lessons.length" title="На сьогодні занять більше немає" />
        <AcademicLessonCard
          v-for="lesson in lessons"
          :key="lesson.source_identity"
          :lesson="lesson"
          :timezone="calendar.data.value?.meta.timezone ?? timezone"
        />
        <p v-if="calendar.data.value?.meta.truncated" role="status">
          Розклад неповний. Перевірте календар.
        </p>
      </template>
    </AppCard>
    <AppCard title="Відкриті завдання">
      <template #action><RouterLink to="/tasks">Усі завдання →</RouterLink></template>
      <LoadingState v-if="tasks.loading.value" />
      <ErrorState
        v-else-if="tasks.error.value"
        :error="tasks.error.value"
        retry
        @retry="tasks.reload"
      />
      <template v-else>
        <EmptyState
          v-if="!tasks.data.value?.data.length"
          title="Почніть із першого завдання"
          description="Додайте дедлайн та приблизну тривалість — це допоможе скласти навчальний план."
        />
        <TaskCard
          v-for="task in tasks.data.value?.data"
          :key="task.id"
          :task="task"
          :timezone="timezone"
        />
      </template>
    </AppCard>
  </div>
  <AppCard title="Час для самостійного навчання">
    <template #action><RouterLink to="/planning">Мій план →</RouterLink></template>
    <LoadingState v-if="sessions.loading.value" />
    <ErrorState
      v-else-if="sessions.error.value"
      :error="sessions.error.value"
      retry
      @retry="sessions.reload"
    />
    <template v-else>
      <EmptyState v-if="!upcoming.length" title="Майбутніх сесій цього тижня немає" />
      <SessionCard
        v-for="session in upcoming"
        :key="session.id"
        class="dashboard-session"
        :session="session"
        :timezone="sessions.data.value?.meta.timezone ?? timezone"
      />
    </template>
    <RouterLink v-if="!upcoming.length" to="/planning/preview" class="text-link">
      Запланувати навчання →
    </RouterLink>
  </AppCard>
  <div class="actions">
    <RouterLink to="/ai" class="button secondary">Попросити AI про допомогу</RouterLink>
    <RouterLink to="/academic">Налаштувати навчальні предмети</RouterLink>
  </div>
</template>

<style scoped>
.dashboard-session {
  display: grid;
  gap: 8px;
  padding-block: 0;
  border-bottom: 0;
}
.dashboard-session + .dashboard-session {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.dashboard-session :deep(.section-heading) {
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 0;
}
.dashboard-session :deep(.section-heading > .text-link) {
  flex: 1 1 12rem;
  min-width: 0;
}
.dashboard-session :deep(.badge) {
  flex-shrink: 0;
}
.dashboard-session :deep(p) {
  margin-block: 0;
}
</style>
