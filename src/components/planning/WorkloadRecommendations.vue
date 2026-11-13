<script setup lang="ts">
import { computed } from 'vue'
import { workloadRecommendation } from '@/utils/workload'
const props = defineProps<{ codes: string[]; taskId: number; subtaskId?: number | null }>()
const recommendations = computed(() =>
  props.codes.map((code) => ({
    code,
    ...workloadRecommendation(code, props.taskId, props.subtaskId),
  })),
)
</script>
<template>
  <ul v-if="codes.length" class="workload-recommendations" aria-label="Поради для перегляду">
    <li v-for="(advice, index) in recommendations" :key="index">
      <RouterLink v-if="advice.to" :to="advice.to">
        {{ advice.label }}
      </RouterLink>
      <span v-else>{{ advice.label }}</span>
    </li>
  </ul>
</template>
<style scoped>
.workload-recommendations li > a {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding-block: 0.25rem;
}
.workload-recommendations .tool-metadata {
  margin-block: 0.25rem 0.5rem;
}
</style>
