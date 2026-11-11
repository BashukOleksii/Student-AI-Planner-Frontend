<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { academicApi } from '@/api/academic'
import { ApiError, fieldErrors } from '@/api/client'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { useResource } from '@/composables/useResource'
import { useSemesterManagement } from '@/composables/useSemesterManagement'
import {
  changedFields,
  lessonInput,
  localMinutes,
  patterns,
  semesterTeacherNames,
  weekdays,
} from '@/utils/semesterSchedule'
import type {
  LessonDefinitionInput,
  Weekday,
  WeekPattern,
  WeeklyLessonRule,
  WeeklyRuleInput,
} from '@/types/semesterSchedule'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormField from '@/components/ui/FormField.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import SemesterLessonFields from '@/components/schedule/SemesterLessonFields.vue'
import SemesterMutationNotice from '@/components/schedule/SemesterMutationNotice.vue'

const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)
const ruleId = Number(route.params.rule) || null
const path = `/schedule/semesters/${id}`
const management = useSemesterManagement(id, async (signal) => {
  const state = await semesterSchedulesApi.management(id, signal)
  if (ruleId && state.data.weekly_rules.some((rule) => rule.id === ruleId)) {
    const rule = await semesterSchedulesApi.rule(id, ruleId, signal)
    if (rule.data.id !== ruleId || rule.meta.schedule_token !== state.meta.schedule_token)
      throw new ApiError(409)
  }
  return state
})
const { state, resource, busy, dirty, error, blocked, review, save } = management
const subjects = useResource(academicApi.subjects.list)
const teachers = useResource(academicApi.teachers.list)
const lesson = ref<LessonDefinitionInput>(lessonInput())
const weekday = ref<Weekday>(1)
const pattern = ref<WeekPattern>('all')
const deleting = ref(false)
const success = ref('')
const errors = computed(() => fieldErrors(error.value))
const current = computed(() => state.value?.data.weekly_rules.find((item) => item.id === ruleId))
const unavailable = computed(
  () =>
    busy.value ||
    !!blocked.value ||
    review.value ||
    resource.loading.value ||
    !!resource.error.value,
)
let baseline: WeeklyRuleInput | null = null
function fill(rule: WeeklyLessonRule) {
  lesson.value = lessonInput(rule)
  weekday.value = rule.weekday
  pattern.value = rule.week_pattern
  baseline = { ...lesson.value, weekday: weekday.value, week_pattern: pattern.value }
  dirty.value = false
}
watch(current, (rule) => {
  if (rule && !dirty.value) fill(rule)
})
function markDirty() {
  dirty.value = true
  success.value = ''
}
async function submit() {
  if (unavailable.value || !lesson.value.subject_id || !lesson.value.teacher_id) return
  const input = { ...lesson.value, weekday: weekday.value, week_pattern: pattern.value }
  if (ruleId && current.value && baseline) {
    const changes = changedFields(baseline, input)
    if (!Object.keys(changes).length) return
    if (await save((token) => semesterSchedulesApi.updateRule(id, ruleId, token, changes)))
      success.value = 'Щотижневу пару збережено.'
  } else if (
    !ruleId &&
    (await save((token) => semesterSchedulesApi.createRule(id, token, input)))
  ) {
    await router.replace(path)
  }
}
async function remove() {
  if (!ruleId || !current.value) return
  const result = await save((token) => semesterSchedulesApi.removeRule(id, ruleId, token, true))
  deleting.value = false
  if (result) await router.replace(path)
}
</script>

