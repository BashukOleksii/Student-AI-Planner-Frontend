<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { useCurrentSemester } from '@/composables/useCurrentSemester'
import { semesterScheduleImportsApi } from '@/api/semesterScheduleImports'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { weeklyRuleDays } from '@/utils/semesterSchedule'
import { importReturnId } from '@/utils/scheduleImport'
import type { Parity } from '@/types/semesterSchedule'
import SemesterImportReceipt from '@/components/schedule/SemesterImportReceipt.vue'
import SemesterRuleCard from '@/components/schedule/SemesterRuleCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const list = useResource(semesterSchedulesApi.list)
const { schedule, parity, status, candidates } = useCurrentSemester(() => list.data.value ?? [])
const selection = computed(() => schedule.value?.id)
const pattern = ref<Parity>('numerator')
watch(
  [selection, parity],
  () => {
    pattern.value = parity.value ?? 'numerator'
  },
  { immediate: true },
)
// Consume only the explicit import return; normal visits never fetch the latest receipt.
const receiptId = importReturnId(route.query.receipt)
onMounted(() => {
  if (receiptId)
    void router.replace({ path: route.path, query: { ...route.query, receipt: undefined } })
})
const receiptResource = useResource((signal) =>
  receiptId ? semesterScheduleImportsApi.get(receiptId, signal) : Promise.resolve(null),
)
const receipt = computed(() => receiptResource.data.value?.receipt)
const rules = useResource(
  (signal) =>
    selection.value ? semesterSchedulesApi.rules(selection.value, signal) : Promise.resolve(null),
  [selection],
)
const days = computed(() => weeklyRuleDays(rules.data.value?.data ?? [], pattern.value))
</script>

<template>
  <div class="page-workspace page-calendar semester-template">
    <header class="page-heading">
      <div>
        <h1>Семестровий розклад</h1>
        <p class="muted">Регулярні навчальні заняття протягом семестру</p>
      </div>
      <div class="actions">
        <RouterLink
          v-if="selection"
          :to="`/schedule/semesters/${selection}`"
          class="button primary"
        >
          Редагувати розклад
        </RouterLink>
        <RouterLink to="/schedule/semester-import" class="button secondary">
          Імпорт семестру з Excel
        </RouterLink>
      </div>
    </header>
    <ErrorState
      v-if="receiptResource.error.value"
      :error="receiptResource.error.value"
      retry
      @retry="receiptResource.reload"
    />
    <SemesterImportReceipt
      v-if="receipt"
      :receipt="receipt"
      :timezone="auth.user?.timezone ?? 'UTC'"
    />
    <LoadingState v-if="list.loading.value" />
    <ErrorState v-else-if="list.error.value" :error="list.error.value" retry @retry="list.reload" />
    <template v-else-if="list.data.value">
      <p class="semester-week-status" role="status">{{ status }}</p>
      <EmptyState
        v-if="!schedule"
        :title="
          candidates.length > 1
            ? 'Потрібно уточнити поточний розклад'
            : 'Семестровий розклад ще не додано'
        "
        :description="
          candidates.length > 1
            ? 'Перевірте навчальні періоди та розклади нижче. Жоден із них не вибрано автоматично.'
            : 'Імпортуйте актуальний семестр з Excel. Історичні та майбутні розклади збережено.'
        "
      />
      <template v-else>
        <div class="section-heading semester-heading">
          <h2>{{ schedule.academic_period.name }} · {{ schedule.group_name }}</h2>
          <div class="segmented" aria-label="Парність тижневого шаблону">
            <button
              type="button"
              :aria-pressed="pattern === 'numerator'"
              @click="pattern = 'numerator'"
            >
              Чисельник
            </button>
            <button
              type="button"
              :aria-pressed="pattern === 'denominator'"
              @click="pattern = 'denominator'"
            >
              Знаменник
            </button>
          </div>
        </div>
        <LoadingState v-if="rules.loading.value" />
        <ErrorState
          v-else-if="rules.error.value"
          :error="rules.error.value"
          retry
          @retry="rules.reload"
        />
        <div v-else-if="rules.data.value" class="schedule-days week-view">
          <AppCard
            v-for="day in days"
            :key="day.weekday"
            :title="day.label"
            class="schedule-day-card"
          >
            <EmptyState v-if="!day.pairs.length" compact title="Занять немає" />
            <div
              v-for="pair in day.pairs"
              :key="pair.number"
              class="weekly-pair-group"
              :aria-label="`Пара ${pair.number}`"
            >
              <SemesterRuleCard v-for="rule in pair.lessons" :key="rule.id" :rule="rule" />
            </div>
          </AppCard>
        </div>
      </template>
      <details v-if="list.data.value.length" class="secondary-disclosure semester-archive">
        <summary>Історія та налаштування розкладів</summary>
        <p class="helper">Минулі та майбутні семестри доступні для перегляду й редагування.</p>
        <ul>
          <li v-for="item in list.data.value" :key="item.id">
            <RouterLink :to="`/schedule/semesters/${item.id}`" class="text-link">
              {{ item.academic_period.name }} · {{ item.group_name }} ·
              {{ item.academic_period.starts_on }} — {{ item.academic_period.ends_on }}
            </RouterLink>
          </li>
        </ul>
        <RouterLink to="/academic/periods" class="text-link">Навчальні періоди</RouterLink>
      </details>
    </template>
  </div>
</template>
