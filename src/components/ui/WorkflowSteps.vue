<script setup lang="ts">
defineProps<{ steps: readonly string[]; current: number; label: string }>()
</script>
<template>
  <ol class="workflow-steps" :aria-label="label">
    <li
      v-for="(step, index) in steps"
      :key="step"
      :aria-current="current === index ? 'step' : undefined"
      :class="{ 'step-complete': index < current }"
    >
      <span aria-hidden="true">{{ index < current ? '✓' : index + 1 }}</span>
      {{ step }}
    </li>
  </ol>
</template>
