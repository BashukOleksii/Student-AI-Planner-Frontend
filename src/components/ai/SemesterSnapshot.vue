<script setup lang="ts">
import { computed } from 'vue'
import type { PublicValue } from '@/types/ai'
import { isPublicObject, displayValue } from '@/utils/ai'
const props = defineProps<{ value: PublicValue; timezone: string }>()
const record = computed(() => (isPublicObject(props.value) ? props.value : null))
const rows = computed(() =>
  record.value && Array.isArray(record.value.lessons)
    ? record.value.lessons.filter(isPublicObject)
    : record.value && !('group_name' in record.value)
      ? [record.value]
      : [],
)
function name(value: PublicValue | undefined) {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.name === 'string'
    ? value.name
    : 'Не вказано'
}
</script>
<template>
  <p v-if="value === null">Немає запису</p>
  <template v-else-if="record">
    <template v-if="'group_name' in record">
      <p>
        <strong>{{ record.group_name }}</strong>
      </p>
      <p>Перший тиждень: {{ displayValue(record.first_week_parity as string, '', timezone) }}</p>
      <p>Відлік від {{ record.parity_anchor_on }}</p>
    </template>
    <template v-else>
      <p v-if="record.date">{{ record.date }}</p>
      <p v-if="!rows.length">Занять немає</p>
      <article v-for="(row, index) in rows" :key="index" class="snapshot-lesson">
        <h4>{{ name(row.subject) }}</h4>
        <p>
          {{
            row.starts_at_local ??
            (typeof row.starts_at === 'string'
              ? displayValue(row.starts_at, 'starts_at', timezone)
              : '')
          }}
          —
          {{
            row.ends_at_local ??
            (typeof row.ends_at === 'string' ? displayValue(row.ends_at, 'ends_at', timezone) : '')
          }}
        </p>
        <p class="helper">
          {{ name(row.teacher) }}
          <template v-if="row.room">· Ауд. {{ row.room }}</template>
        </p>
        <p v-if="row.week_pattern" class="helper">
          {{ displayValue(String(row.week_pattern), '', timezone) }} · День тижня {{ row.weekday }}
        </p>
      </article>
    </template>
  </template>
</template>
