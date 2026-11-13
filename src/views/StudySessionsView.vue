<script setup lang="ts">
import { useWorkLabels } from '@/composables/useWorkLabels'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { studySessionsApi } from '@/api/studySessions'
import { today, addDays, localDate, calendarLabel } from '@/utils/dates'
import { validateRange, sessionStatuses } from '@/utils/planning'
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
const taskFilter = computed(() =>
  /^\d+$/.test(String(route.query.task_id ?? '')) ? Number(route.query.task_id) : null,
)
function routeStatus(value: unknown) {
  if (value === '' || value === 'all') return ''
  return typeof value === 'string' && Object.hasOwn(sessionStatuses, value) ? value : 'planned'
}
const statusFilter = ref(routeStatus(route.query.status))
watch(
  () => route.query.status,
  (value) => {
    statusFilter.value = routeStatus(value)
  },
)
const visibleSessions = computed(() =>
  (resource.data.value?.data ?? []).filter(
    (session) =>
      (!taskFilter.value || session.task_id === taskFilter.value) &&
      (!statusFilter.value || session.status === statusFilter.value),
  ),
)
const groups = computed(() => {
  const result = new Map<string, NonNullable<typeof resource.data.value>['data']>()
  for (const session of [...visibleSessions.value].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id - b.id,
  )) {
    const day = localDate(session.starts_at, resource.data.value!.meta.timezone)
    result.set(day, [...(result.get(day) ?? []), session])
  }
  return [...result.entries()].sort(([a], [b]) => a.localeCompare(b))
})
const activeDay = ref<string | null>(null)
const activeIndex = computed(() => groups.value.findIndex(([day]) => day === activeDay.value))
const activeGroup = computed(() => groups.value[activeIndex.value])
watch(groups, (days) => {
  // Reloading temporarily clears data; retain the open day until the response arrives.
  if (!resource.data.value) return
  if (days.some(([day]) => day === activeDay.value)) return
  const currentDate = today(resource.data.value.meta.timezone)
  activeDay.value = days.find(([day]) => day === currentDate)?.[0] ?? days[0]?.[0] ?? null
})
function changeDay(offset: number) {
  const group = groups.value[activeIndex.value + offset]
  if (group) activeDay.value = group[0]
}
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
useWorkLabels(() => resource.data.value)
</script>
<template>
  <div class="page-workspace page-planning">
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
    <div class="toolbar">
      <div class="session-status-field">
        <label for="study-session-status">Стан сесій</label>
        <select id="study-session-status" v-model="statusFilter">
          <option value="">Усі стани</option>
          <option value="planned">Заплановано</option>
          <option value="completed">Завершено</option>
          <option value="missed">Пропущено</option>
          <option value="cancelled">Скасовано</option>
          <option value="rescheduled">Перенесено</option>
        </select>
      </div>
      <AppButton v-if="statusFilter" @click="statusFilter = ''">Показати всі стани</AppButton>
      <RouterLink v-if="taskFilter" to="/planning/sessions" class="text-link">
        Усі завдання
      </RouterLink>
      <p v-if="taskFilter" class="helper">Показано сесії вибраного завдання в цьому періоді.</p>
    </div>
    <LoadingState v-if="resource.loading.value" />
    <ErrorState
      v-else-if="resource.error.value"
      :error="resource.error.value"
      retry
      @retry="resource.reload"
    />
    <template v-else-if="resource.data.value">
      <p class="helper">
        {{ selected.start_date }} — {{ selected.end_date }} ·
        {{ resource.data.value.meta.timezone }}
      </p>
      <EmptyState
        v-if="!visibleSessions.length"
        :title="
          statusFilter === 'planned'
            ? 'Запланованих сесій у цьому періоді немає'
            : 'Сесій у цьому періоді немає'
        "
        :description="
          statusFilter === 'planned'
            ? 'Щоб переглянути історію та інші стани, натисніть «Показати всі стани».'
            : undefined
        "
      />
      <AppCard v-if="activeGroup" :title="calendarLabel(activeGroup[0])" class="agenda-day">
        <SessionCard
          v-for="session in activeGroup[1]"
          :key="session.id"
          :session="session"
          status-colors
          :timezone="resource.data.value.meta.timezone"
        />
      </AppCard>
      <nav v-if="groups.length > 1" class="pagination" aria-label="Дні навчальних сесій">
        <AppButton :disabled="activeIndex <= 0" @click="changeDay(-1)">Попередній день</AppButton>
        <AppButton :disabled="activeIndex >= groups.length - 1" @click="changeDay(1)">
          Наступний день
        </AppButton>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.session-status-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
