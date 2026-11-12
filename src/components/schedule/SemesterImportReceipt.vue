<script setup lang="ts">
import type { ImportReceipt } from '@/types/semesterSchedule'
import { dateTime } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
defineProps<{ receipt: ImportReceipt; timezone: string }>()
</script>
<template>
  <AppCard title="Розклад успішно імпортовано" class="semester-import-success" role="status">
    <p class="helper">
      Застосовано
      <time :datetime="receipt.committed_at">{{ dateTime(receipt.committed_at, timezone) }}</time>
    </p>
    <p class="helper">
      Створено занять: {{ receipt.counts.create }} · Оновлено: {{ receipt.counts.update }} · Без
      змін: {{ receipt.counts.noop }}
    </p>
  </AppCard>
</template>
