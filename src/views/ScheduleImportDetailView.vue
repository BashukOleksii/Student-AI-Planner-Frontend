<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { scheduleImportsApi } from '@/api/scheduleImports'
import { academicApi } from '@/api/academic'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { localDate, today } from '@/utils/dates'
import ImportBatchSummary from '@/components/schedule/ImportBatchSummary.vue'
import ImportRowCard from '@/components/schedule/ImportRowCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
const id = Number(useRoute().params.id)
const auth = useAuthStore()
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const resource = useResource((signal) => scheduleImportsApi.get(id, signal))
const periods = useResource(academicApi.periods.list)
const batch = computed(() => resource.data.value?.data)
const period = computed(() =>
  periods.data.value?.data.find((p) => p.id === batch.value?.academic_period_id),
)
const date = computed(() => {
  const first = batch.value?.rows.find((row) => row.starts_at_utc)?.starts_at_utc
  return first ? localDate(first, timezone.value) : today(timezone.value)
})
</script>
<template>
  <div class="page-workspace page-workflow">
    <header class="page-heading">
      <div>
        <RouterLink :to="{ path: '/schedule/legacy', query: { date } }" class="text-link">
          ← До окремих занять
        </RouterLink>
        <h1>Історія імпорту занять</h1>
        <p class="muted">
          Збережений імпорт доступний лише для перегляду. Нові окремі заняття додаються вручну.
        </p>
      </div>
    </header>
    <LoadingState v-if="resource.loading.value" />
    <ErrorState
      v-else-if="resource.error.value"
      :error="resource.error.value"
      retry
      @retry="resource.reload"
    />
    <template v-else-if="batch">
      <AppCard>
        <ImportBatchSummary :batch="batch" :period="period" :timezone="timezone" />
        <ErrorState
          v-if="periods.error.value"
          :error="periods.error.value"
          retry
          @retry="periods.reload"
        />
      </AppCard>
      <AppCard title="Збережені рядки імпорту">
        <p v-if="!batch.rows.length" class="helper">У цьому імпорті немає занять.</p>
        <ImportRowCard
          v-for="row in batch.rows"
          :key="row.row_number"
          :row="row"
          :timezone="timezone"
        />
      </AppCard>
    </template>
  </div>
</template>
