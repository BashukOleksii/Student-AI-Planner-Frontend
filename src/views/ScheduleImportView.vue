<script setup lang="ts">
import { ref, onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'
import { academicApi } from '@/api/academic'
import { scheduleImportsApi } from '@/api/scheduleImports'
import { ApiError, fieldErrors } from '@/api/client'
import { useResource } from '@/composables/useResource'
import { validateScheduleFile } from '@/utils/scheduleImport'
import ImportFormatGuide from '@/components/schedule/ImportFormatGuide.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
const router = useRouter(),
  periods = useResource(academicApi.periods.list)
const period = ref<number | null>(null),
  file = ref<File | null>(null),
  busy = ref(false),
  error = ref<unknown>(null),
  localError = ref(''),
  uncertain = ref(false)
let active = true
onScopeDispose(() => {
  active = false
  file.value = null
})
function selectFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
  localError.value = ''
}
async function upload() {
  if (busy.value || uncertain.value) return
  localError.value = validateScheduleFile(file.value, period.value)
  if (localError.value) return
  busy.value = true
  error.value = null
  try {
    const response = await scheduleImportsApi.upload(period.value!, file.value!)
    if (active) await router.push(`/schedule/imports/${response.data.id}`)
  } catch (e) {
    if (active) {
      error.value = e
      if (e instanceof ApiError && [0, 500, 502, 503].includes(e.status)) uncertain.value = true
    }
  } finally {
    if (active) busy.value = false
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <RouterLink to="/schedule" class="text-link">← До розкладу</RouterLink>
      <h1>Імпорт розкладу з Excel</h1>
      <p class="muted">
        Завантаження → огляд → виправлення довідників → повторна перевірка → явне підтвердження.
      </p>
    </div>
  </header>
  <AppCard><ImportFormatGuide /></AppCard>
  <AppCard title="Завантажити XLSX">
    <LoadingState v-if="periods.loading.value" />
    <ErrorState
      v-else-if="periods.error.value"
      :error="periods.error.value"
      retry
      @retry="periods.reload"
    />
    <form v-else class="stack" @submit.prevent="upload">
      <fieldset :disabled="busy || uncertain" class="schedule-fieldset">
        <FormField
          id="import-period"
          v-slot="a"
          label="Навчальний період імпорту *"
          :errors="fieldErrors(error).academic_period_id"
        >
          <select
            :id="a.id"
            v-model="period"
            required
            :aria-invalid="a.invalid"
            :aria-describedby="a.describedby"
          >
            <option :value="null" disabled>Оберіть період</option>
            <option v-for="p in periods.data.value?.data" :key="p.id" :value="p.id">
              {{ p.name }} · {{ p.starts_on }} — {{ p.ends_on }}
            </option>
          </select>
        </FormField>
        <p v-if="!periods.data.value?.data.length" class="helper">
          Спершу створіть власний навчальний період.
        </p>
        <FormField
          id="schedule-file"
          v-slot="a"
          label="Файл розкладу XLSX *"
          hint="Лише підтримуваний формат, не більше 5 MiB (5120 KiB). MIME-тип перевіряє сервер."
          :errors="fieldErrors(error).schedule_file"
        >
          <input
            :id="a.id"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            :aria-invalid="a.invalid"
            :aria-describedby="a.describedby"
            @change="selectFile"
          />
        </FormField>
        <p v-if="file" class="helper">
          {{ file.name }} · {{ file.size.toLocaleString('uk-UA') }} байтів
        </p>
      </fieldset>
      <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
      <FormNotice :error="error" />
      <p v-if="uncertain" role="alert" class="schedule-warning">
        Відповідь завантаження втрачено або обробку не підтверджено. Пакет міг бути збережений;
        повтор не запускався. Якщо маєте ID пакета, відкрийте його за прямим посиланням. Нове
        завантаження створить окремий огляд, але не застосує заняття автоматично.
      </p>
      <AppButton
        type="submit"
        variant="primary"
        :busy="busy"
        :disabled="uncertain || !periods.data.value?.data.length"
      >
        Завантажити й перевірити
      </AppButton>
    </form>
    <RouterLink to="/academic/periods" class="text-link">
      Керувати навчальними періодами →
    </RouterLink>
  </AppCard>
  <p class="helper">
    Імпорт не замінює весь семестр і не видаляє заняття, яких немає у файлі. Дублікати й операції
    визначає сервер.
  </p>
</template>
