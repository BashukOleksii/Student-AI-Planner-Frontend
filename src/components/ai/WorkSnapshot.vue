<script setup lang="ts">
import { useSubjectName } from '@/composables/useWorkLabels'
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
  { key: 'offset_minutes', label: 'До / після, хв' },
] as const
function text(value: PublicValue, key: string) {
  if (key === 'subject_id') return subjectName.value
  if (isPublicObject(value) && typeof value.name === 'string') return value.name
  return typeof value === 'object' && value !== null
    ? 'Див. повний огляд'
    : displayValue(value, key, props.timezone)
}
</script>
<template>
  <dl v-if="record" class="ai-fields">
    <template v-for="field in fields" :key="field.key">
      <div v-if="field.key in record && !(field.key === 'subject_id' && 'subject' in record)">
        <dt>{{ field.label }}</dt>
        <dd>{{ text(record[field.key] ?? null, field.key) }}</dd>
      </div>
    </template>
  </dl>
  <p v-else-if="value === null" class="helper">Запис ще не створено.</p>
</template>
