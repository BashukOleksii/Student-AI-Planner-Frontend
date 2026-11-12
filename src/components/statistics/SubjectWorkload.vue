<script setup lang="ts">
import MetricChart from './MetricChart.vue'
import type { SubjectWorkload } from '@/types/statistics'
import { duration } from '@/utils/planning'
import EmptyState from '@/components/ui/EmptyState.vue'
defineProps<{ groups: SubjectWorkload[] }>()
</script>
<template>
  <p class="helper">
    Заплановані та завершені сесії, що починаються в обраному періоді. Предмет визначається поточним
    завданням; підзавдання успадковує його предмет. Пропущені, скасовані та перенесені сесії не
    входять у це навантаження.
  </p>
  <EmptyState
    v-if="!groups.length"
    title="Немає навчального навантаження за обраний період"
    description="У цьому періоді немає запланованих або завершених навчальних сесій."
  />
  <MetricChart
    v-if="groups.length"
    title="Навчальний час за предметами"
    unit="Хвилини"
    :values="
      groups.map((group) => ({
        label: group.subject_name ?? 'Без предмета',
        value: group.scheduled_seconds / 60,
      }))
    "
  />
  <figure
    v-for="group in groups"
    :key="group.subject_id ?? 'unassigned'"
    class="metric-chart subject-workload"
  >
    <figcaption>
      <h3>{{ group.subject_id === null ? 'Без предмета' : group.subject_name }}</h3>
    </figcaption>
    <table>
      <caption class="sr-only">
        {{ group.subject_id === null ? 'Без предмета' : group.subject_name }} — навантаження за
        обраний період
      </caption>
      <thead>
        <tr>
          <th scope="col">Показник</th>
          <th scope="col">Значення</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Запланована тривалість навчання</th>
          <td>{{ duration(group.scheduled_seconds) }}</td>
        </tr>
        <tr>
          <th scope="row">Кількість сесій</th>
          <td>{{ group.session_count }}</td>
        </tr>
        <tr>
          <th scope="row">Відомий фактичний час завершених сесій</th>
          <td>
            <template v-if="group.completed_with_actual_minutes > 0">
              {{ group.completed_actual_minutes }} хв
            </template>
            <template v-else>Немає записаних хвилин</template>
          </td>
        </tr>
        <tr>
          <th scope="row">Завершених сесій без фактичної тривалості</th>
          <td>{{ group.completed_without_actual_minutes }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="group.completed_without_actual_minutes > 0" class="report-warning">
      Фактичний час неповний: є завершені сесії без записаної тривалості. Невідомі хвилини не
      дорівнюють нулю й не замінюються запланованим часом.
    </p>
  </figure>
</template>
