<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { useSemesterManagement } from '@/composables/useSemesterManagement'
import { patterns, weekdays } from '@/utils/semesterSchedule'
import type { SuppressedSlot } from '@/types/semesterSchedule'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import SemesterMutationNotice from '@/components/schedule/SemesterMutationNotice.vue'

const id = Number(useRoute().params.id)
const router = useRouter()
const path = `/schedule/semesters/${id}`
const management = useSemesterManagement(id, async (signal) => {
  const [state, slots] = await Promise.all([
    semesterSchedulesApi.management(id, signal),
    semesterSchedulesApi.suppressions(id, signal),
  ])
  if (state.meta.schedule_token !== slots.meta.schedule_token) throw new ApiError(409)
  return { ...state, data: { ...state.data, suppressed_slots: slots.data } }
})
const { state, resource, busy, dirty, blocked, error, review, run, save } = management
const data = computed(() => state.value?.data)
const slot = ref<SuppressedSlot | null>(null)
const deleting = ref(false)
const notice = ref('')
const unavailable = computed(
  () =>
    busy.value ||
    !!blocked.value ||
    review.value ||
    resource.loading.value ||
    !!resource.error.value,
)
async function removeSlot() {
  if (!slot.value) return
  const slotId = slot.value.id
  notice.value = ''
  const result = await save((token) =>
    semesterSchedulesApi.releaseSuppression(id, slotId, token, true),
  )
  slot.value = null
  if (result)
    notice.value = 'Захист знято. Тепер можна додати пару вручну або повторно перевірити Excel.'
}
async function removeSchedule() {
  if (!state.value || unavailable.value) return
  const token = state.value.meta.schedule_token
  const result = await run(() => semesterSchedulesApi.remove(id, token, true))
  deleting.value = false
  if (result) await router.replace('/schedule/semester-calendar')
}
async function reload() {
  await resource.reload()
  if (
    blocked.value === 'uncertain' &&
    resource.error.value instanceof ApiError &&
    resource.error.value.status === 404
  ) {
    notice.value = 'Семестр більше недоступний. Перевірте список семестрів.'
    blocked.value = null
    dirty.value = false
  }
}
</script>
<template>
  <div class="page-workspace semester-editor-workspace">
    <header class="page-heading">
      <div>
        <RouterLink :to="`${path}/settings`" class="text-link">← Налаштування семестру</RouterLink>
        <h1>Налаштування імпорту</h1>
      </div>
    </header>
    <LoadingState v-if="resource.loading.value" />
    <ErrorState v-if="resource.error.value" :error="resource.error.value" retry @retry="reload" />
    <SemesterMutationNotice
      :blocked="blocked"
      :review="review"
      :busy="busy || resource.loading.value"
      :error="error"
      @reload="reload"
      @reviewed="review = false"
    />
    <p v-if="notice" role="status" class="schedule-warning">{{ notice }}</p>
    <template v-if="data">
      <AppCard id="import-protection" title="Пари, які імпорт не відновить">
        <p>
          Ви прибрали ці регулярні пари вручну. Повторний імпорт не додасть їх знову, доки ви не
          знімете захист. Після зняття захисту пару потрібно додати або імпортувати окремо.
        </p>
        <p v-if="!data.suppressed_slots.length" class="helper">
          Немає видалених пар, захищених від повторного імпорту.
        </p>
        <div
          v-for="item in data.suppressed_slots"
          :key="item.id"
          class="semester-item section-heading semester-heading"
        >
          <span>
            {{ weekdays[item.weekday] }} · пара {{ item.pair_number }} ·
            {{ patterns[item.week_pattern] }}
          </span>
          <AppButton :disabled="unavailable" @click="slot = item">Зняти захист</AppButton>
        </div>
      </AppCard>
      <AppCard title="Видалення семестру" class="danger-zone">
        <p class="helper">
          Видалити можна лише порожній семестр без історії імпорту. Сервер перевіряє правила,
          заміни, захищені слоти та всі пакети імпорту.
        </p>
        <AppButton variant="danger" :disabled="unavailable" @click="deleting = true">
          Видалити семестр
        </AppButton>
      </AppCard>
    </template>
    <ConfirmDialog
      v-if="deleting"
      title="Видалити семестр?"
      :busy="busy"
      @close="deleting = false"
      @confirm="removeSchedule"
    >
      Сервер перевірить залежності. Порожній семестр без історії імпорту буде видалено.
    </ConfirmDialog>
    <ConfirmDialog
      v-if="slot"
      title="Дозволити знову додати цю пару?"
      confirm-label="Зняти захист"
      :busy="busy"
      @close="slot = null"
      @confirm="removeSlot"
    >
      {{ weekdays[slot.weekday] }} · пара {{ slot.pair_number }} ·
      {{ patterns[slot.week_pattern] }}. Видаляється запис захисту. Для створення пари потрібна
      окрема дія.
    </ConfirmDialog>
  </div>
</template>
