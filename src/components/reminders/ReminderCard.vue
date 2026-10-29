<script setup lang="ts">
import type { Reminder } from '@/types/api'
import { exactDateTime } from '@/utils/planning'
import { reminderStatuses, anchorLabels } from '@/utils/reminders'
import TargetLinks from './TargetLinks.vue'
defineProps<{ reminder: Reminder; timezone: string }>()
</script>
<template>
  <article class="reminder-card">
    <header class="section-heading">
      <h2>
        <RouterLink :to="`/reminders/${reminder.id}`">Нагадування №{{ reminder.id }}</RouterLink>
      </h2>
      <span class="badge">{{ reminderStatuses[reminder.status] }}</span>
    </header>
    <p class="reminder-message">{{ reminder.message ?? 'Повідомлення для пов’язаної роботи' }}</p>
    <p>Час спрацювання: {{ exactDateTime(reminder.trigger_at, timezone) }}</p>
    <p v-if="reminder.anchor">
      Відносне · {{ anchorLabels[reminder.anchor] }} · зміщення {{ reminder.offset_minutes }} хв
    </p>
    <p v-else>Абсолютна дата й час</p>
    <p v-if="reminder.sent_at">Надіслано: {{ exactDateTime(reminder.sent_at, timezone) }}</p>
    <TargetLinks
      :task-id="reminder.task_id"
      :subtask-id="reminder.subtask_id"
      :session-id="reminder.study_session_id"
    />
  </article>
</template>
