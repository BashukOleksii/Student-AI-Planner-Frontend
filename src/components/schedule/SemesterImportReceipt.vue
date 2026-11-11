<script setup lang="ts">
import { computed } from 'vue'
import { patterns } from '@/utils/semesterSchedule'
import type { ImportReceipt } from '@/types/semesterSchedule'
import { dateTime } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import SemesterImportCounts from './SemesterImportCounts.vue'
const props = defineProps<{ receipt: ImportReceipt; importId: number; timezone: string }>()
const sections = computed(() => [
  {
    label: 'Створено предметів',
    items: props.receipt.catalog?.subjects.filter((item) => item.resolution === 'created') ?? [],
  },
  {
    label: 'Повторно використано предметів',
    items: props.receipt.catalog?.subjects.filter((item) => item.resolution === 'reused') ?? [],
  },
  {
    label: 'Створено викладачів',
    items: props.receipt.catalog?.teachers.filter((item) => item.resolution === 'created') ?? [],
  },
  {
    label: 'Повторно використано викладачів',
    items: props.receipt.catalog?.teachers.filter((item) => item.resolution === 'reused') ?? [],
  },
])
</script>
<template>
  <AppCard title="Збережена квитанція імпорту">
    <p>Пакет №{{ importId }} · семестр №{{ receipt.semester_schedule_id }}</p>
    <p>
      Застосовано
      <time :datetime="receipt.committed_at">{{ dateTime(receipt.committed_at, timezone) }}</time>
      ({{ timezone }})
    </p>
    <SemesterImportCounts :counts="receipt.counts" />
    <p v-if="receipt.parity_anchor_on">Понеділок відліку: {{ receipt.parity_anchor_on }}</p>
    <p v-if="receipt.first_week_parity">
      Перший тиждень: {{ patterns[receipt.first_week_parity] }}
    </p>
    <template v-if="receipt.catalog">
      <section v-for="section in sections" :key="section.label">
        <h3>{{ section.label }}: {{ section.items.length }}</h3>
        <ul v-if="section.items.length">
          <li v-for="item in section.items" :key="item.id">{{ item.name }} · №{{ item.id }}</li>
        </ul>
      </section>
    </template>
    <p class="helper">
      Правила на момент застосування ·
      {{ receipt.rule_ids.length ? receipt.rule_ids.join(', ') : 'немає' }}
    </p>
    <slot />
  </AppCard>
</template>
