<script setup lang="ts">
import { ref } from 'vue'
import { planningApi } from '@/api/planning'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { today, addDays } from '@/utils/dates'
import { validateRange, nullableMinutes, duration, exactDateTime } from '@/utils/planning'
import PlanningNav from '@/components/planning/PlanningNav.vue'
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
function search() {
  localError.value = ''
  try {
    validateRange(range.value)
    selectedMinimum.value = nullableMinutes(minimum.value) ?? undefined
    selected.value = { ...range.value }
    void resource.reload()
  } catch (e) {
    localError.value = e instanceof Error ? e.message : ''
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <h1>Вільний навчальний час</h1>
      <p class="muted">Вільний час не гарантує, що інтервал пройде всі обмеження планування.</p>
    </div>
  </header>
  <PlanningNav />
  <AppCard>
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
      v-if="!resource.data.value.data.length"
      title="Вільних інтервалів немає"
      description="Перевірте доступність і параметри пошуку. Результат визначає сервер."
    />
    <AppCard v-for="slot in resource.data.value.data" :key="slot.starts_at">
      <p>
        {{ exactDateTime(slot.starts_at, resource.data.value.meta.timezone) }} —
        {{ exactDateTime(slot.ends_at, resource.data.value.meta.timezone) }}
      </p>
      <strong>{{ duration(slot.duration_seconds) }}</strong>
    </AppCard>
  </template>
  <RouterLink to="/planning/preview" class="button secondary">
    До попереднього перегляду плану
  </RouterLink>
</template>
