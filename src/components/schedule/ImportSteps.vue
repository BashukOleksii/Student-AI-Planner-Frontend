<script setup lang="ts">
defineProps<{ stage: 'upload' | 'review' | 'done' }>()
const steps = [
  { key: 'upload', label: 'Період і файл' },
  { key: 'review', label: 'Перевірка змін' },
  { key: 'done', label: 'Збережений розклад' },
] as const
</script>
<template>
  <ol class="workflow-steps" aria-label="Кроки імпорту">
    <li
      v-for="(step, index) in steps"
      :key="step.key"
      :aria-current="stage === step.key ? 'step' : undefined"
    >
      <span aria-hidden="true">{{ index + 1 }}</span>
      {{ step.label }}
    </li>
  </ol>
</template>
