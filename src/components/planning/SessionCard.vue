<script setup lang="ts">
import type { StudySession } from '@/types/api'
import { exactDateTime, duration, sessionStatuses } from '@/utils/planning'
defineProps<{ session: StudySession; timezone: string }>()
</script>
<template>
  <article class="session-card">
    <header class="section-heading">
      <RouterLink :to="`/planning/sessions/${session.id}`" class="text-link">
        Сесія №{{ session.id }}
      </RouterLink>
      <span class="badge">{{ sessionStatuses[session.status] }}</span>
    </header>
    <p>
      {{ exactDateTime(session.starts_at, timezone) }} —
      {{ exactDateTime(session.ends_at, timezone) }}
    </p>
    <p>
      {{ duration(session.duration_seconds) }} ·
      <RouterLink :to="`/tasks/${session.task_id}`">Завдання №{{ session.task_id }}</RouterLink>
      <template v-if="session.subtask_id">· Підзавдання №{{ session.subtask_id }}</template>
    </p>
    <p v-if="session.actual_minutes !== null">Фактично: {{ session.actual_minutes }} хв</p>
    <p v-if="session.completed_at" class="helper">
      Завершено: {{ exactDateTime(session.completed_at, timezone) }}
    </p>
  </article>
</template>
