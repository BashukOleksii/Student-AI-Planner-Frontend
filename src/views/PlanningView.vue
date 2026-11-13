<script setup lang="ts">
import { useWorkLabels } from '@/composables/useWorkLabels'
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { studySessionsApi } from '@/api/studySessions'
import { usePlanningAttentionStore } from '@/stores/planningAttention'
import { planningApi } from '@/api/planning'
import { today, addDays, localDate } from '@/utils/dates'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import AvailabilityNotice from '@/components/planning/AvailabilityNotice.vue'
import SessionCard from '@/components/planning/SessionCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
const auth = useAuthStore()
const date = computed(() => today(auth.user?.timezone ?? 'UTC'))
const sessions = useResource(
  (signal) =>
    studySessionsApi.list({ start_date: date.value, end_date: addDays(date.value, 6) }, signal),
  [date],
)
const attention = usePlanningAttentionStore()
const upcoming = computed(() =>
  (sessions.data.value?.data.filter((item) => item.status === 'planned') ?? []).sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id - b.id,
  ),
)
const timezone = computed(() => sessions.data.value?.meta.timezone ?? auth.user?.timezone ?? 'UTC')
const todaySessions = computed(() =>
  upcoming.value.filter((session) => localDate(session.starts_at, timezone.value) === date.value),
)
const laterSessions = computed(() =>
  upcoming.value.filter((session) => localDate(session.starts_at, timezone.value) !== date.value),
)
const todayPage = ref(1),
  laterPage = ref(1)
const pageSize = 3
const todayLast = computed(() => Math.max(1, Math.ceil(todaySessions.value.length / pageSize)))
const laterLast = computed(() => Math.max(1, Math.ceil(laterSessions.value.length / pageSize)))
const visibleToday = computed(() =>
  todaySessions.value.slice((todayPage.value - 1) * pageSize, todayPage.value * pageSize),
)
const visibleLater = computed(() =>
  laterSessions.value.slice((laterPage.value - 1) * pageSize, laterPage.value * pageSize),
)
watch(
  date,
  () => {
    todayPage.value = 1
    laterPage.value = 1
  },
  { flush: 'sync' },
)
watch(sessions.data, (value) => {
  // A reload clears data while loading; clamp only after a successful response.
  if (!value) return
  todayPage.value = Math.min(todayPage.value, todayLast.value)
  laterPage.value = Math.min(laterPage.value, laterLast.value)
})
useWorkLabels(() => sessions.data.value)
const availability = useResource((signal) => planningApi.availability(signal))
</script>
<template>
  <div class="page-workspace page-planning">
    <header class="page-heading planning-home-heading">
      <div>
        <p class="eyebrow">Самостійне навчання</p>
        <h1>Мій план</h1>
        <p class="muted">Ваші сесії на найближчий тиждень і наступний крок.</p>
      </div>
      <div class="inline planning-heading-actions">
        <RouterLink to="/planning/preview" class="button primary">Створити план</RouterLink>
        <RouterLink to="/ai" class="button secondary">Обговорити з AI</RouterLink>
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
    <ErrorState v-if="attention.error" :error="attention.error" retry @retry="attention.refresh" />
    <RouterLink
      v-else-if="
        attention.status &&
        (attention.status.attention_count > 0 ||
          attention.status.has_informational_recommendations ||
          attention.status.review_refresh_required)
      "
      to="/planning/suggestions"
      class="attention-link"
    >
      <strong>Навчальний план потребує уваги</strong>
      <span>Переглянути пропозиції відновлення →</span>
    </RouterLink>
    <div class="study-agenda">
      <AppCard v-if="!sessions.loading.value && !sessions.error.value" title="Сьогодні">
        <EmptyState
          v-if="!todaySessions.length"
          title="На сьогодні самостійного навчання не заплановано"
        />
        <SessionCard
          v-for="session in visibleToday"
          :key="session.id"
          :session="session"
          :timezone="sessions.data.value?.meta.timezone ?? auth.user?.timezone ?? 'UTC'"
        />
        <PageNavigation
          v-if="todayLast > 1"
          compact
          aria-label="Сторінки сесій сьогодні"
          :current="todayPage"
          :last="todayLast"
          :total="todaySessions.length"
          @page="todayPage = $event"
        />
      </AppCard>
      <AppCard title="Далі цього тижня">
        <template #action>
          <RouterLink to="/planning/sessions">Усі сесії та історія →</RouterLink>
        </template>
        <LoadingState v-if="sessions.loading.value" />
        <ErrorState
          v-else-if="sessions.error.value"
          :error="sessions.error.value"
          retry
          @retry="sessions.reload"
        />
        <template v-else>
          <EmptyState
            v-if="!laterSessions.length"
            title="На інші дні цього тижня сесій немає"
            description="Вкажіть доступний час і перегляньте новий план перед збереженням."
          />
          <SessionCard
            v-for="session in visibleLater"
            :key="session.id"
            :session="session"
            :timezone="sessions.data.value?.meta.timezone ?? auth.user?.timezone ?? 'UTC'"
          />
          <PageNavigation
            v-if="laterLast > 1"
            compact
            aria-label="Сторінки сесій далі цього тижня"
            :current="laterPage"
            :last="laterLast"
            :total="laterSessions.length"
            @page="laterPage = $event"
          />
        </template>
      </AppCard>
    </div>
    <div class="planning-shortcuts">
      <RouterLink to="/planning/availability">
        <strong>Коли я можу навчатися?</strong>
        <span>Доступність і вільний час</span>
      </RouterLink>
      <RouterLink to="/planning/suggestions">
        <strong>Що потрібно перенести?</strong>
        <span>Пропозиції відновлення</span>
      </RouterLink>
      <RouterLink to="/planning/workload">
        <strong>Чи вистачить часу?</strong>
        <span>Навантаження та дедлайни</span>
      </RouterLink>
    </div>
  </div>
</template>
