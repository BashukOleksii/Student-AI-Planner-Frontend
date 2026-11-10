<script setup lang="ts">
import { countedOperations, type ImportCounts } from '@/types/semesterSchedule'
import { importOperations } from '@/utils/semesterImport'
defineProps<{ counts: ImportCounts | []; suppressed?: number; blocked?: number }>()
</script>

<template>
  <dl class="import-counters">
    <div v-for="operation in countedOperations" :key="operation">
      <dt>{{ importOperations[operation] }}</dt>
      <dd>{{ Array.isArray(counts) ? 0 : counts[operation] }}</dd>
    </div>
    <div v-if="suppressed !== undefined">
      <dt>Захищені слоти у файлі</dt>
      <dd>{{ suppressed }}</dd>
    </div>
    <div v-if="blocked !== undefined">
      <dt>Рядки з помилками</dt>
      <dd>{{ blocked }}</dd>
    </div>
  </dl>
</template>
