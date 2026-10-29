<script setup lang="ts">
import type { Task } from '@/types/api'
import { dateTime, isOverdue } from '@/utils/dates'
import AppButton from '@/components/ui/AppButton.vue'
defineProps<{ task: Task; timezone: string; busy?: boolean; actions?: boolean; subject?: string }>()
defineEmits<{ toggle: []; remove: [] }>()
const priorities = { 1: 'Низький', 2: 'Звичайний', 3: 'Високий' }
</script>
<template>
  <article class="task-row">
    <div class="task-main">
      <div class="inline">
        <span class="badge" :class="task.status === 'completed' ? 'success' : ''">
          {{ task.status === 'completed' ? 'Виконано' : 'До виконання' }}
        </span>
        <span class="badge" :class="task.priority === 3 ? 'warning' : ''">
          {{ priorities[task.priority] }} пріоритет
        </span>
        <span v-if="isOverdue(task.deadline_at, task.status)" class="badge danger">
          Прострочено
        </span>
      </div>
      <h3>
        <RouterLink :to="`/tasks/${task.id}`">{{ task.title }}</RouterLink>
      </h3>
      <p class="helper">
        <span v-if="subject">{{ subject }} ·</span>
        {{ dateTime(task.deadline_at, timezone) }}
        <span v-if="task.estimated_minutes">· {{ task.estimated_minutes }} хв</span>
      </p>
    </div>
    <div v-if="actions" class="task-actions">
      <AppButton :busy="busy" @click="$emit('toggle')">
        {{ task.status === 'completed' ? 'Відновити' : 'Завершити' }}
      </AppButton>
      <RouterLink :to="`/tasks/${task.id}`" class="button secondary">Редагувати</RouterLink>
      <AppButton variant="danger" :disabled="busy" @click="$emit('remove')">Видалити</AppButton>
    </div>
  </article>
</template>
