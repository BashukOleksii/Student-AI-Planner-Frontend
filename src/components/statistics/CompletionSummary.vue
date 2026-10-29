<script setup lang="ts">
import type { CompletionMetrics } from '@/types/statistics'
import { completionLabels } from '@/utils/statistics'
defineProps<{ title: string; metrics: CompletionMetrics }>()
</script>
<template>
  <section>
    <h3>{{ title }}</h3>
    <dl class="report-values">
      <div v-for="(label, key) in completionLabels" :key="key">
        <dt>{{ label }}</dt>
        <dd>{{ metrics[key] }}</dd>
      </div>
    </dl>
  </section>
</template>
