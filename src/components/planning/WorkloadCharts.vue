<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorkloadAnalytics } from '@/types/planning'
import { duration } from '@/utils/planning'
import AppCard from '@/components/ui/AppCard.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'

const props = defineProps<{ analytics: WorkloadAnalytics }>()
const subjectPage = ref(1)
watch(
  () => props.analytics,
  () => {
    subjectPage.value = 1
  },
)
const dayMax = computed(() =>
  Math.max(1, ...props.analytics.days.map((day) => day.planned_seconds)),
)
const subjects = computed(() =>
  props.analytics.subjects.slice((subjectPage.value - 1) * 5, subjectPage.value * 5),
)
const subjectMax = computed(() =>
  Math.max(1, ...props.analytics.subjects.map((subject) => subject.scheduled_seconds)),
)
const shortDate = (date: string) => `${date.slice(8)}.${date.slice(5, 7)}`
</script>

<template>
  <div class="workload-charts">
    <AppCard title="Заплановано за днями">
      <template #action>
        <span class="muted">{{ duration(analytics.planned_seconds) }}</span>
      </template>
      <figure v-if="analytics.days.some((day) => day.planned_seconds > 0)" class="daily-chart">
        <figcaption class="sr-only">Навчальний час у збереженому плані за днями</figcaption>
        <p class="helper">До {{ duration(dayMax) }} на день</p>
        <div
          class="daily-chart-scroll"
          tabindex="0"
          role="region"
          aria-label="Графік за днями, прокручуйте горизонтально"
        >
          <div class="daily-columns" :style="{ minWidth: `${analytics.days.length * 38}px` }">
            <div
              v-for="day in analytics.days"
              :key="day.date"
              class="daily-column"
              role="img"
              tabindex="0"
              :aria-label="`${day.date}: ${duration(day.planned_seconds)}`"
            >
              <span class="day-tooltip">
                {{ shortDate(day.date) }} · {{ duration(day.planned_seconds) }}
              </span>
              <div class="day-track" aria-hidden="true">
                <span
                  class="day-fill"
                  :style="{ height: `${(day.planned_seconds / dayMax) * 100}%` }"
                ></span>
              </div>
              <span class="day-label" aria-hidden="true">{{ shortDate(day.date) }}</span>
            </div>
          </div>
        </div>
        <details class="chart-data">
          <summary>Час за кожен день</summary>
          <p class="helper">Сесії враховано за датою початку у вашому часовому поясі.</p>
          <dl class="daily-values">
            <div v-for="day in analytics.days" :key="day.date">
              <dt>{{ shortDate(day.date) }}</dt>
              <dd>{{ duration(day.planned_seconds) }}</dd>
            </div>
          </dl>
        </details>
      </figure>
      <p v-else class="workload-empty">У цьому періоді ще немає запланованих сесій.</p>
    </AppCard>
    <AppCard v-if="analytics.subjects.length" title="Навантаження за предметами">
      <p class="helper">Заплановане й завершене навчання за період</p>
      <ol
        class="subject-ranking"
        aria-label="Рейтинг предметів за навчальним часом"
        :start="(subjectPage - 1) * 5 + 1"
      >
        <li v-for="subject in subjects" :key="subject.subject_id ?? 'none'">
          <div class="workload-row-heading">
            <span>{{ subject.subject_name }}</span>
            <strong>{{ duration(subject.scheduled_seconds) }}</strong>
          </div>
          <div class="subject-track" aria-hidden="true">
            <span :style="{ width: `${(subject.scheduled_seconds / subjectMax) * 100}%` }"></span>
          </div>
        </li>
      </ol>
      <PageNavigation
        v-if="analytics.subjects.length > 5"
        compact
        :current="subjectPage"
        :last="Math.ceil(analytics.subjects.length / 5)"
        :total="analytics.subjects.length"
        @page="subjectPage = $event"
      />
    </AppCard>
  </div>
</template>
