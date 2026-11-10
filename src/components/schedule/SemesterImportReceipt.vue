<script setup lang="ts">
import type { ImportReceipt } from '@/types/semesterSchedule'
import { dateTime } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import SemesterImportCounts from './SemesterImportCounts.vue'
defineProps<{ receipt: ImportReceipt; importId: number; timezone: string }>()
</script>
<template>
  <AppCard title="Збережена квитанція імпорту">
    <p>Пакет №{{ importId }} · семестр №{{ receipt.semester_schedule_id }}</p>
    <p>
      Застосовано
      <time :datetime="receipt.committed_at">{{ dateTime(receipt.committed_at, timezone) }}</time>
      ({{ timezone }})
    </p>
    <SemesterImportCounts :counts="receipt.counts" />
    <p class="helper">
      Правила на момент застосування ·
      {{ receipt.rule_ids.length ? receipt.rule_ids.join(', ') : 'немає' }}
    </p>
    <slot />
  </AppCard>
</template>
