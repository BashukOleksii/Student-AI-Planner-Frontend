<script setup lang="ts">
defineProps<{ taskId?: number | null; subtaskId?: number | null; sessionId?: number | null }>()
</script>
<template>
  <div class="actions target-links">
    <RouterLink v-if="taskId" :to="`/tasks/${taskId}`" class="text-link">
      Завдання №{{ taskId }}
    </RouterLink>
    <RouterLink v-if="subtaskId" to="/tasks" class="text-link">
      Знайти підзавдання №{{ subtaskId }} у завданнях
    </RouterLink>
    <RouterLink v-if="sessionId" :to="`/planning/sessions/${sessionId}`" class="text-link">
      Навчальна сесія №{{ sessionId }}
    </RouterLink>
    <span v-if="!taskId && !subtaskId && !sessionId" class="helper">Без пов’язаного запису</span>
  </div>
  <p v-if="taskId || subtaskId || sessionId" class="helper">
    Пов’язаний запис може бути вже недоступним; історія нагадування чи сповіщення зберігається.
  </p>
</template>
