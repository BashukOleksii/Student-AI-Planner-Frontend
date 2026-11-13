<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ProposedSession } from '@/types/planning'
import { calendarLabel, localDate, time } from '@/utils/dates'
import { duration } from '@/utils/planning'
import AppCard from '@/components/ui/AppCard.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
import WorkLink from './WorkLink.vue'

type Session = ProposedSession & { id?: number; study_session_id?: number }
const props = defineProps<{
  sessions: Session[]
  timezone: string
  title: string
  label?: string
  description?: string
}>()
const page = ref(1)
// Preserve the existing session-list page size.
const pageSize = 3
const ordered = computed(() =>
  [...props.sessions].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
)
const groups = computed(() => {
  const dates = new Map<string, Session[]>()
  for (const session of ordered.value.slice((page.value - 1) * pageSize, page.value * pageSize)) {
    const date = localDate(session.starts_at, props.timezone)
    if (!dates.has(date)) dates.set(date, [])
    dates.get(date)!.push(session)
  }
  return [...dates].map(([date, sessions]) => ({ date, sessions }))
})
watch(
  () => props.sessions,
  () => {
    page.value = 1
  },
)
const sessionId = (session: Session) => session.study_session_id ?? session.id
function endLabel(session: Session) {
  return localDate(session.starts_at, props.timezone) === localDate(session.ends_at, props.timezone)
    ? time(session.ends_at, props.timezone)
    : `${time(session.ends_at, props.timezone)} (${calendarLabel(localDate(session.ends_at, props.timezone))})`
}
</script>
<template>
  <AppCard v-if="sessions.length" :title="title" class="recovery-session-list" :aria-label="title">
    <template v-if="label" #action>
      <span class="badge">{{ label }}: {{ sessions.length }}</span>
    </template>
    <p v-if="description" class="helper recovery-session-description">{{ description }}</p>
    <section v-for="group in groups" :key="group.date" class="recovery-date-group">
      <h3>
        <time :datetime="group.date">{{ calendarLabel(group.date) }}</time>
      </h3>
      <div class="recovery-session-rows">
        <article
          v-for="(session, index) in group.sessions"
          :key="sessionId(session) ?? `${session.starts_at}:${index}`"
          class="recovery-session-row"
        >
          <WorkLink :task-id="session.task_id" :subtask-id="session.subtask_id" />
          <span class="recovery-session-time">
            <time :datetime="session.starts_at">{{ time(session.starts_at, timezone) }}</time>
            — {{ endLabel(session) }}
          </span>
          <span class="helper">{{ duration(session.duration_seconds) }}</span>
          <RouterLink v-if="sessionId(session)" :to="`/planning/sessions/${sessionId(session)}`">
            Відкрити сесію
          </RouterLink>
        </article>
      </div>
    </section>
    <PageNavigation
      v-if="sessions.length > pageSize"
      compact
      :current="page"
      :last="Math.ceil(sessions.length / pageSize)"
      :total="sessions.length"
      :aria-label="title"
      @page="page = $event"
    />
  </AppCard>
</template>
<style scoped>
.recovery-session-description {
  margin-bottom: 16px;
}
.recovery-date-group + .recovery-date-group {
  margin-top: 18px;
}
.recovery-date-group h3 {
  margin-bottom: 8px;
  font-size: 14px;
}
.recovery-session-rows {
  display: grid;
  gap: 8px;
}
.recovery-session-row {
  display: flex;
  align-items: baseline;
  gap: 8px 16px;
  flex-wrap: wrap;
  background: var(--subtle);
  border-radius: var(--radius-sm);
  padding: 12px;
}
.recovery-session-row > .text-link {
  flex: 1;
  min-width: 140px;
}
.recovery-session-time {
  font-variant-numeric: tabular-nums;
}
.recovery-session-row > a:last-child:not(.text-link) {
  font-size: 12px;
}
@media (max-width: 600px) {
  .recovery-session-row > .text-link {
    flex-basis: 100%;
  }
}
</style>
