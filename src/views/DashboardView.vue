<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
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
const schedule = useResource((signal) => scheduleApi('today', date.value, signal))
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
        <p class="helper">До виконання</p>
        <strong class="metric">{{ progress.data.value.data.tasks.current.pending }}</strong>
        <span class="helper">завдань загалом</span>
      </AppCard>
      <AppCard>
        <p class="helper">Виконано цього місяця</p>
        <strong class="metric">
          {{ progress.data.value.data.tasks.completed_in_period.total }}
        </strong>
        <span class="helper">завдань до сьогодні</span>
      </AppCard>
      <AppCard>
        <p class="helper">Прострочені завдання</p>
        <strong class="metric">{{ progress.data.value.data.tasks.current.overdue_pending }}</strong>
        <span class="helper">за даними сервера</span>
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
        <RouterLink to="/schedule" class="text-link">Увесь розклад →</RouterLink>
      </template>
      <LoadingState v-if="schedule.loading.value" />
      <ErrorState
        v-else-if="schedule.error.value"
        :error="schedule.error.value"
        retry
        @retry="schedule.reload"
      />
      <EmptyState
        v-else-if="!schedule.data.value?.data.length"
        title="Сьогодні немає занять"
        description="Ваш день відкритий для самостійного навчання та відпочинку."
      />
      <div v-else class="lesson-list">
        <LessonCard
          v-for="lesson in schedule.data.value.data"
          :key="lesson.id"
          :lesson="lesson"
          :timezone="schedule.data.value.meta.timezone"
        />
      </div>
    </AppCard>
    <AppCard title="Найближчі завдання">
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
  <AppCard title="Ваш навчальний ритм" class="rhythm-card">
    <p class="muted">Розклад дає структуру, а невеликі кроки допомагають рухатися вперед.</p>
    <div class="actions">
      <RouterLink :to="{ path: '/schedule', query: { view: 'week' } }" class="button secondary">
        Переглянути тиждень
      </RouterLink>
      <RouterLink to="/tasks/new" class="button secondary">Додати завдання</RouterLink>
    </div>
  </AppCard>
</template>
