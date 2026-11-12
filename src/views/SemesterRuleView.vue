<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { academicApi } from '@/api/academic'
import { ApiError, fieldErrors } from '@/api/client'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { useResource } from '@/composables/useResource'
import { useSemesterManagement } from '@/composables/useSemesterManagement'
import { changedFields, lessonInput, patterns } from '@/utils/semesterSchedule'
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
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormField from '@/components/ui/FormField.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import SemesterLessonFields from '@/components/schedule/SemesterLessonFields.vue'
import SemesterMutationNotice from '@/components/schedule/SemesterMutationNotice.vue'
import SemesterRuleCard from '@/components/schedule/SemesterRuleCard.vue'

const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)
const legacyRuleId = Number(route.params.rule) || null
const isLegacyNew = route.path.endsWith('/rules/new')
const path = `/schedule/semesters/${id}`
const initialized = ref(false)
const management = useSemesterManagement(id, async (signal) => {
  const value = await semesterSchedulesApi.management(id, signal)
  if (
    !initialized.value &&
    legacyRuleId &&
    !value.data.weekly_rules.some((rule) => rule.id === legacyRuleId)
  )
    throw new ApiError(404)
  return value
})
const { state, resource, busy, dirty, error, blocked, review, run } = management
const subjects = useResource(academicApi.subjects.list)
const teachers = useResource(academicApi.teachers.list)
const requestedDay = Number(route.params.weekday ?? route.query.weekday ?? 1)
const weekday = ref<Weekday>([1, 2, 3, 4, 5].includes(requestedDay) ? (requestedDay as Weekday) : 1)
const dayNames: Record<Weekday, string> = {
  1: 'понеділка',
  2: 'вівторка',
  3: 'середи',
  4: 'четверга',
  5: 'п’ятниці',
}
const dayOccurrences: Record<Weekday, string> = {
  1: 'понеділків',
  2: 'вівторків',
  3: 'серед',
  4: 'четвергів',
  5: 'п’ятниць',
}
interface RuleDraft {
  key: number
  id?: number
  value: LessonDefinitionInput
  pattern: WeekPattern
  baseline: WeeklyRuleInput | null
  removed: boolean
  status: string
}
let nextKey = 0
const drafts = ref<RuleDraft[]>([])
const confirming = ref(false)
const resetting = ref(false)
const reconcile = ref(false)
const failedKey = ref<number | null>(null)
const summary = ref('')
const results = ref<string[]>([])
const errors = computed(() => fieldErrors(error.value))
const input = (item: RuleDraft): WeeklyRuleInput => ({
  ...item.value,
  weekday: weekday.value,
  week_pattern: item.pattern,
})
const pending = computed(() =>
  drafts.value.filter((item) =>
    item.removed
      ? !!item.id
      : !item.baseline || Object.keys(changedFields(item.baseline, input(item))).length > 0,
  ),
)
watch(
  pending,
  (items) => {
    dirty.value = items.length > 0
  },
  { flush: 'sync' },
)
const unavailable = computed(
  () =>
    busy.value ||
    !!blocked.value ||
    review.value ||
    reconcile.value ||
    resource.loading.value ||
    !!resource.error.value ||
    subjects.loading.value ||
    teachers.loading.value ||
    !!subjects.error.value ||
    !!teachers.error.value,
)
const savedRules = computed(
  () => state.value?.data.weekly_rules.filter((rule) => rule.weekday === weekday.value) ?? [],
)
function draft(rule: WeeklyLessonRule): RuleDraft {
  const value = lessonInput(rule)
  return {
    key: nextKey++,
    id: rule.id,
    value,
    pattern: rule.week_pattern,
    baseline: { ...value, weekday: rule.weekday, week_pattern: rule.week_pattern },
    removed: false,
    status: '',
  }
}
function fill() {
  drafts.value = [...savedRules.value]
    .sort(
      (a, b) => a.pair_number - b.pair_number || a.starts_at_local.localeCompare(b.starts_at_local),
    )
    .map(draft)
  initialized.value = true
  failedKey.value = null
  error.value = null
  reconcile.value = false
  review.value = false
  resetting.value = false
  summary.value = ''
  results.value = []
}
watch(state, (value) => {
  if (value && !initialized.value) {
    const target = value.data.weekly_rules.find((rule) => rule.id === legacyRuleId)
    if (target) weekday.value = target.weekday
    fill()
    if (isLegacyNew) addLesson()
  }
})
function addLesson() {
  const used = new Set(
    drafts.value.filter((item) => !item.removed).map((item) => item.value.pair_number),
  )
  let number = 1
  while (used.has(number) && number < 255) number++
  drafts.value.push({
    key: nextKey++,
    value: lessonInput(undefined, number),
    pattern: 'all',
    baseline: null,
    removed: false,
    status: '',
  })
}
function remove(item: RuleDraft) {
  item.status = ''
  if (item.id) item.removed = true
  else drafts.value = drafts.value.filter((row) => row.key !== item.key)
}
async function reload() {
  if (busy.value) return
  if (blocked.value || dirty.value) reconcile.value = true
  await resource.reload()
}
function submit() {
  if (unavailable.value || !pending.value.length) return
  if (pending.value.some((item) => item.removed)) confirming.value = true
  else void store()
}
async function store() {
  confirming.value = false
  if (unavailable.value || !state.value) return
  // Each request commits separately. Stop on the first failure and retain the remaining draft.
  const operations = [...pending.value].sort((a, b) => Number(b.removed) - Number(a.removed))
  let completed = 0
  summary.value = ''
  const result = await run(async () => {
    for (const item of operations) {
      failedKey.value = item.key
      item.status = 'Зберігаємо…'
      const label = `Пара ${item.value.pair_number} · ${patterns[item.pattern]} · ${subjects.data.value?.data.find((subject) => subject.id === item.value.subject_id)?.name ?? 'Предмет недоступний'}`
      const token = state.value!.meta.schedule_token
      const values = input(item)
      const previousIds = new Set(state.value!.data.weekly_rules.map((rule) => rule.id))
      try {
        const response =
          item.removed && item.id
            ? await semesterSchedulesApi.removeRule(id, item.id, token, true)
            : item.id && item.baseline
              ? await semesterSchedulesApi.updateRule(
                  id,
                  item.id,
                  token,
                  changedFields(item.baseline, values),
                )
              : await semesterSchedulesApi.createRule(id, token, values)
        state.value = response
        if (item.removed) {
          item.id = undefined
          item.baseline = null
          drafts.value = drafts.value.filter((row) => row.key !== item.key)
        } else {
          const saved = response.data.weekly_rules.find((rule) =>
            item.id ? rule.id === item.id : !previousIds.has(rule.id),
          )
          if (!saved) throw new ApiError(502)
          item.id = saved.id
          item.value = lessonInput(saved)
          item.pattern = saved.week_pattern
          item.baseline = {
            ...item.value,
            weekday: saved.weekday,
            week_pattern: saved.week_pattern,
          }
          item.status = 'Збережено'
        }
        results.value.push(`${item.removed ? 'Видалено' : 'Збережено'}: ${label}`)
        completed++
        summary.value = `Збережено операцій: ${completed} із ${operations.length}.`
      } catch (reason) {
        item.status =
          reason instanceof ApiError && reason.status >= 400 && reason.status < 500
            ? 'Не збережено. Перевірте повідомлення сервера.'
            : 'Збереження не підтверджено. Перевірте повідомлення та стан сервера.'
        throw reason
      }
    }
    failedKey.value = null
    return true
  })
  dirty.value = pending.value.length > 0
  if (result)
    await router.push({
      path: '/schedule/semester-calendar',
      query: { saved_rules: String(completed) },
    })
  else
    summary.value = `Збережено операцій: ${completed} із ${operations.length}. Решта змін не застосована або потребує перевірки. Уже збережені операції не скасовано.`
}
</script>
<template>
  <div class="page-workspace page-editor date-editor semester-editor-workspace">
    <header class="page-heading">
      <div>
        <RouterLink :to="path" class="text-link">← Редагувати семестровий розклад</RouterLink>
        <h1>Редагування {{ dayNames[weekday] }}</h1>
        <p class="helper">
          Зміни діятимуть для всіх відповідних {{ dayOccurrences[weekday] }} протягом семестру
        </p>
      </div>
    </header>
    <div class="scope-notice">Зміни застосовуються до регулярних занять протягом семестру</div>
    <LoadingState
      v-if="resource.loading.value || subjects.loading.value || teachers.loading.value"
    />
    <ErrorState v-if="resource.error.value" :error="resource.error.value" retry @retry="reload" />
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
      @reload="reload"
      @reviewed="review = false"
    />
    <div v-if="summary" role="status" class="schedule-warning">
      <p>{{ summary }}</p>
      <ul v-if="results.length">
        <li v-for="(message, index) in results" :key="index">{{ message }}</li>
      </ul>
    </div>
    <AppCard
      v-if="reconcile && state && !resource.loading.value && !resource.error.value"
      title="Актуальні пари на сервері"
    >
      <p class="helper">
        Чернетку збережено нижче. Звірте її з цими парами. Перед новим збереженням завантажте їх у
        редактор, щоб не повторити вже виконані операції.
      </p>
      <SemesterRuleCard v-for="rule in savedRules" :key="rule.id" :rule="rule" />
      <EmptyState v-if="!savedRules.length" compact title="Занять немає" />
      <AppButton :disabled="busy || !!blocked" @click="resetting = true">
        Замінити чернетку актуальними парами
      </AppButton>
    </AppCard>
    <form
      v-if="initialized && subjects.data.value && teachers.data.value"
      class="semester-form"
      @submit.prevent="submit"
    >
      <p class="helper">
        Пари зберігаються послідовно. Якщо одна операція завершиться помилкою, попередні успішні
        зміни залишаться збереженими.
      </p>
      <fieldset
        class="schedule-fieldset date-lesson-list"
        :disabled="busy || resource.loading.value"
      >
        <EmptyState v-if="!drafts.length" compact title="Занять немає" />
        <article
          v-for="item in drafts"
          :key="item.key"
          class="date-lesson-card"
          :class="{ 'date-lesson-removed': item.removed }"
          @input="item.status = ''"
          @change="item.status = ''"
        >
          <header class="date-lesson-heading">
            <h2>Пара {{ item.value.pair_number }}</h2>
            <AppButton v-if="item.removed" @click="item.removed = false">Відновити</AppButton>
            <AppButton v-else variant="danger" class="date-remove-button" @click="remove(item)">
              Прибрати пару
            </AppButton>
          </header>
          <p v-if="item.removed" class="helper">
            Пару буде видалено після підтвердження збереження.
          </p>
          <template v-else>
            <FormField
              :id="`pattern-${item.key}`"
              label="Повторення"
              :errors="failedKey === item.key ? errors.week_pattern : undefined"
            >
              <template #default="{ id: field, invalid, describedby }">
                <select
                  :id="field"
                  v-model="item.pattern"
                  :aria-invalid="invalid"
                  :aria-describedby="describedby"
                >
                  <option v-for="(label, key) in patterns" :key="key" :value="key">
                    {{ label }}
                  </option>
                </select>
              </template>
            </FormField>
            <SemesterLessonFields
              v-model="item.value"
              :subjects="subjects.data.value.data"
              :teachers="teachers.data.value.data"
              :errors="failedKey === item.key ? errors : {}"
            />
          </template>
          <p v-if="item.status" role="status" class="helper">{{ item.status }}</p>
        </article>
      </fieldset>
      <div class="actions date-editor-actions">
        <AppButton :disabled="unavailable" @click="addLesson">Додати пару</AppButton>
        <AppButton type="submit" variant="primary" :busy="busy" :disabled="unavailable || !dirty">
          Зберегти
        </AppButton>
        <RouterLink to="/schedule/semester-calendar" class="button secondary">
          До семестрового розкладу
        </RouterLink>
      </div>
    </form>
    <ConfirmDialog
      v-if="confirming"
      title="Зберегти зміни й видалити прибрані пари?"
      confirm-label="Зберегти зміни"
      :busy="busy"
      @close="confirming = false"
      @confirm="store"
    >
      Буде видалено пар: {{ pending.filter((item) => item.removed).length }}. Ці пари буде захищено
      від повторного додавання імпортом. Операції виконуються окремо; попередні успішні зміни
      збережуться, якщо наступна завершиться помилкою.
    </ConfirmDialog>
    <ConfirmDialog
      v-if="resetting"
      title="Замінити чернетку?"
      confirm-label="Завантажити актуальні пари"
      @close="resetting = false"
      @confirm="fill"
    >
      Незбережені зміни буде замінено поточними парами з сервера.
    </ConfirmDialog>
  </div>
</template>
