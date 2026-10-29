<script setup lang="ts">
import type { ScheduleImportBatch } from '@/types/scheduleImport'
import type { AcademicPeriod } from '@/types/api'
import { importStatuses } from '@/utils/scheduleImport'
import { exactDateTime } from '@/utils/planning'
defineProps<{ batch: ScheduleImportBatch; period?: AcademicPeriod; timezone: string }>()
</script>
<template>
  <div class="import-summary">
    <div class="section-heading">
      <h2>Пакет №{{ batch.id }}</h2>
      <span class="badge">{{ importStatuses[batch.status] }}</span>
    </div>
    <p>
      <strong>Файл:</strong>
      {{ batch.original_filename }}
    </p>
    <p>
      <strong>Навчальний період:</strong>
      {{ period?.name ?? `№${batch.academic_period_id}` }}
      <template v-if="period">· {{ period.starts_on }} — {{ period.ends_on }}</template>
    </p>
    <dl class="import-counters">
      <div>
        <dt>Усього появ</dt>
        <dd>{{ batch.total_rows }}</dd>
      </div>
      <div>
        <dt>Дійсні</dt>
        <dd>{{ batch.valid_rows }}</dd>
      </div>
      <div>
        <dt>З помилками</dt>
        <dd>{{ batch.invalid_rows }}</dd>
      </div>
      <div>
        <dt>Дублікати</dt>
        <dd>{{ batch.duplicate_rows }}</dd>
      </div>
    </dl>
    <p v-if="batch.error_message" role="alert" class="field-error">{{ batch.error_message }}</p>
    <p v-if="batch.committed_at">Застосовано: {{ exactDateTime(batch.committed_at, timezone) }}</p>
    <p v-if="batch.status === 'committed'" role="status">
      Це збережений результат імпорту. Повторне відкриття не виконує операцій знову.
    </p>
  </div>
</template>
