<script setup lang="ts">
import { ref, computed, onScopeDispose, watch } from 'vue'
import { useRoute } from 'vue-router'
import { scheduleImportsApi, ImportPreviewChanged } from '@/api/scheduleImports'
import { academicApi } from '@/api/academic'
import { scheduleApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { today, localDate } from '@/utils/dates'
import type { ScheduleImportBatch } from '@/types/scheduleImport'
import ImportBatchSummary from '@/components/schedule/ImportBatchSummary.vue'
import ImportRowCard from '@/components/schedule/ImportRowCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const id = Number(useRoute().params.id),
  auth = useAuthStore(),
  timezone = computed(() => auth.user?.timezone ?? 'UTC')
const resource = useResource((signal) => scheduleImportsApi.get(id, signal)),
  periods = useResource(academicApi.periods.list)
const batch = ref<ScheduleImportBatch | null>(null),
  busy = ref(false),
  confirming = ref(false),
  reviewed = ref(false),
  error = ref<unknown>(null),
  refreshError = ref<unknown>(null),
  notice = ref(''),
  uncertain = ref(false)
let active = true
onScopeDispose(() => {
  active = false
})
watch(resource.data, (value) => {
  if (value) {
    batch.value = value.data
    reviewed.value = false
  }
})
const eligible = computed(
  () => batch.value?.status === 'uploaded' || batch.value?.status === 'validated',
)
const committable = computed(
  () => batch.value?.status === 'validated' && batch.value.invalid_rows === 0,
)
const period = computed(() =>
  periods.data.value?.data.find((p) => p.id === batch.value?.academic_period_id),
)
const date = computed(() => {
  const first = batch.value?.rows.find((r) => r.starts_at_utc)?.starts_at_utc
  try {
    return first ? localDate(first, timezone.value) : today(timezone.value)
  } catch {
    return today(timezone.value)
  }
})
async function refreshSchedule() {
  try {
    await scheduleApi('day', date.value)
  } catch (e) {
    if (active) refreshError.value = e
  }
}
async function recover() {
  if (busy.value || resource.loading.value) return
  busy.value = true
  error.value = null
  try {
    const response = await scheduleImportsApi.get(id)
    if (!active) return
    batch.value = response.data
    uncertain.value = false
    confirming.value = false
    reviewed.value = false
    notice.value =
      response.data.status === 'committed'
        ? 'За збереженим станом пакет уже застосовано. Повторного застосування не було.'
        : 'Актуальний пакет отримано. Перегляньте його знову перед окремим рішенням; запит не повторювався.'
    if (response.data.status === 'committed') await refreshSchedule()
  } catch (e) {
    if (active) error.value = e
  } finally {
    if (active) busy.value = false
  }
}
async function revalidate() {
  if (busy.value || !eligible.value || uncertain.value) return
  busy.value = true
  error.value = null
  notice.value = ''
  reviewed.value = false
  try {
    const response = await scheduleImportsApi.revalidate(id)
    if (active) {
      batch.value = response.data
      notice.value =
        'Огляд перевірено повторно. Заняття не змінено; автоматичного підтвердження немає.'
    }
  } catch (e) {
    if (active) {
      error.value = e
      if (e instanceof ApiError && [0, 500, 502, 503].includes(e.status)) uncertain.value = true
    }
  } finally {
    if (active) busy.value = false
  }
}
function openConfirmation() {
  if (!busy.value && committable.value && !uncertain.value) {
    reviewed.value = false
    error.value = null
    confirming.value = true
  }
}
async function commit() {
  if (busy.value || !committable.value || !reviewed.value || uncertain.value) return
  busy.value = true
  error.value = null
  refreshError.value = null
  let reconcile = false
  try {
    const response = await scheduleImportsApi.commit(id)
    if (active) {
      batch.value = response.data
      confirming.value = false
      reviewed.value = false
      notice.value =
        response.data.status === 'committed'
          ? 'Пакет застосовано. Нижче — збережені операції; не кожен рядок створює заняття.'
          : 'Отримано актуальний стан пакета. Перевірте його перед наступною дією.'
      if (response.data.status === 'committed') await refreshSchedule()
    }
  } catch (e) {
    if (!active) return
    confirming.value = false
    reviewed.value = false
    if (e instanceof ImportPreviewChanged) {
      batch.value = e.batch
      notice.value =
        'Попередньо переглянутий результат змінився. Операції й лічильники оновлено; занять цим запитом не змінено. Перегляньте новий огляд і підтвердьте окремо.'
    } else {
      error.value = e
      if (e instanceof ApiError && [0, 409, 500, 502, 503].includes(e.status)) {
        uncertain.value = true
        notice.value =
          'Відповідь підтвердження не встановлено. Перевіряємо збережений стан без повторного застосування.'
        reconcile = true
      }
    }
  } finally {
    if (active) busy.value = false
  }
  if (active && reconcile) await recover()
}
</script>
<template>
  <header class="page-heading">
    <div>
      <RouterLink to="/schedule/import" class="text-link">← Завантажити інший файл</RouterLink>
      <h1>Огляд імпорту №{{ id }}</h1>
      <p class="muted">
        Збережені конкретні появи занять, а не правила повторення чи фізичні рядки Excel.
      </p>
    </div>
    <AppButton :disabled="busy || resource.loading.value" @click="recover">
      Перевірити стан пакета
    </AppButton>
  </header>
  <LoadingState v-if="resource.loading.value" />
  <ErrorState
    v-else-if="resource.error.value && !batch"
    :error="resource.error.value"
    retry
    @retry="resource.reload"
  />
  <template v-if="batch">
    <AppCard>
      <ImportBatchSummary :batch="batch" :period="period" :timezone="timezone" />
      <ErrorState
        v-if="periods.error.value"
        :error="periods.error.value"
        retry
        @retry="periods.reload"
      />
    </AppCard>
    <p v-if="notice" role="status" class="schedule-warning">{{ notice }}</p>
    <FormNotice :error="error" />
    <div v-if="refreshError">
      <p>Пакет застосовано, але поточний розклад не вдалося оновити.</p>
      <ErrorState :error="refreshError" retry @retry="refreshSchedule" />
    </div>
    <AppCard v-if="eligible" title="Виправлення академічних посилань">
      <p>
        Назви зіставляються точно після нормалізації тексту файлу. Пропущені предмети й викладачі не
        створюються автоматично. Кілька однакових імен викладачів можуть бути неоднозначними;
        довільного прив’язування рядків немає.
      </p>
      <div class="actions">
        <RouterLink
          :to="{ path: '/academic/subjects', query: { import_batch: id } }"
          class="text-link"
        >
          Виправити предмети
        </RouterLink>
        <RouterLink
          :to="{ path: '/academic/teachers', query: { import_batch: id } }"
          class="text-link"
        >
          Виправити викладачів
        </RouterLink>
        <RouterLink
          :to="{ path: '/academic/periods', query: { import_batch: id } }"
          class="text-link"
        >
          Навчальні періоди
        </RouterLink>
      </div>
      <p class="helper">
        Після виправлень поверніться сюди й запустіть повторну перевірку. Вона оновлює посилання та
        операції, але не перечитує XLSX і не розгортає дати заново. Для іншого періоду чи часового
        поясу завантажте файл ще раз. Чинні власні прив’язки можуть зберегтися після перейменування.
      </p>
      <div class="actions">
        <AppButton :busy="busy && !confirming" :disabled="busy || uncertain" @click="revalidate">
          Повторно перевірити
        </AppButton>
        <AppButton
          v-if="committable"
          variant="primary"
          :disabled="busy || uncertain"
          @click="openConfirmation"
        >
          Переглянути підтвердження імпорту
        </AppButton>
      </div>
    </AppCard>
    <p v-if="batch.status === 'failed'" class="schedule-warning">
      Пакет збережено, але обробка не вдалася. Його не можна підтвердити чи повторно перевірити.
      Виправте формат і завантажте новий файл.
    </p>
    <p v-if="batch.status === 'uploaded'" class="schedule-warning">
      Спершу виправте всі помилки й повторно перевірте огляд. Цей пакет ще не можна застосувати.
    </p>
    <p v-if="uncertain" role="alert" class="schedule-warning">
      Стан операції невідомий. Зміни заблоковано до успішного читання актуального пакета.
    </p>
    <AppCard title="Повний огляд появ і операцій">
      <p class="helper">
        Нові заняття отримують технічний тип «Заняття». Оновлення й відновлення зберігають
        виправлений тип; збереження стану не змінює заняття, а дублікати не створюють нових занять.
        Відсутні у файлі заняття не видаляються.
      </p>
      <p v-if="!batch.rows.length">
        Появ у цьому пакеті немає. Перевірений порожній пакет не створить занять.
      </p>
      <ImportRowCard
        v-for="row in batch.rows"
        :key="row.row_number"
        :row="row"
        :timezone="timezone"
      />
    </AppCard>
    <div class="actions">
      <RouterLink :to="{ path: '/schedule', query: { date } }" class="button primary">
        Переглянути ефективний розклад
      </RouterLink>
      <RouterLink to="/planning" class="button secondary">До планування</RouterLink>
    </div>
  </template>
  <AppModal
    v-if="confirming && batch"
    title="Підтвердити імпорт розкладу?"
    :busy="busy"
    @close="confirming = false"
  >
    <ImportBatchSummary :batch="batch" :period="period" :timezone="timezone" />
    <p class="schedule-warning">
      Сервер атомарно застосує перевірені операції: створення, оновлення та відновлення, показані в
      огляді. Збережені або дубльовані рядки не є новими заняттями. Це не заміна всього семестру.
      При зміні огляду потрібне нове рішення.
    </p>
    <label class="schedule-consent">
      <input v-model="reviewed" type="checkbox" :disabled="busy" />
      Я переглянув усі рядки, дублікати та наслідки операцій цього пакета
    </label>
    <FormNotice :error="error" />
    <div class="actions">
      <AppButton :disabled="busy" @click="confirming = false">Повернутися до огляду</AppButton>
      <AppButton variant="primary" :busy="busy" :disabled="!reviewed || uncertain" @click="commit">
        Підтвердити імпорт
      </AppButton>
    </div>
  </AppModal>
</template>
