<script setup lang="ts">
import type { Reminder } from '@/types/api'
import { exactDateTime } from '@/utils/planning'
import { reminderStatuses, anchorLabels } from '@/utils/reminders'
import TargetLinks from './TargetLinks.vue'
defineProps<{ reminder: Reminder; timezone: string; hideTitle?: boolean }>()
</script>
<template>
  <article class="reminder-card">
    <header class="section-heading">
      <h2 v-if="!hideTitle">
        <RouterLink :to="`/reminders/${reminder.id}`">
          {{ reminder.message ?? 'Нагадування про навчання' }}
        </RouterLink>
      </h2>
      <span
        class="badge"
        :class="{ success: reminder.status === 'sent', warning: reminder.status === 'scheduled' }"
      >
        {{ reminderStatuses[reminder.status] }}
      </span>
    </header>

    <p class="reminder-time">
      {{ reminder.status === 'scheduled' ? 'Нагадаємо:' : 'Запланований час:' }}
      {{ exactDateTime(reminder.trigger_at, timezone) }}
    </p>
    <p v-if="reminder.anchor">
      {{ Math.abs(reminder.offset_minutes ?? 0) }} хв
      {{
        (reminder.offset_minutes ?? 0) < 0
          ? 'до'
          : (reminder.offset_minutes ?? 0) > 0
            ? 'після'
            : 'у час'
      }}
      · {{ anchorLabels[reminder.anchor] }}
    </p>
    <p v-else>На вибрані дату й час</p>
    <p v-if="reminder.sent_at">Надіслано: {{ exactDateTime(reminder.sent_at, timezone) }}</p>
    <TargetLinks
      :task-id="reminder.task_id"
      :subtask-id="reminder.subtask_id"
      :session-id="reminder.study_session_id"
    />
  </article>
</template>
