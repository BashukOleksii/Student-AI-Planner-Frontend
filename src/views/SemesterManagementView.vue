<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSemesterManagement } from '@/composables/useSemesterManagement'
import { weeklyRuleDays } from '@/utils/semesterSchedule'
import AppCard from '@/components/ui/AppCard.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import SemesterRuleCard from '@/components/schedule/SemesterRuleCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const id = Number(useRoute().params.id)
const path = `/schedule/semesters/${id}`
const { state, resource } = useSemesterManagement(id)
const days = computed(() => weeklyRuleDays(state.value?.data.weekly_rules ?? []))
</script>
<template>
  <div class="page-workspace semester-editor-workspace">
    <header class="page-heading">
      <div>
        <RouterLink to="/schedule/semester-calendar" class="text-link">
          ← Семестровий розклад
        </RouterLink>
        <h1>Редагувати семестровий розклад</h1>
        <p v-if="state" class="helper">
          {{ state.data.schedule.academic_period.name }} · {{ state.data.schedule.group_name }}
        </p>
      </div>
      <RouterLink :to="`${path}/settings`" class="button secondary">
        Налаштування семестру
      </RouterLink>
    </header>
    <div class="scope-notice">Зміни застосовуються до регулярних занять протягом семестру</div>
    <LoadingState v-if="resource.loading.value" />
    <ErrorState
      v-else-if="resource.error.value"
      :error="resource.error.value"
      retry
      @retry="resource.reload"
    />
    <div v-else-if="state" class="schedule-days week-view regular-editor-days">
      <AppCard v-for="day in days" :key="day.weekday" :title="day.label" class="schedule-day-card">
        <template #action>
          <RouterLink
            :to="`${path}/weekdays/${day.weekday}`"
            class="button secondary day-edit-button"
            :aria-label="`Редагувати: ${day.label}`"
          >
            Редагувати
          </RouterLink>
        </template>
        <EmptyState v-if="!day.pairs.length" compact title="Занять немає" />
        <div v-for="pair in day.pairs" :key="pair.number" class="weekly-pair-group">
          <SemesterRuleCard v-for="rule in pair.lessons" :key="rule.id" :rule="rule" />
        </div>
      </AppCard>
    </div>
  </div>
</template>
