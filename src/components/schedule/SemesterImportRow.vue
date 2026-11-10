<script setup lang="ts">
import type { ImportPreviewRow } from '@/types/semesterSchedule'
import { weekdays, patterns } from '@/utils/semesterSchedule'
import { importOperations } from '@/utils/semesterImport'
defineProps<{ row: ImportPreviewRow; scheduleId?: number | null }>()
</script>
<template>
  <article class="import-row">
    <div class="section-heading">
      <h3>
        Рядок {{ row.row_number }} · {{ weekdays[row.weekday] }} · пара {{ row.pair_number }}
        <template v-if="row.pair_label">({{ row.pair_label }})</template>
      </h3>
      <span class="badge">
        {{ row.operation ? importOperations[row.operation] : 'Потребує виправлення' }}
      </span>
    </div>
    <dl class="import-row-fields">
      <div>
        <dt>Повторення</dt>
        <dd>{{ patterns[row.week_pattern] }}</dd>
      </div>
      <div>
        <dt>Місцевий час</dt>
        <dd>{{ row.starts_at_local }}–{{ row.ends_at_local }}</dd>
      </div>
      <div>
        <dt>Предмет</dt>
        <dd>
          {{ row.subject_name }} ·
          {{ row.subject ? `Знайдено №${row.subject.id}` : 'Потрібне зіставлення' }}
        </dd>
      </div>
      <div>
        <dt>Викладач</dt>
        <dd>
          {{ row.teacher_name || 'У файлі без викладача' }}
          <template v-if="row.teacher_name">
            · {{ row.teacher ? `Знайдено №${row.teacher.id}` : 'Потрібне зіставлення' }}
          </template>
        </dd>
      </div>
      <div>
        <dt>Аудиторія</dt>
        <dd>{{ row.room ?? 'Не вказано' }}</dd>
      </div>
      <div>
        <dt>Джерело Excel</dt>
        <dd>
          {{ row.source.worksheet }} · {{ row.source.range }} · блок {{ row.source.pair_range }}
        </dd>
      </div>
    </dl>
    <RouterLink
      v-if="row.matched_rule_id && scheduleId"
      :to="`/schedule/semesters/${scheduleId}/rules/${row.matched_rule_id}`"
      class="text-link"
    >
      Поточне правило №{{ row.matched_rule_id }}
    </RouterLink>
    <p v-if="row.suppressed_slot_ids?.length" class="helper">
      Записи захисту · {{ row.suppressed_slot_ids.join(', ') }}
    </p>
    <ul v-if="Object.keys(row.errors).length" class="field-error">
      <template v-for="(messages, field) in row.errors" :key="field">
        <li v-for="message in messages" :key="message">{{ message }}</li>
      </template>
    </ul>
  </article>
</template>
