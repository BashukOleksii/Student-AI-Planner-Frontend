<script setup lang="ts">
import type { ScheduleImportRow } from '@/types/scheduleImport'
import { rowStatuses, operationLabels, importInstantLabel } from '@/utils/scheduleImport'
import { lessonTypes } from '@/utils/lessons'
import { weekdays } from '@/utils/planning'
defineProps<{ row: ScheduleImportRow; timezone: string }>()
const errorLabels: Record<string, string> = {
  subject_name: 'Предмет',
  teacher_name: 'Викладач',
  schedule: 'Розклад',
  import_identity: 'Відповідність імпорту',
  preview_integrity: 'Цілісність огляду',
}
const parityLabels = { all: 'Щотижня', numerator: 'Чисельник', denominator: 'Знаменник' }
</script>
<template>
  <article class="import-row" :aria-labelledby="`import-row-${row.row_number}`">
    <header class="section-heading">
      <h3 :id="`import-row-${row.row_number}`">
        Поява №{{ row.row_number }} · {{ row.subject_name ?? 'Предмет не визначено' }}
      </h3>
      <span
        class="badge"
        :class="
          row.status === 'invalid' ? 'danger' : row.status === 'duplicate' ? 'warning' : 'success'
        "
      >
        {{ rowStatuses[row.status] }}
      </span>
    </header>
    <p class="import-operation">
      <strong>
        {{ row.operation ? operationLabels[row.operation] : 'Операцію не визначено' }}
      </strong>
    </p>
    <p v-if="row.operation === 'preserve'" class="helper">
      Скасоване або замінене заняття зберігає свій поточний стан. Це не оновлення.
    </p>
    <p v-if="row.operation === 'update' || row.operation === 'restore'" class="schedule-warning">
      Буде змінено або відновлено наявне заняття. Виправлений вручну тип зберігається.
    </p>
    <p v-if="row.status === 'duplicate'" class="helper">Цей рядок не створює нового заняття.</p>
    <dl class="import-row-fields">
      <div>
        <dt>Дата і день</dt>
        <dd>
          {{ row.local_date ?? 'Не вказано' }} ·
          {{ row.weekday ? weekdays[row.weekday - 1] : 'Не вказано' }}
        </dd>
      </div>
      <div>
        <dt>Група · пара · повторення</dt>
        <dd>
          {{ row.group ?? 'Не вказано' }} · {{ row.pair_label ?? 'Не вказано' }} ·
          {{ row.parity ? parityLabels[row.parity] : 'Не вказано' }}
        </dd>
      </div>
      <div>
        <dt>Локальні мітки при завантаженні</dt>
        <dd>{{ row.starts_at_local ?? 'Не вказано' }} — {{ row.ends_at_local ?? 'Не вказано' }}</dd>
      </div>
      <div>
        <dt>У поточному поясі профілю</dt>
        <dd>
          {{ importInstantLabel(row.starts_at_utc, timezone) }} —
          {{ importInstantLabel(row.ends_at_utc, timezone) }}
        </dd>
      </div>
      <div>
        <dt>Збережені UTC-мітки</dt>
        <dd>{{ row.starts_at_utc ?? 'Не вказано' }} — {{ row.ends_at_utc ?? 'Не вказано' }}</dd>
      </div>
      <div>
        <dt>Предмет</dt>
        <dd>
          {{ row.subject_name ?? 'Не вказано' }}
          <template v-if="row.subject_id">· №{{ row.subject_id }}</template>
        </dd>
      </div>
      <div>
        <dt>Викладач</dt>
        <dd>
          {{ row.teacher_name ?? 'Не вказано' }}
          <template v-if="row.teacher_id">· №{{ row.teacher_id }}</template>
        </dd>
      </div>
      <div>
        <dt>Аудиторія · технічний тип</dt>
        <dd>
          {{ row.room ?? 'Не вказано' }} · {{ row.type ? lessonTypes[row.type] : 'Не вказано' }}
        </dd>
      </div>
      <div v-if="row.workbook_source">
        <dt>Джерело книги</dt>
        <dd>{{ row.workbook_source.worksheet }} · {{ row.workbook_source.range }}</dd>
      </div>
      <div v-if="row.source">
        <dt>Джерело появи</dt>
        <dd>
          {{ row.source.worksheet }} · рядки {{ row.source.rows[0] }}–{{ row.source.rows[1] }} ·
          {{ row.source.range }} · блок {{ row.source.pair_range }}
        </dd>
      </div>
    </dl>
    <ul
      v-if="Object.keys(row.validation_errors).length"
      class="field-error"
      :aria-label="`Помилки появи ${row.row_number}`"
    >
      <template v-for="(messages, field) in row.validation_errors" :key="field">
        <li v-for="message in messages" :key="message">
          {{ errorLabels[String(field)] ?? field }}: {{ message }}
        </li>
      </template>
    </ul>
    <RouterLink
      v-if="row.matched_lesson_id"
      :to="`/schedule/lessons/${row.matched_lesson_id}`"
      class="text-link"
    >
      Пов’язане заняття №{{ row.matched_lesson_id }} →
    </RouterLink>
  </article>
</template>
