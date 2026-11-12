<script setup lang="ts">
import { useWorkName } from '@/composables/useWorkLabels'
const props = defineProps<{ taskId?: number | null; subtaskId?: number | null }>()
const name = useWorkName(
  () => props.taskId,
  () => props.subtaskId,
)
</script>
<template>
  <RouterLink v-if="taskId" :to="`/tasks/${taskId}`" class="text-link">{{ name }}</RouterLink>
  <span v-else>{{ name }}</span>
</template>
