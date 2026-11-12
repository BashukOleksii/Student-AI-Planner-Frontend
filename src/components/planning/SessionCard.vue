<script setup lang="ts">
import type { StudySession } from '@/types/api'
import { dateTime, time } from '@/utils/dates'
import { useWorkName } from '@/composables/useWorkLabels'
import { exactDateTime, duration, sessionStatuses } from '@/utils/planning'
const props = defineProps<{ session: StudySession; timezone: string }>()
const name = useWorkName(
  () => props.session.task_id,
  () => props.session.subtask_id,
)
</script>
<template>
  <article class="session-card">
    <header class="section-heading">
      <RouterLink :to="`/planning/sessions/${session.id}`" class="text-link">
        {{ name }}
      </RouterLink>
      <span class="badge">{{ sessionStatuses[session.status] }}</span>
    </header>
    <p class="session-when">
      {{ dateTime(session.starts_at, timezone) }} — {{ time(session.ends_at, timezone) }}
    </p>
    <p>
      {{ duration(session.duration_seconds) }} ·
      <RouterLink :to="`/tasks/${session.task_id}`">Відкрити завдання</RouterLink>
      <span v-if="session.subtask_id" class="helper">· Навчальний крок</span>
    </p>
    <p v-if="session.actual_minutes !== null">Фактично: {{ session.actual_minutes }} хв</p>
    <p v-if="session.completed_at" class="helper">
      Завершено: {{ exactDateTime(session.completed_at, timezone) }}
    </p>
  </article>
</template>