<template>
  <header class="page-heading">
    <div>
      <RouterLink :to="path" class="text-link">← Керування семестром</RouterLink>
      <h1>{{ ruleId ? 'Змінити пару на весь семестр' : 'Додати щотижневу пару' }}</h1>
      <p class="helper">
        Правило діє у відповідні дні семестру. Для одноразової зміни відкрийте редактор потрібної
        дати.
      </p>
    </div>
  </header>
  <LoadingState v-if="resource.loading.value || subjects.loading.value || teachers.loading.value" />
  <ErrorState
    v-if="resource.error.value"
    :error="resource.error.value"
    retry
    @retry="resource.reload"
  />
  <ErrorState
    v-if="subjects.error.value"
    :error="subjects.error.value"
    retry
    @retry="subjects.reload"
  />
  <ErrorState
    v-if="teachers.error.value"
    :error="teachers.error.value"
    retry
    @retry="teachers.reload"
  />
  <SemesterMutationNotice
    :blocked="blocked"
    :review="review"
    :busy="busy || resource.loading.value"
    :error="error"
    @reload="resource.reload"
    @reviewed="review = false"
  />
  <p v-if="success" role="status" class="schedule-warning">{{ success }}</p>
  <p v-if="state && ruleId && !current" role="status" class="schedule-warning">
    Це правило недоступне або його вже видалено. Перегляньте правила семестру.
  </p>
  <AppCard v-if="state && (!ruleId || baseline) && subjects.data.value && teachers.data.value">
    <p v-if="current" class="helper">
      Збережено: {{ current.subject.name }} · Викладач: {{ semesterTeacherNames(current) }} ·
      {{ weekdays[current.weekday] }} · пара {{ current.pair_number }}
      {{ current.pair_label ?? '' }} · {{ patterns[current.week_pattern] }} ·
      {{ localMinutes(current.starts_at_local) }}–{{ localMinutes(current.ends_at_local) }} ·
      {{ current.room ?? 'Без аудиторії' }}
    </p>
    <p v-if="!subjects.data.value.data.length" class="helper">
      <RouterLink to="/academic/subjects" class="text-link">Створіть предмет</RouterLink>
      , щоб додати пару.
    </p>
    <form class="semester-form" @submit.prevent="submit" @input="markDirty" @change="markDirty">
      <fieldset class="schedule-fieldset semester-form" :disabled="busy">
        <div class="semester-form-grid">
          <FormField id="rule-weekday" label="День тижня" :errors="errors.weekday">
            <template #default="{ id: field, invalid, describedby }">
              <select
                :id="field"
                v-model="weekday"
                :aria-invalid="invalid"
                :aria-describedby="describedby"
              >
                <option v-for="(label, day) in weekdays" :key="day" :value="Number(day)">
                  {{ label }}
                </option>
              </select>
            </template>
          </FormField>
          <FormField id="rule-pattern" label="Повторення" :errors="errors.week_pattern">
            <template #default="{ id: field, invalid, describedby }">
              <select
                :id="field"
                v-model="pattern"
                :aria-invalid="invalid"
                :aria-describedby="describedby"
              >
                <option v-for="(label, key) in patterns" :key="key" :value="key">
                  {{ label }}
                </option>
              </select>
            </template>
          </FormField>
        </div>
        <SemesterLessonFields
          v-model="lesson"
          @update:model-value="markDirty"
          :subjects="subjects.data.value.data"
          :teachers="teachers.data.value.data"
          :errors="errors"
        />
      </fieldset>
      <div class="actions">
        <AppButton
          type="submit"
          variant="primary"
          :busy="busy"
          :disabled="
            unavailable || (!!ruleId && (!current || !dirty)) || !subjects.data.value.data.length
          "
        >
          Зберегти пару
        </AppButton>
        <AppButton v-if="current && dirty" :disabled="busy" @click="fill(current)">
          Відновити збережені значення
        </AppButton>
        <AppButton v-if="current" variant="danger" :disabled="unavailable" @click="deleting = true">
          Видалити щотижневу пару
        </AppButton>
      </div>
    </form>
  </AppCard>
  <ConfirmDialog
    v-if="deleting"
    title="Видалити щотижневу пару?"
    :busy="busy"
    @close="deleting = false"
    @confirm="remove"
  >
    Слот буде захищено від повторного створення. Уже збережені заміни й робочі суботи збережуть свої
    пари.
  </ConfirmDialog>
</template>
