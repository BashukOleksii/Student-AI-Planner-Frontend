<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fieldErrors } from '@/api/client'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { useSemesterPeriods } from '@/composables/useSemesterPeriods'
import { useSemesterManagement } from '@/composables/useSemesterManagement'
import { useSemesterMutation } from '@/composables/useSemesterMutation'
import { useResource } from '@/composables/useResource'
import { calendarDate, changedFields, patterns } from '@/utils/semesterSchedule'
import type { Parity, SemesterSettings } from '@/types/semesterSchedule'
import AppCard from '@/components/ui/AppCard.vue'
import FormSection from '@/components/ui/FormSection.vue'
import AppButton from '@/components/ui/AppButton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormField from '@/components/ui/FormField.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import SemesterMutationNotice from '@/components/schedule/SemesterMutationNotice.vue'
import SemesterParityFields from '@/components/schedule/SemesterParityFields.vue'
import SemesterPeriodField from '@/components/schedule/SemesterPeriodField.vue'

const id = Number(useRoute().params.id) || null
const router = useRouter()
const management = id ? useSemesterManagement(id) : null
const { busy, dirty, error, blocked, review, run } = management ?? useSemesterMutation()
const periods = useSemesterPeriods(!id)
const schedules = useResource((signal) =>
  id ? Promise.resolve([]) : semesterSchedulesApi.list(signal),
)
const current = computed(() => management?.state.value?.data.schedule)
const period = ref<number | null>(null)
const group = ref('')
const anchor = ref('')
const parity = ref<Parity | ''>('')
const success = ref('')
let baseline: SemesterSettings | null = null
const errors = computed(() => fieldErrors(error.value))
function fill(settings: SemesterSettings) {
  baseline = {
    group_name: settings.group_name,
    parity_anchor_on: settings.parity_anchor_on,
    first_week_parity: settings.first_week_parity,
  }
  group.value = settings.group_name
  anchor.value = settings.parity_anchor_on
  parity.value = settings.first_week_parity
  dirty.value = false
}
watch(current, (settings) => {
  if (settings && !dirty.value) fill(settings)
})
function markDirty() {
  dirty.value = true
  success.value = ''
}
async function save() {
  if (!group.value.trim() || !calendarDate(anchor.value) || !parity.value) return
  success.value = ''
  const body = {
    group_name: group.value.trim(),
    parity_anchor_on: anchor.value,
    first_week_parity: parity.value,
  }
  if (management && id && baseline) {
    const changes = changedFields(baseline, body)
    if (!Object.keys(changes).length) return
    if (await management.save((token) => semesterSchedulesApi.update(id, token, changes)))
      success.value = 'Налаштування збережено.'
  } else if (period.value) {
    const result = await run(() =>
      semesterSchedulesApi.create({ ...body, academic_period_id: period.value! }),
    )
    if (result) await router.replace(`/schedule/semesters/${result.data.schedule.id}`)
  }
}
async function reload() {
  if (management) {
    await management.resource.reload()
    return
  }
  await schedules.reload()
  if (!schedules.data.value) return
  const existing = schedules.data.value.find((item) => item.academic_period.id === period.value)
  if (existing) {
    dirty.value = false
    blocked.value = null
    await router.replace(`/schedule/semesters/${existing.id}`)
  } else {
    blocked.value = null
    review.value = true
    error.value = null
  }
}
</script>
<template>
  <div class="page-workspace page-editor">
    <header class="page-heading">
      <div>
        <RouterLink :to="id ? `/schedule/semesters/${id}` : '/schedule'" class="text-link">
          ← {{ id ? 'Редагувати розклад' : 'Семестровий розклад' }}
        </RouterLink>
        <h1>{{ id ? 'Налаштування семестру' : 'Створити семестровий розклад' }}</h1>
        <p class="helper">Межі семестру та заклад визначає навчальний період.</p>
      </div>
    </header>
    <LoadingState
      v-if="periods.loading.value || schedules.loading.value || management?.resource.loading.value"
    />
    <ErrorState
      v-if="periods.error.value"
      :error="periods.error.value"
      retry
      @retry="periods.reload"
    />
    <ErrorState
      v-if="schedules.error.value"
      :error="schedules.error.value"
      retry
      @retry="schedules.reload"
    />
    <ErrorState
      v-if="management?.resource.error.value"
      :error="management.resource.error.value"
      retry
      @retry="management.resource.reload"
    />
    <SemesterMutationNotice
      :blocked="blocked"
      :review="review"
      :busy="busy || schedules.loading.value || !!management?.resource.loading.value"
      :error="error"
      @reload="reload"
      @reviewed="review = false"
    />
    <p v-if="success" role="status">{{ success }}</p>
    <AppCard v-if="current || (!id && periods.data.value && schedules.data.value)">
      <template v-if="current">
        <p>{{ current.academic_period.name }} · {{ current.education_institution.name }}</p>
        <p class="helper">
          Збережено: {{ current.group_name }} · {{ current.parity_anchor_on }} ·
          {{ patterns[current.first_week_parity] }}
        </p>
        <p class="helper">
          Парність визначає появу щотижневих пар. Збережені заміни та робочі суботи залишаються
          незалежними.
        </p>
      </template>
      <form class="semester-form" @submit.prevent="save" @input="markDirty" @change="markDirty">
        <fieldset class="schedule-fieldset semester-form" :disabled="busy">
          <SemesterPeriodField
            v-if="!id && periods.data.value"
            v-model="period"
            :periods="periods.data.value.periods"
            :institutions="periods.data.value.institutions"
            :exclude="schedules.data.value?.map((item) => item.academic_period.id)"
            :errors="errors.academic_period_id"
          />
          <FormField id="semester-group" label="Група" :errors="errors.group_name">
            <template #default="{ id: field, invalid, describedby }">
              <input
                :id="field"
                v-model="group"
                maxlength="255"
                required
                :aria-invalid="invalid"
                :aria-describedby="describedby"
              />
            </template>
          </FormField>
          <FormSection
            title="Як чергуються навчальні тижні"
            description="Оберіть знайомий тиждень і вкажіть, чи це чисельник або знаменник. Далі тижні чергуватимуться автоматично."
          >
            <div class="form-grid">
              <SemesterParityFields
                v-model:anchor="anchor"
                v-model:parity="parity"
                :errors="errors"
              />
            </div>
          </FormSection>
        </fieldset>
        <div class="actions">
          <AppButton
            type="submit"
            variant="primary"
            :busy="busy"
            :disabled="
              !!blocked ||
              review ||
              !!management?.resource.loading.value ||
              !!management?.resource.error.value ||
              (id ? !dirty : !period)
            "
          >
            {{ id ? 'Зберегти налаштування' : 'Створити семестр' }}
          </AppButton>
          <AppButton v-if="current && dirty" :disabled="busy" @click="fill(current)">
            Відновити збережені значення
          </AppButton>
          <RouterLink
            v-if="current"
            :to="{
              path: '/schedule',
              query: {
                semester: String(id),
                date: current.academic_period.starts_on,
                view: 'week',
              },
            }"
            class="text-link"
          >
            Переглянути розклад
          </RouterLink>
        </div>
      </form>
    </AppCard>
  </div>
</template>
