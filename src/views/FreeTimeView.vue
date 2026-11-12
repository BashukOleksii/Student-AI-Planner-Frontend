<script setup lang="ts">
import { computed, ref } from 'vue'
import { planningApi } from '@/api/planning'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { today, addDays, localDate, calendarLabel, time } from '@/utils/dates'
import { validateRange, nullableMinutes, duration, exactDateTime } from '@/utils/planning'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import AvailabilityNotice from '@/components/planning/AvailabilityNotice.vue'
import RangeFields from '@/components/planning/RangeFields.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
const auth = useAuthStore(),
  date = today(auth.user?.timezone ?? 'UTC')
const range = ref({ start_date: date, end_date: addDays(date, 6) }),
  selected = ref({ ...range.value }),
  minimum = ref(''),
  selectedMinimum = ref<number>(),
  localError = ref('')
const resource = useResource((signal) =>
  planningApi.freeSlots(selected.value, selectedMinimum.value, signal),
)
const groups = computed(() => {
  const data = resource.data.value
  if (!data) return []
  const days = new Map<string, typeof data.data>()
  for (const slot of data.data) {
    const day = localDate(slot.starts_at, data.meta.timezone)
    days.set(day, [...(days.get(day) ?? []), slot])
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
})
function search() {
  localError.value = ''
  try {
    validateRange(range.value)
    selectedMinimum.value = nullableMinutes(minimum.value) ?? undefined
    selected.value = { ...range.value }
    void availability.reload()
    void resource.reload()
  } catch (e) {
    localError.value = e instanceof Error ? e.message : ''
  }
}
const availability = useResource((signal) => planningApi.availability(signal))
</script>
<template>
  <div class="page-workspace page-planning">
    <header class="page-heading">
      <div>
        <h1>Вільний навчальний час</h1>
        <p class="muted">
          Проміжки у вашій доступності без занять і запланованих сесій. Щоб розмістити роботу, план
          також має врахувати дедлайни, перерви та ліміти.
        </p>
      </div>
    </header>
    <PlanningNav />
    <AvailabilityNotice :missing="availability.data.value?.data.length === 0" />
    <ErrorState
      v-if="availability.error.value"
      :error="availability.error.value"
      retry
      @retry="availability.reload"
    />
    <AppCard class="range-panel">
      <form class="stack" @submit.prevent="search">
        <RangeFields v-model="range" />
        <div class="field">
          <label for="slot-min">Мінімальна тривалість, хв</label>
          <input id="slot-min" v-model="minimum" type="number" min="1" max="65535" step="1" />
        </div>
        <p v-if="localError" class="field-error" role="alert">{{ localError }}</p>
        <AppButton type="submit" variant="primary" :busy="resource.loading.value">
          Знайти вільний час
        </AppButton>
      </form>
    </AppCard>
    <LoadingState v-if="resource.loading.value" />
    <ErrorState
      v-else-if="resource.error.value"
      :error="resource.error.value"
      retry
      @retry="resource.reload"
    />
    <template v-else-if="resource.data.value">
      <p class="helper">
        {{ resource.data.value.meta.start_date }} — {{ resource.data.value.meta.end_date }} ·
        {{ resource.data.value.meta.timezone }}
      </p>
      <EmptyState
        v-if="
          !resource.data.value.data.length &&
          availability.data.value &&
          availability.data.value.data.length > 0
        "
        title="Вільних інтервалів немає"
        description="Інтервали доступності задані, але в цьому пошуку вільного часу немає. Перевірте зайнятість і мінімальну тривалість пошуку."
      />
      <AppCard v-for="[day, slots] in groups" :key="day" :title="calendarLabel(day)">
        <article v-for="slot in slots" :key="slot.starts_at" class="free-slot">
          <strong>
            {{ time(slot.starts_at, resource.data.value.meta.timezone) }} —
            {{ time(slot.ends_at, resource.data.value.meta.timezone) }}
          </strong>
          <span>{{ duration(slot.duration_seconds) }}</span>
        </article>
      </AppCard>
    </template>
    <RouterLink to="/planning/preview" class="button primary">Запланувати навчання</RouterLink>
  </div>
</template>
