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
      <div class="inline">
        <span
          class="badge"
          :class="{ success: task.status === 'completed', warning: task.status === 'missed' }"
        >
          {{ taskStatusLabels[task.status] }}
        </span>
        <span class="badge" :class="task.priority === 3 ? 'warning' : ''">
          {{ priorities[task.priority] }} пріоритет
        </span>
        <span v-if="isOverdue(task.deadline_at, task.status)" class="badge danger">
          Прострочено
        </span>
      </div>

      <p class="helper">
        <span v-if="subject">{{ subject }} ·</span>
        {{ task.deadline_at ? `До ${dateTime(task.deadline_at, timezone)}` : 'Без дедлайну' }}
      </p>
    </div>
    <div v-if="actions" class="task-actions">
      <AppButton
        v-if="task.status !== 'completed'"
        :disabled="busy"
        @click="$emit('lifecycle', 'complete')"
      >
        Завершити
      </AppButton>
      <AppButton
        v-if="task.status !== 'pending'"
        :disabled="busy"
        @click="$emit('lifecycle', 'reopen')"
      >
        Повернути до виконання
      </AppButton>
      <RouterLink
        v-if="task.status === 'missed'"
        :to="{ path: '/planning/recovery', query: { task_id: task.id } }"
        class="button secondary"
      >
        Відновити роботу
      </RouterLink>

      <details>
        <summary>Інші дії із завданням</summary>
        <div class="actions">
          <AppButton
            v-if="task.status === 'pending'"
            :disabled="busy"
            @click="$emit('lifecycle', 'miss')"
          >
            Позначити невиконаним
          </AppButton>
          <RouterLink :to="`/tasks/${task.id}`" class="button secondary">Редагувати</RouterLink>
          <AppButton variant="danger" :disabled="busy" @click="$emit('remove')">Видалити</AppButton>
        </div>
      </details>
    </div>
  </article>
</template>
