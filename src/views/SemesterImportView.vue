<script setup lang="ts">
import ImportSteps from '@/components/schedule/ImportSteps.vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fieldErrors } from '@/api/client'
import { semesterScheduleImportsApi } from '@/api/semesterScheduleImports'
import { useSemesterMutation } from '@/composables/useSemesterMutation'
import { useSemesterPeriods } from '@/composables/useSemesterPeriods'
import { validateScheduleFile } from '@/utils/scheduleImport'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ImportFormatGuide from '@/components/schedule/ImportFormatGuide.vue'
import SemesterPeriodField from '@/components/schedule/SemesterPeriodField.vue'

const router = useRouter()
const periods = useSemesterPeriods()
const { busy, blocked, dirty, error, run } = useSemesterMutation()
const period = ref<number | null>(null)
const file = ref<File | null>(null)
const fileKey = ref(0)
const localError = ref('')
const errors = computed(() => fieldErrors(error.value))
function selectFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
  dirty.value = true
  localError.value = ''
}
async function upload() {
  localError.value = validateScheduleFile(file.value, period.value)
  const [selected, workbook] = [period.value, file.value] as const
  if (localError.value || !workbook || !selected) return
  const result = await run(() => semesterScheduleImportsApi.upload(selected, workbook))
  if (result) await router.replace(`/schedule/semester-imports/${result.id}`)
}
function startAgain() {
  file.value = null
  fileKey.value++
  blocked.value = null
  error.value = null
}
</script>
<template>
  <header class="page-heading">
    <div>
      <RouterLink to="/schedule" class="text-link">← Семестровий розклад</RouterLink>
      <h1>Імпорт семестру з Excel</h1>
      <p class="helper">
        Спочатку перегляньте щотижневі пари та запропоновані зміни. Розклад зміниться після
        підтвердження.
      </p>
    </div>
    <RouterLink to="/schedule/import" class="text-link">Імпорт датованих занять</RouterLink>
  </header>
  <ImportSteps stage="upload" />
  <AppCard><ImportFormatGuide semester /></AppCard>
  <LoadingState v-if="periods.loading.value" />
  <ErrorState
    v-else-if="periods.error.value"
    :error="periods.error.value"
    retry
    @retry="periods.reload"
  />
  <AppCard v-else-if="periods.data.value" title="Період і файл">
    <FormNotice :error="error" />
    <form
      class="semester-form"
      @submit.prevent="upload"
      @input="dirty = true"
      @change="dirty = true"
    >
      <fieldset class="schedule-fieldset semester-form" :disabled="busy || !!blocked">
        <SemesterPeriodField
          v-model="period"
          :periods="periods.data.value.periods"
          :institutions="periods.data.value.institutions"
          :errors="errors.academic_period_id"
        />
        <p class="helper">
          Розклад повторюватиметься до кінця вибраного періоду. Перший тиждень — чисельник;
          наступний — знаменник.
        </p>
        <FormField
          id="semester-file"
          label="Файл розкладу (.xlsx)"
          :errors="localError ? [localError] : errors.schedule_file"
          hint="До 5 МіБ."
        >
          <template #default="{ id: field, invalid, describedby }">
            <input
              :id="field"
              :key="fileKey"
              type="file"
              accept=".xlsx"
              required
              :aria-invalid="invalid"
              :aria-describedby="describedby"
              @change="selectFile"
            />
          </template>
        </FormField>
      </fieldset>
      <div class="actions">
        <AppButton
          type="submit"
          variant="primary"
          :busy="busy"
          :disabled="!file || !period || !!blocked"
        >
          Завантажити для перегляду
        </AppButton>
      </div>
    </form>
    <div v-if="blocked" class="schedule-warning">
      <p role="status">
        Відповідь на завантаження втрачено. Без номера пакета перевірити його неможливо. Нове
        завантаження створить окремий огляд для підтвердження.
      </p>
      <AppButton @click="startAgain">Підготувати нове завантаження</AppButton>
    </div>
  </AppCard>
</template>
