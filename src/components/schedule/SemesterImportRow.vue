<script setup lang="ts">
import type { ImportPreviewRow } from '@/types/semesterSchedule'
import { computed } from 'vue'
import { weekdays, patterns } from '@/utils/semesterSchedule'
import { catalogResolution, importErrorMessages, importOperations } from '@/utils/semesterImport'
const props = defineProps<{ row: ImportPreviewRow; scheduleId?: number | null }>()
const teachers = computed(
  () =>
    props.row.teachers ??
    (props.row.teacher
      ? [props.row.teacher]
      : (props.row.teacher_names ?? (props.row.teacher_name ? [props.row.teacher_name] : [])).map(
          (name) => ({ id: null, name }),
        )),
)
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
          {{ catalogResolution(row.subject) }}
        </dd>
      </div>
      <div>
        <dt>Викладачі</dt>
        <dd>
          <template v-if="teachers.length">
            <span v-for="(teacher, index) in teachers" :key="index">
              {{ index ? ', ' : '' }}{{ teacher.name }} · {{ catalogResolution(teacher) }}
            </span>
          </template>
          <template v-else>Без викладача</template>
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
      <li v-for="(message, index) in importErrorMessages(row.errors)" :key="index">
        {{ message }}
      </li>
    </ul>
  </article>
</template>
