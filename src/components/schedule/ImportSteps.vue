<script setup lang="ts">
import WorkflowSteps from '@/components/ui/WorkflowSteps.vue'
defineProps<{ stage: 'upload' | 'review' | 'done' }>()
const steps = ['Період і файл', 'Перевірка змін', 'Збережений розклад'] as const
const stages = { upload: 0, review: 1, done: 2 } as const
</script>
<template>
  <WorkflowSteps :steps="steps" :current="stages[stage]" label="Кроки імпорту" />
</template>
