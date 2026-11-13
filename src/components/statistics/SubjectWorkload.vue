<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MetricChart from './MetricChart.vue'
import type { SubjectWorkload } from '@/types/statistics'
import { duration } from '@/utils/planning'
import { chartColors } from '@/utils/statistics'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
const props = defineProps<{ groups: SubjectWorkload[] }>()
const page = ref(1)
const total = computed(() => props.groups.reduce((sum, group) => sum + group.scheduled_seconds, 0))
const visible = computed(() => props.groups.slice((page.value - 1) * 5, page.value * 5))
const name = (group: SubjectWorkload) =>
  group.subject_id === null ? 'Без прив’язки до предмета' : group.subject_name
watch(
  () => props.groups,
  () => {
    page.value = 1
  },
)
</script>
<template>
  <EmptyState v-if="!groups.length" title="Немає навчального навантаження за обраний період" />
  <div v-else class="subject-layout">
    <div>
      <MetricChart
        title="Розподіл навчального часу"
        unit="хв"
        variant="donut"
        :values="
          groups.map((group) => ({ label: name(group), value: group.scheduled_seconds / 60 }))
        "
      />
      <p class="helper">Заплановані та завершені сесії</p>
    </div>
    <div class="subject-list">
      <ol class="subject-items" aria-label="Навчальний час за предметами">
        <li
          v-for="(group, index) in visible"
          :key="group.subject_id ?? 'unassigned'"
          class="subject-workload"
          :style="{ '--subject-color': chartColors[((page - 1) * 5 + index) % chartColors.length] }"
        >
          <div class="subject-heading">
            <h3>{{ name(group) }}</h3>
            <strong>{{ duration(group.scheduled_seconds) }}</strong>
          </div>
          <div class="subject-share" aria-hidden="true">
            <span
              :style="{ width: `${total ? (group.scheduled_seconds / total) * 100 : 0}%` }"
            ></span>
          </div>
          <div class="subject-meta">
            <span>Сесій: {{ group.session_count }}</span>
            <span>
              Записано:
              {{
                group.completed_with_actual_minutes ? `${group.completed_actual_minutes} хв` : '—'
              }}
            </span>
          </div>
          <p v-if="group.completed_without_actual_minutes > 0" class="subject-unknown">
            Без записаного часу: {{ group.completed_without_actual_minutes }}
          </p>
        </li>
      </ol>
      <PageNavigation
        v-if="groups.length > 5"
        compact
        :current="page"
        :last="Math.ceil(groups.length / 5)"
        :total="groups.length"
        @page="page = $event"
      />
    </div>
  </div>
</template>
<style scoped>
.subject-layout {
  display: grid;
  grid-template-columns: minmax(180px, 0.7fr) minmax(0, 1.3fr);
  gap: 28px;
  align-items: center;
}
.subject-layout > div {
  min-width: 0;
}
.subject-layout > div:first-child > p {
  text-align: center;
}
.subject-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.subject-workload {
  padding: 12px 16px;
  border: 0;
  background: var(--subtle);
  border-radius: var(--radius-sm);
}
.subject-heading {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: baseline;
}
.subject-heading h3 {
  position: relative;
  padding-inline-start: 16px;
  min-width: 0;
  font-size: 13px;
}
.subject-heading h3::before {
  content: '';
  position: absolute;
  inset-inline-start: 0;
  top: 7px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--subject-color);
}
.subject-heading strong {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.subject-share {
  margin-block: 8px;
  height: 5px;
  background: var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.subject-share span {
  display: block;
  height: 100%;
  background: var(--subject-color);
}
.subject-meta {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--text-secondary);
  font-size: 12px;
}
.subject-unknown {
  font-size: 12px;
  color: var(--warning);
  margin-top: 3px;
}
@media (max-width: 620px) {
  .subject-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
