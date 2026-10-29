<script setup lang="ts">
import { ref, watch } from 'vue'
import { planningApi } from '@/api/planning'
import { fieldErrors } from '@/api/client'
import { useResource } from '@/composables/useResource'
import { preferenceFields, nullableMinutes } from '@/utils/planning'
import type { PlanningPreferences } from '@/types/planning'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
const resource = useResource((signal) => planningApi.preferences(signal))
const values = ref<Record<keyof PlanningPreferences, string>>({
  max_daily_study_minutes: '',
  max_weekly_study_minutes: '',
  preferred_break_minutes: '',
  min_session_minutes: '',
  max_session_minutes: '',
})
watch(resource.data, (value) => {
  if (value)
    for (const { key } of preferenceFields) values.value[key] = value.data[key]?.toString() ?? ''
})
const busy = ref(false),
  error = ref<unknown>(null),
  localError = ref(''),
  success = ref(false)
async function save() {
  if (busy.value) return
  error.value = null
  localError.value = ''
  success.value = false
  let body: PlanningPreferences
  try {
    body = {
      max_daily_study_minutes: nullableMinutes(values.value.max_daily_study_minutes),
      max_weekly_study_minutes: nullableMinutes(values.value.max_weekly_study_minutes),
      preferred_break_minutes: nullableMinutes(values.value.preferred_break_minutes),
      min_session_minutes: nullableMinutes(values.value.min_session_minutes),
      max_session_minutes: nullableMinutes(values.value.max_session_minutes),
    }
    if (
      body.min_session_minutes !== null &&
      body.max_session_minutes !== null &&
      body.min_session_minutes > body.max_session_minutes
    )
      throw new Error('Максимальна сесія має бути не коротшою за мінімальну.')
    if (
      body.max_daily_study_minutes !== null &&
      body.max_weekly_study_minutes !== null &&
      body.max_daily_study_minutes > body.max_weekly_study_minutes
    )
      throw new Error('Тижневий ліміт має бути не меншим за денний.')
  } catch (e) {
    localError.value = e instanceof Error ? e.message : ''
    return
  }
  busy.value = true
  try {
    const saved = await planningApi.savePreferences(body)
    for (const { key } of preferenceFields) values.value[key] = saved.data[key]?.toString() ?? ''
    success.value = true
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <p class="eyebrow">ПЛАНУВАННЯ НАВЧАННЯ</p>
      <h1>Вподобання навчання</h1>
    </div>
  </header>
  <PlanningNav />
  <LoadingState v-if="resource.loading.value" />
  <ErrorState
    v-else-if="resource.error.value"
    :error="resource.error.value"
    retry
    @retry="resource.reload"
  />
  <AppCard v-else-if="resource.data.value" title="Обмеження та тривалість">
    <p class="muted">
      Порожнє поле означає, що обмеження не налаштоване. Ці значення не гарантують виділення певного
      часу.
    </p>
    <form class="stack" @submit.prevent="save">
      <fieldset :disabled="busy" class="planning-fieldset">
        <div class="form-grid">
          <FormField
            v-for="field in preferenceFields"
            :id="field.key"
            :key="field.key"
            v-slot="a"
            :label="field.label"
            :hint="field.hint"
            :errors="fieldErrors(error)[field.key]"
          >
            <input
              :id="a.id"
              v-model="values[field.key]"
              inputmode="numeric"
              type="number"
              min="1"
              max="65535"
              step="1"
              :aria-invalid="a.invalid"
              :aria-describedby="a.describedby"
            />
          </FormField>
        </div>
      </fieldset>
      <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
      <FormNotice :error="error" />
      <p v-if="success" role="status">Вподобання збережено.</p>
      <AppButton type="submit" variant="primary" :busy="busy">Зберегти вподобання</AppButton>
    </form>
  </AppCard>
</template>
