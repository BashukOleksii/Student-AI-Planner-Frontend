<script setup lang="ts">
import type { ActivityMetrics } from '@/types/statistics'
import CompletionSummary from './CompletionSummary.vue'
import SessionSummary from './SessionSummary.vue'
defineProps<{ metrics: ActivityMetrics }>()
</script>
<template>
  <div class="form-grid">
    <CompletionSummary title="Завершення завдань" :metrics="metrics.tasks_completed" />
    <CompletionSummary title="Завершення підзавдань" :metrics="metrics.subtasks_completed" />
  </div>
  <SessionSummary :metrics="metrics.study_sessions" />
</template>
