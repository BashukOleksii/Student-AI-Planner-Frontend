<script setup lang="ts">
import { fieldLabel, displayValue } from '@/utils/ai'
import type { PublicValue } from '@/types/ai'
withDefaults(defineProps<{ value: PublicValue; field?: string; timezone?: string }>(), {
  field: '',
  timezone: 'UTC',
})
const labels: Record<string, string> = {
  before: 'До зміни',
  after: 'Після зміни',
  unknown_session_decisions: 'Сесії, що потребують вашого рішення',
  recovery: 'Невиконана робота',
  new_work_plan: 'Новий план',
  adaptive_replanning: 'Перенесення сесій',
  work_effort: 'Обсяг роботи',
  unknown_duration_work: 'Робота без оцінки тривалості',
  workload_advice: 'Навантаження та попередження',
  limitations: 'Обмеження',
  reason_codes: 'Причини',
  sessions: 'Навчальні сесії',
  starts_at: 'Початок',
  ends_at: 'Завершення',
  task_id: 'Завдання',
  subtask_id: 'Підзавдання',
  study_session_id: 'Навчальна сесія',
  title: 'Назва',
  name: 'Назва',
  summary: 'Підсумок',
  warnings: 'Попередження',
  unallocated_minutes: 'Нерозміщені хвилини',
  allocated_minutes: 'Розміщені хвилини',
  requested_minutes: 'Потрібні хвилини',
  unchanged_sessions: 'Збережені сесії',
  required_confirmation_fields: 'Необхідні дозволи',
  result: 'Результат',
  applied_at: 'Час застосування',
  timezone: 'Часовий пояс',
  start_date: 'Початкова дата',
  end_date: 'Кінцева дата',
  effects: 'Наслідки',
  scope: 'Обсяг зміни',
}
</script>
<template>
  <span v-if="value === null">Не вказано</span>
  <span v-else-if="typeof value === 'boolean'">{{ value ? 'Так' : 'Ні' }}</span>
  <RouterLink
    v-else-if="
      typeof value === 'number' &&
      (field === 'study_session_id' || field === 'task_id') &&
      value > 0
    "
    :to="field === 'task_id' ? `/tasks/${value}` : `/planning/sessions/${value}`"
  >
    {{ field === 'task_id' ? 'Завдання' : 'Сесія' }} №{{ value }}
  </RouterLink>
  <span v-else-if="typeof value !== 'object'">{{ displayValue(value, field, timezone) }}</span>
  <ol v-else-if="Array.isArray(value)" class="evidence-list">
    <li v-for="(item, index) in value" :key="index">
      <RecoveryEvidence :value="item" :field="field" :timezone="timezone" />
    </li>
    <li v-if="!value.length">Немає</li>
  </ol>
  <dl v-else class="evidence-fields">
    <div v-for="(item, key) in value" :key="key">
      <dt>{{ labels[key] ?? fieldLabel(String(key)) }}</dt>
      <dd><RecoveryEvidence :value="item" :field="String(key)" :timezone="timezone" /></dd>
    </div>
  </dl>
</template>
