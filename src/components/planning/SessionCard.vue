<script setup lang="ts">
import type { StudySession } from '@/types/api'
import { dateTime, time } from '@/utils/dates'
import { useWorkName } from '@/composables/useWorkLabels'
import { duration, sessionStatuses, exactDateTime } from '@/utils/planning'
const props = defineProps<{
  session: StudySession
  timezone: string
  statusColors?: boolean
  compact?: boolean
}>()
const name = useWorkName(
  () => props.session.task_id,
  () => props.session.subtask_id,
)
</script>
<template>
  <article
    class="session-card"
    :class="statusColors ? ['session-status-colors', `session-status-${session.status}`] : []"
  >
    <header class="section-heading">
      <span v-if="compact" class="session-title">{{ name }}</span>
      <RouterLink v-else :to="`/planning/sessions/${session.id}`" class="session-title">
        {{ name }}
      </RouterLink>
      <span class="badge">{{ sessionStatuses[session.status] }}</span>
    </header>
    <p class="session-when">
      {{ dateTime(session.starts_at, timezone) }} — {{ time(session.ends_at, timezone) }}
    </p>
    <p>
      {{ duration(session.duration_seconds) }}
      <template v-if="!compact">
        ·
        <RouterLink :to="`/tasks/${session.task_id}`">Відкрити завдання</RouterLink>
        <span v-if="session.subtask_id" class="helper">· Навчальний крок</span>
      </template>
    </p>
    <p v-if="session.actual_minutes !== null">Фактично: {{ session.actual_minutes }} хв</p>
    <details v-if="session.completed_at && !compact" class="context-help">
      <summary>Коли завершено</summary>
      <p class="helper">{{ exactDateTime(session.completed_at, timezone) }}</p>
    </details>
  </article>
</template>

<style scoped>
.session-status-colors {
  --session-color: var(--text-secondary);
  --session-bg: var(--subtle);
  border-left-color: var(--session-color);
}
.session-status-planned {
  --session-color: var(--info);
  --session-bg: var(--info-bg);
}
.session-status-completed {
  --session-color: var(--success);
  --session-bg: var(--success-bg);
}
.session-status-missed {
  --session-color: var(--warning);
  --session-bg: var(--warning-bg);
}
.session-status-rescheduled {
  --session-color: #68518b;
  --session-bg: #f0ebf7;
}
:global(:root[data-theme='dark']) .session-status-rescheduled {
  --session-color: #c7b5e6;
  --session-bg: #383044;
}
.session-status-colors .badge {
  color: var(--session-color);
  background: var(--session-bg);
}
</style>
