<script setup lang="ts">
import WorkLink from '@/components/planning/WorkLink.vue'
defineProps<{ taskId?: number | null; subtaskId?: number | null; sessionId?: number | null }>()
</script>
<template>
  <div class="actions target-links">
    <WorkLink v-if="taskId" :task-id="taskId" :subtask-id="subtaskId" />
    <RouterLink v-if="subtaskId && !taskId" to="/tasks" class="text-link">
      Знайти навчальний крок у завданнях
    </RouterLink>
    <RouterLink v-if="sessionId" :to="`/planning/sessions/${sessionId}`" class="text-link">
      Переглянути навчальну сесію
    </RouterLink>
    <span v-if="!taskId && !subtaskId && !sessionId" class="helper">Без пов’язаного запису</span>
  </div>
</template>
