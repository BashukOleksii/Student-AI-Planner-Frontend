<script setup lang="ts">
import { useWorkLabels } from '@/composables/useWorkLabels'
import { computed } from 'vue'
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
import DetailSection from '@/components/ui/DetailSection.vue'
const auth = useAuthStore()
const date = computed(() => today(auth.user?.timezone ?? 'UTC'))
const sessions = useResource(
  (signal) =>
    studySessionsApi.list({ start_date: date.value, end_date: addDays(date.value, 6) }, signal),
  [date],
)
const attention = usePlanningAttentionStore()
const upcoming = computed(
  () => sessions.data.value?.data.filter((item) => item.status === 'planned') ?? [],
)
useWorkLabels(() => sessions.data.value)
const availability = useResource((signal) => planningApi.availability(signal))
</script>
<template>
  <div class="page-workspace page-planning">
    <header class="page-heading">
      <div>
        <p class="eyebrow">Самостійне навчання</p>
        <h1>Мій план</h1>
        <p class="muted">Ваші сесії на найближчий тиждень і наступний крок.</p>
      </div>
      <RouterLink to="/planning/preview" class="button primary">Створити план</RouterLink>
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
          v-if="
            !upcoming.some(
              (session) =>
                localDate(
                  session.starts_at,
                  sessions.data.value?.meta.timezone ?? auth.user?.timezone ?? 'UTC',
                ) === date,
            )
          "
          title="На сьогодні самостійного навчання не заплановано"
        />
        <SessionCard
          v-for="session in upcoming.filter(
            (session) =>
              localDate(
                session.starts_at,
                sessions.data.value?.meta.timezone ?? auth.user?.timezone ?? 'UTC',
              ) === date,
          )"
          :key="session.id"
          :session="session"
          :timezone="sessions.data.value?.meta.timezone ?? auth.user?.timezone ?? 'UTC'"
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
            v-if="
              !upcoming.some(
                (session) =>
                  localDate(
                    session.starts_at,
                    sessions.data.value?.meta.timezone ?? auth.user?.timezone ?? 'UTC',
                  ) !== date,
              )
            "
            title="На інші дні цього тижня сесій немає"
            description="Вкажіть доступний час і перегляньте новий план перед збереженням."
          />
          <SessionCard
            v-for="session in upcoming.filter(
              (session) =>
                localDate(
                  session.starts_at,
                  sessions.data.value?.meta.timezone ?? auth.user?.timezone ?? 'UTC',
                ) !== date,
            )"
            :key="session.id"
            :session="session"
            :timezone="sessions.data.value?.meta.timezone ?? auth.user?.timezone ?? 'UTC'"
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
    <DetailSection title="Налаштувати навчання та змінити план">
      <div class="actions">
        <RouterLink to="/planning/preferences">Вподобання</RouterLink>
        <RouterLink to="/planning/availability">Доступність</RouterLink>
        <RouterLink to="/planning/free-time">Вільний час</RouterLink>
        <RouterLink to="/planning/recovery">Відновлення роботи</RouterLink>
        <RouterLink to="/planning/replanning">Перенести заплановане навчання</RouterLink>
      </div>
    </DetailSection>
    <RouterLink to="/ai" class="button secondary">Обговорити з AI</RouterLink>
  </div>
</template>
