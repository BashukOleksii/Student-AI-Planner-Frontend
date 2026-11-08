<script setup lang="ts">
import { computed } from 'vue'
import { workloadRecommendation } from '@/utils/workload'
const props = defineProps<{ codes: string[]; taskId: number }>()
const recommendations = computed(() =>
  props.codes.map((code) => ({ code, ...workloadRecommendation(code, props.taskId) })),
)
</script>
<template>
  <ul v-if="codes.length" class="workload-recommendations" aria-label="Поради для перегляду">
    <li v-for="(advice, index) in recommendations" :key="index">
      <RouterLink v-if="advice.to" :to="advice.to">
        {{ advice.label }}
      </RouterLink>
      <span v-else>{{ advice.label }}</span>
      <small class="helper">({{ advice.code }})</small>
    </li>
  </ul>
</template>
