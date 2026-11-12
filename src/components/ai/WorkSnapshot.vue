<script setup lang="ts">
import WorkLink from '@/components/planning/WorkLink.vue'
import { useSubjectName } from '@/composables/useWorkLabels'
import { dateTime } from '@/utils/dates'
import { computed } from 'vue'
import type { PublicValue } from '@/types/ai'
import { displayValue, isPublicObject } from '@/utils/ai'
const props = defineProps<{ value: PublicValue; timezone: string }>()
const record = computed(() => (isPublicObject(props.value) ? props.value : null))
const subjectName = useSubjectName(() =>
  typeof record.value?.subject_id === 'number' ? record.value.subject_id : null,
)
const fields = [
  { key: 'title', label: 'Що зробити' },
  { key: 'message', label: 'Про що нагадати' },
  { key: 'deadline_at', label: 'Дедлайн' },
  { key: 'trigger_at', label: 'Коли нагадати' },
  { key: 'subject', label: 'Предмет' },
  { key: 'subject_id', label: 'Предмет' },
  { key: 'priority', label: 'Пріоритет' },
  { key: 'estimated_minutes', label: 'Оцінка часу, хв' },
  { key: 'status', label: 'Стан' },
  { key: 'description', label: 'Деталі' },
  { key: 'anchor', label: 'Відносно' },
  { key: 'offset_minutes', label: 'Відносно події' },
] as const
function text(value: PublicValue, key: string) {
  if (typeof value === 'string' && ['deadline_at', 'trigger_at'].includes(key))
    return dateTime(value, props.timezone)
  if (key === 'priority' && typeof value === 'number')
    return (
      ({ 1: 'Низький', 2: 'Звичайний', 3: 'Високий' } as Record<number, string>)[value] ??
      'Не вказано'
    )
  if (key === 'status' && value === 'missed') return 'Не виконано'
  if (key === 'offset_minutes' && typeof value === 'number')
    return value === 0 ? 'У час події' : `${Math.abs(value)} хв ${value < 0 ? 'до' : 'після'} події`
  if (value === null) return 'Не вказано'
  if (key === 'subject_id') return subjectName.value
  if (isPublicObject(value) && typeof value.name === 'string') return value.name
  return typeof value === 'object' && value !== null
    ? 'Див. повний огляд'
    : displayValue(value, key, props.timezone)
}
</script>
<template>
  <dl v-if="record" class="ai-fields">
    <div v-if="typeof record.task_id === 'number'">
      <dt>Пов’язана робота</dt>
      <dd>
        <WorkLink
          :task-id="record.task_id"
          :subtask-id="typeof record.subtask_id === 'number' ? record.subtask_id : null"
        />
      </dd>
    </div>
    <div v-if="typeof record.study_session_id === 'number'">
      <dt>Навчальна сесія</dt>
      <dd>
        <RouterLink :to="`/planning/sessions/${record.study_session_id}`">
          Переглянути пов’язану сесію
        </RouterLink>
      </dd>
    </div>
    <template v-for="field in fields" :key="field.key">
      <div v-if="field.key in record && !(field.key === 'subject_id' && 'subject' in record)">
        <dt>{{ field.label }}</dt>
        <dd>{{ text(record[field.key] ?? null, field.key) }}</dd>
      </div>
    </template>
  </dl>
  <p v-else-if="value === null" class="helper">Запис ще не створено.</p>
</template>
