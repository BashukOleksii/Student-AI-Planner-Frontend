<script setup lang="ts">
import { publicText as systemText } from '@/utils/publicText'
import { computed } from 'vue'
import { planningReasonLabel, duration } from '@/utils/planning'
import { dateTime } from '@/utils/dates'
import type { PublicValue } from '@/types/ai'
const props = withDefaults(
  defineProps<{ value: PublicValue; field?: string; timezone?: string }>(),
  { field: '', timezone: 'UTC' },
)
// Only student-facing fields are admitted. Protocol fields, tokens and unknown enum values never render.
const labels: Record<string, string> = {
  user_summary: 'Підсумок',
  title: 'Підсумок',
  next_step: 'Наступний крок',
  explanations: 'Пояснення',
  summary: 'Підсумок',
  reason_codes: 'Причини',
  replacement_reason_codes: 'Причини',
  sessions: 'Навчальні сесії',
  session_results: 'Заміни сесій',
  original: 'Було',
  replacements: 'Пропонуємо',
  replacement: 'Пропонуємо',
  starts_at: 'Початок',
  ends_at: 'Завершення',
  duration_seconds: 'Тривалість',
  requested_seconds: 'Потрібно часу',
  allocated_seconds: 'Знайдено часу',
  unscheduled_seconds: 'Без нового часу',
  untransferred_seconds: 'Без нового часу',
  not_transferred_seconds: 'Без нового часу',
  warnings: 'Варто врахувати',
  work_results: 'Робота без часу',
  excluded_items: 'Робота поза планом',
  new_work_plan: 'Нові сесії',
  adaptive_replanning: 'Перенесення сесій',
  result: 'Збережений результат',
  period: 'Період',
  start_date: 'Початкова дата',
  end_date: 'Кінцева дата',
  timezone: 'Часовий пояс',
}
function publicText(value: PublicValue, field: string): string | null {
  if (typeof value === 'number' && field.endsWith('_seconds')) return duration(value)
  if (typeof value !== 'string') return null
  if (['reason_codes', 'replacement_reason_codes'].includes(field))
    return planningReasonLabel(value)
  if (['starts_at', 'ends_at'].includes(field))
    return Number.isFinite(Date.parse(value)) ? dateTime(value, props.timezone) : null
  if (['start_date', 'end_date'].includes(field))
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
  if (field === 'timezone') return value
  if (['title', 'next_step', 'explanations'].includes(field))
    return systemText(value, 'Перегляньте пов’язану роботу й актуальні умови планування.')
  return null
}
function hasContent(value: PublicValue, field: string): boolean {
  if (Array.isArray(value)) return value.some((item) => hasContent(item, field))
  if (value && typeof value === 'object')
    return Object.entries(value).some(
      ([key, item]) => Object.hasOwn(labels, key) && hasContent(item, key),
    )
  return publicText(value, field) !== null
}
const entries = computed(() =>
  props.value && typeof props.value === 'object' && !Array.isArray(props.value)
    ? Object.entries(props.value).filter(
        ([key, value]) => Object.hasOwn(labels, key) && hasContent(value, key),
      )
    : [],
)
const items = computed(() =>
  Array.isArray(props.value) ? props.value.filter((item) => hasContent(item, props.field)) : [],
)
</script>
<template>
  <span v-if="publicText(value, field) !== null">{{ publicText(value, field) }}</span>
  <ul v-else-if="items.length" class="evidence-list">
    <li v-for="(item, index) in items" :key="index">
      <RecoveryEvidence :value="item" :field="field" :timezone="timezone" />
    </li>
  </ul>
  <dl v-else-if="entries.length" class="evidence-fields">
    <div v-for="[key, item] in entries" :key="key">
      <dt>{{ labels[key] }}</dt>
      <dd><RecoveryEvidence :value="item" :field="key" :timezone="timezone" /></dd>
    </div>
  </dl>
</template>
