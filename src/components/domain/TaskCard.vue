<script setup lang="ts">
import type { Task, TaskLifecycleAction } from '@/types/api'
import { dateTime, isOverdue } from '@/utils/dates'
import { taskStatusLabels } from '@/utils/tasks'
import AppButton from '@/components/ui/AppButton.vue'
defineProps<{ task: Task; timezone: string; busy?: boolean; actions?: boolean; subject?: string }>()
defineEmits<{ lifecycle: [action: TaskLifecycleAction]; remove: [] }>()
const priorities = { 1: 'Низький', 2: 'Звичайний', 3: 'Високий' }
</script>
<template>
  <article
    class="task-row"
    :class="[`task-${task.status}`, { 'task-overdue': isOverdue(task.deadline_at, task.status) }]"
  >
    <div class="task-main">
      <h3>
        <RouterLink :to="`/tasks/${task.id}`">{{ task.title }}</RouterLink>
      </h3>
      <p class="task-deadline" :class="{ 'field-error': isOverdue(task.deadline_at, task.status) }">
        {{ task.deadline_at ? `До ${dateTime(task.deadline_at, timezone)}` : 'Без дедлайну' }}
      </p>
      <div class="inline">
        <span
          class="badge"
          :class="{ success: task.status === 'completed', warning: task.status === 'missed' }"
        >
          {{ taskStatusLabels[task.status] ?? 'Стан не визначено' }}
        </span>
        <span class="badge" :class="task.priority === 3 ? 'warning' : ''">
          {{ priorities[task.priority] }} пріоритет
        </span>
        <span v-if="isOverdue(task.deadline_at, task.status)" class="badge danger">
          Прострочено
        </span>
      </div>

      <p class="helper">
        <span v-if="subject">{{ subject }}</span>
      </p>
    </div>
    <div v-if="actions" class="task-actions">
      <AppButton
        v-if="task.status !== 'completed'"
        variant="primary"
        :disabled="busy"
        @click="$emit('lifecycle', 'complete')"
      >
        Завершити
      </AppButton>
      <RouterLink
        v-if="task.status === 'completed'"
        :to="`/tasks/${task.id}`"
        class="button secondary"
      >
        Переглянути
      </RouterLink>
      <AppButton :disabled="busy" @click="$emit('remove')">Видалити</AppButton>
      <slot name="completion" />
    </div>
  </article>
</template>

<style scoped>
@media (min-width: 768px) {
  .task-actions:has(.completion-prompt) {
    flex-basis: 380px;
  }
}
</style>
