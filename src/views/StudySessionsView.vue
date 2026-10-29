<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { studySessionsApi } from '@/api/studySessions'
import { today, addDays, localDate, calendarLabel } from '@/utils/dates'
import { validateRange } from '@/utils/planning'
import { computed } from 'vue'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import RangeFields from '@/components/planning/RangeFields.vue'
import SessionCard from '@/components/planning/SessionCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
const auth = useAuthStore(),
  route = useRoute(),
  date = today(auth.user?.timezone ?? 'UTC')
const range = ref({ start_date: date, end_date: addDays(date, 6) })
try {
  const candidate = {
    start_date: String(route.query.start_date ?? date),
    end_date: String(route.query.end_date ?? addDays(date, 6)),
  }
  validateRange(candidate)
  range.value = candidate
} catch {
  /* Invalid incoming query falls back to a safe bounded local range. */
}
const selected = ref({ ...range.value }),
  localError = ref('')
const resource = useResource((signal) => studySessionsApi.list(selected.value, signal))
const groups = computed(() => {
  const result = new Map<string, NonNullable<typeof resource.data.value>['data']>()
  for (const session of resource.data.value?.data ?? []) {
    const day = localDate(session.starts_at, resource.data.value!.meta.timezone)
    result.set(day, [...(result.get(day) ?? []), session])
  }
  return [...result.entries()]
})
function search() {
  localError.value = ''
  try {
    validateRange(range.value)
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
      <h1>Навчальні сесії</h1>
      <p class="muted">
        Самостійне навчання й історія його змін. Минулі заплановані сесії не позначаються
        пропущеними автоматично.
      </p>
    </div>
    <RouterLink to="/planning/preview" class="button primary">Створити план</RouterLink>
  </header>
  <PlanningNav />
  <AppCard>
    <form class="stack" @submit.prevent="search">
      <RangeFields v-model="range" />
      <p v-if="localError" class="field-error" role="alert">{{ localError }}</p>
      <AppButton type="submit" :busy="resource.loading.value">Показати сесії</AppButton>
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
      {{ selected.start_date }} — {{ selected.end_date }} · {{ resource.data.value.meta.timezone }}
    </p>
    <EmptyState v-if="!resource.data.value.data.length" title="Сесій у цьому періоді немає" />
    <AppCard v-for="[day, sessions] in groups" :key="day" :title="calendarLabel(day)">
      <SessionCard
        v-for="session in sessions"
        :key="session.id"
        :session="session"
        :timezone="resource.data.value.meta.timezone"
      />
    </AppCard>
  </template>
</template>
