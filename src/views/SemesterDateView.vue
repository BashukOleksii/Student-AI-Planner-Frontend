<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { academicApi } from '@/api/academic'
import { ApiError, fieldErrors } from '@/api/client'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { useResource } from '@/composables/useResource'
import { useSemesterManagement } from '@/composables/useSemesterManagement'
import { calendarLabel } from '@/utils/dates'
import {
  calendarDate,
  changedFields,
  inPeriod,
  lessonInput,
  lessonTypeLabel,
  localMinutes,
  patterns,
  semesterTeacherNames,
  weekdays,
} from '@/utils/semesterSchedule'
import type {
  DateExceptionInput,
  LessonDefinitionInput,
  WeeklyLessonRule,
} from '@/types/semesterSchedule'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppModal from '@/components/ui/AppModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import SemesterLessonFields from '@/components/schedule/SemesterLessonFields.vue'
import SemesterMutationNotice from '@/components/schedule/SemesterMutationNotice.vue'

const route = useRoute()
const id = Number(route.params.id)
const date = String(route.params.date)
const path = `/schedule/semesters/${id}`
const baseRules = shallowRef<WeeklyLessonRule[]>([])
const baseReadError = shallowRef<unknown>(null)
const management = useSemesterManagement(id, async (signal) => {
  if (!calendarDate(date)) throw new ApiError(404)
  const state = await semesterSchedulesApi.management(id, signal)
  const existing = state.data.date_exceptions.find((item) => item.occurs_on === date)
  let rules: WeeklyLessonRule[] = []
  let projectionError: unknown = null
  if (existing) {
    const response = await semesterSchedulesApi.exception(id, date, signal)
    if (
      response.data.occurs_on !== date ||
      response.meta.schedule_token !== state.meta.schedule_token
    )
      throw new ApiError(409)
  } else if (inPeriod(state.data.schedule, date)) {
    try {
      const occurrences = await semesterSchedulesApi.occurrences(id, 'date', date, signal)
      rules = occurrences.data.map((occurrence) => {
        const rule = state.data.weekly_rules.find(
          (item) => item.id === occurrence.weekly_lesson_rule_id,
        )
        if (occurrence.source !== 'base' || !rule) throw new ApiError(409)
        return rule
      })
    } catch (reason) {
      if (!(reason instanceof ApiError) || reason.status !== 409) throw reason
      projectionError = reason
    }
    // The occurrence read carries no token. Check that the management graph did
    // not change while resolving the effective base rule IDs for this date.
    const after = await semesterSchedulesApi.rules(id, signal)
    if (after.meta.schedule_token !== state.meta.schedule_token) throw new ApiError(409)
  }
  if (!signal.aborted) {
    baseRules.value = rules
    baseReadError.value = projectionError
  }
  return state
})
const { state, resource, busy, dirty, error, blocked, review, save } = management
const subjects = useResource(academicApi.subjects.list)
const teachers = useResource(academicApi.teachers.list)
const current = computed(() =>
  state.value?.data.date_exceptions.find((item) => item.occurs_on === date),
)
const effective = useResource(
  (signal) =>
    current.value
      ? semesterSchedulesApi.occurrences(id, 'date', date, signal)
      : Promise.resolve(null),
  [() => state.value?.meta.schedule_token],
)
const within = computed(() => !!state.value && inPeriod(state.value.data.schedule, date))
const displayDate = calendarDate(date) ? calendarLabel(date) : date
const errors = computed(() => fieldErrors(error.value))
const unavailable = computed(
  () =>
    busy.value ||
    !!blocked.value ||
    review.value ||
    resource.loading.value ||
    !!resource.error.value,
)
const deleting = ref(false)
const cancelling = ref(false)
const success = ref('')
const mode = ref<'copy_base' | 'replace'>('copy_base')
const draftSnapshotId = ref<number | null>(null)
const draftToken = ref('')
const differentSnapshot = computed(() => draftSnapshotId.value !== (current.value?.id ?? null))
let nextKey = 0
interface BaseDraft {
  rule: WeeklyLessonRule
  original: LessonDefinitionInput
  value: LessonDefinitionInput
  cancelled: boolean
}
interface SnapshotDraft {
  key: number
  id?: number
  value: LessonDefinitionInput
}
const base = ref<BaseDraft[]>([])
const lessons = ref<SnapshotDraft[]>([])
const changedBase = computed(() =>
  base.value.filter(
    (item) => item.cancelled || Object.keys(changedFields(item.original, item.value)).length > 0,
  ),
)
const needsReconciliation = computed(
  () => dirty.value && draftToken.value !== state.value?.meta.schedule_token,
)
function fill() {
  const snapshot = current.value
  draftSnapshotId.value = snapshot?.id ?? null
  draftToken.value = state.value?.meta.schedule_token ?? ''
  mode.value = snapshot || baseReadError.value ? 'replace' : 'copy_base'
  base.value =
    mode.value === 'copy_base'
      ? baseRules.value.map((rule) => ({
          rule,
          original: lessonInput(rule),
          value: lessonInput(rule),
          cancelled: false,
        }))
      : []
  lessons.value =
    snapshot?.lessons.map((lesson) => ({
      id: lesson.id,
      key: nextKey++,
      value: lessonInput(lesson),
    })) ?? []
  dirty.value = false
}
watch(state, (value) => {
  if (value && !dirty.value) fill()
})
function markDirty() {
  dirty.value = true
  success.value = ''
}
const activeLessons = computed(() => [
  ...base.value.filter((item) => !item.cancelled).map((item) => item.value),
  ...lessons.value.map((item) => item.value),
])
const localErrors = computed(() => {
  const messages = new Set<string>()
  const values = activeLessons.value
  for (const [index, lesson] of values.entries()) {
    if (!Number.isInteger(lesson.pair_number) || lesson.pair_number < 1 || lesson.pair_number > 255)
      messages.add('Номер пари має бути цілим числом від 1 до 255.')
    if (!lesson.teacher_id) messages.add('Оберіть одного викладача для кожної пари.')
    if (
      lesson.starts_at_local &&
      lesson.ends_at_local &&
      lesson.starts_at_local >= lesson.ends_at_local
    )
      messages.add(`Пара ${lesson.pair_number}: кінець має бути пізніше початку.`)
    for (const other of values.slice(index + 1)) {
      if (lesson.pair_number === other.pair_number)
        messages.add(`Номер пари ${lesson.pair_number} повторюється.`)
      if (
        lesson.starts_at_local &&
        lesson.ends_at_local &&
        other.starts_at_local &&
        other.ends_at_local &&
        lesson.starts_at_local < other.ends_at_local &&
        other.starts_at_local < lesson.ends_at_local
      )
        messages.add(`Пари ${lesson.pair_number} і ${other.pair_number} перетинаються в часі.`)
    }
  }
  return [...messages]
})
function addLesson() {
  const used = new Set(activeLessons.value.map((item) => item.pair_number))
  let pair = 1
  while (used.has(pair) && pair <= 255) pair++
  if (pair > 255) return
  lessons.value.push({ key: nextKey++, value: lessonInput(undefined, pair) })
  markDirty()
}
function replaceDay() {
  lessons.value = [
    ...base.value
      .filter((item) => !item.cancelled)
      .map((item) => ({
        key: nextKey++,
        value: { ...item.value },
      })),
    ...lessons.value,
  ]
  base.value = []
  mode.value = 'replace'
  markDirty()
}
function removeLesson(index: number) {
  lessons.value.splice(index, 1)
  markDirty()
}
function changeErrorPrefix(item: BaseDraft) {
  const index = changedBase.value.indexOf(item)
  return index < 0 ? 'unused.' : `changes.${index}.`
}
async function submit() {
  if (unavailable.value || differentSnapshot.value || !dirty.value || localErrors.value.length)
    return
  if (mode.value === 'replace' && !lessons.value.length) {
    cancelling.value = true
    return
  }
  const input: DateExceptionInput =
    mode.value === 'replace'
      ? {
          mode: 'replace',
          lessons: lessons.value.map((item) => ({
            ...item.value,
            ...(item.id ? { id: item.id } : {}),
          })),
        }
      : {
          mode: 'copy_base',
          changes: changedBase.value.map((item) => ({
            weekly_lesson_rule_id: item.rule.id,
            ...(item.cancelled ? { cancelled: true } : changedFields(item.original, item.value)),
          })),
          lessons: lessons.value.map((item) => item.value),
        }
  await store(input)
}
async function store(input: DateExceptionInput) {
  success.value = ''
  const result = await save((token) => semesterSchedulesApi.saveException(id, date, token, input))
  cancelling.value = false
  if (result) {
    success.value = result.data.date_exceptions.find((item) => item.occurs_on === date)?.lessons
      .length
      ? 'Розклад на цю дату збережено.'
      : 'Усі пари на цю дату скасовано.'
  }
}
async function restore() {
  const result = await save((token) => semesterSchedulesApi.removeException(id, date, token, true))
  deleting.value = false
  if (result) {
    success.value = 'Заміна видалена. Діє поточний щотижневий розклад.'
    await resource.reload()
  }
}
</script>

<template>
  <div class="page-workspace page-workflow">
    <header class="page-heading">
      <div>
        <RouterLink :to="path" class="text-link">← Керування семестром</RouterLink>
        <h1>
          {{
            current?.kind === 'working_saturday'
              ? 'Редагувати робочу суботу'
              : 'Заняття на окрему дату'
          }}
        </h1>
        <p>{{ displayDate }}</p>
      </div>
      <RouterLink
        v-if="state"
        :to="{ path: '/schedule', query: { semester: String(id), date } }"
        class="button secondary"
      >
        Переглянути день
      </RouterLink>
    </header>
    <LoadingState
      v-if="resource.loading.value || subjects.loading.value || teachers.loading.value"
    />
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
    <p v-if="state && !within" class="schedule-warning">Дата поза межами навчального періоду.</p>
    <template v-if="within && subjects.data.value && teachers.data.value">
      <div class="scope-notice">
        <strong>Зміни лише на {{ displayDate }}</strong>
        <p>
          Інші дати семестру залишаться без змін. Для регулярного перенесення відкрийте заняття на
          весь семестр.
        </p>
      </div>
      <AppCard title="Поточний розклад на дату" class="date-baseline">
        <p v-if="current?.copied_weekday" class="helper">
          Робоча субота · джерело {{ weekdays[current.copied_weekday] }} ·
          {{
            current.source_week_parity
              ? patterns[current.source_week_parity]
              : 'Парність не збережено'
          }}. Це початкове джерело копії; редагування пар не змінює ці дані. Подальші зміни
          дня-джерела не змінять цю копію.
        </p>
        <p v-else-if="current" class="helper">Цей день має окремий збережений список занять.</p>
        <p v-else class="helper">Поточні щотижневі пари, що припадають на цю дату.</p>
        <ErrorState
          v-if="effective.error.value"
          :error="effective.error.value"
          retry
          @retry="effective.reload"
        />
        <ul v-if="(current?.lessons ?? baseRules).length" class="day-records">
          <li v-for="item in current?.lessons ?? baseRules" :key="item.id">
            <time>
              {{ localMinutes(item.starts_at_local) }}–{{ localMinutes(item.ends_at_local) }}
            </time>
            <strong>{{ item.subject.name }}</strong>
            <p class="helper">
              Пара {{ item.pair_number }} · {{ lessonTypeLabel(item.lesson_type) }} ·
              {{ semesterTeacherNames(item) }}
              <template v-if="item.room">· Ауд. {{ item.room }}</template>
            </p>
          </li>
        </ul>
        <p v-else-if="baseReadError && !current" class="schedule-warning">
          Не вдалося визначити регулярні заняття на цей день. Складіть список занять вручну або
          скасуйте день.
        </p>
        <p v-else>{{ current ? 'Усі пари на цю дату скасовано.' : 'Пар немає.' }}</p>
      </AppCard>
      <AppCard title="Чернетка розкладу на цю дату" class="date-editor">
        <p v-if="mode === 'copy_base'" class="helper">
          Редагування окремих пар: змініть потрібні заняття або позначте скасовані. Решта занять
          цього дня також увійде до збереженого розкладу.
        </p>
        <p v-else class="helper">
          Редагування всього списку: після збереження на цю дату залишаться тільки наведені нижче
          заняття. Вилучені зі списку пари на цю дату не відбудуться.
        </p>
        <p v-if="differentSnapshot" class="schedule-warning">
          Поки ви редагували, заміна на дату з’явилася або змінилася. Завантажте її у форму, щоб
          продовжити.
        </p>
        <p v-else-if="needsReconciliation" class="schedule-warning">
          Звірте чернетку з поточним списком вище. Після збереження повного списку вилучені з нього
          пари буде скасовано.
        </p>
        <div v-if="mode === 'copy_base'" class="scope-notice">
          <strong>Потрібно скласти інший розклад дня?</strong>
          <p>
            Перейдіть до редагування всього списку. Поточні пари буде перенесено у форму; ви зможете
            прибрати зайві.
          </p>
          <AppButton :disabled="busy" @click="replaceDay">Редагувати як повну заміну дня</AppButton>
        </div>
        <p v-if="mode === 'replace'" class="helper">
          Список містить поточні пари. Додавайте, змінюйте або прибирайте їх перед збереженням.
        </p>
        <ul v-if="localErrors.length" class="field-error" aria-live="polite">
          <li v-for="message in localErrors" :key="message">{{ message }}</li>
        </ul>
        <form class="semester-form" @submit.prevent="submit" @input="markDirty" @change="markDirty">
          <fieldset class="schedule-fieldset semester-form" :disabled="busy">
            <fieldset
              v-for="item in base"
              :key="item.rule.id"
              class="schedule-fieldset semester-item"
            >
              <legend>Пара {{ item.rule.pair_number }} · {{ item.rule.subject.name }}</legend>
              <p v-if="item.cancelled" class="field-error">Не відбудеться на цю дату</p>
              <p
                v-else-if="Object.keys(changedFields(item.original, item.value)).length"
                class="helper"
              >
                Змінено лише на цю дату
              </p>
              <label class="schedule-consent">
                <input v-model="item.cancelled" type="checkbox" />
                Скасувати цю пару
              </label>
              <template v-if="!item.cancelled">
                <SemesterLessonFields
                  v-model="item.value"
                  @update:model-value="markDirty"
                  :subjects="subjects.data.value.data"
                  :teachers="teachers.data.value.data"
                  :errors="errors"
                  :prefix="changeErrorPrefix(item)"
                />
                <RouterLink :to="`${path}/rules/${item.rule.id}`" class="text-link">
                  Змінити пару на весь семестр
                </RouterLink>
              </template>
            </fieldset>
            <fieldset
              v-for="(item, index) in lessons"
              :key="item.key"
              class="schedule-fieldset semester-item"
            >
              <legend>
                {{ item.id ? `Збережена пара ${index + 1}` : `Додаткова пара ${index + 1}` }}
              </legend>
              <SemesterLessonFields
                v-model="item.value"
                @update:model-value="markDirty"
                :subjects="subjects.data.value.data"
                :teachers="teachers.data.value.data"
                :errors="errors"
                :prefix="`lessons.${index}.`"
              />
              <AppButton class="semester-remove-pair" @click="removeLesson(index)">
                {{ item.id ? 'Прибрати з розкладу цієї дати' : 'Прибрати додану пару' }}
              </AppButton>
            </fieldset>
            <AppButton :disabled="busy || !subjects.data.value.data.length" @click="addLesson">
              Додати пару
            </AppButton>
            <div class="actions">
              <AppButton v-if="dirty" @click="fill">Відновити збережений список у формі</AppButton>
            </div>
            <p v-if="!subjects.data.value.data.length" class="helper">
              <RouterLink to="/academic/subjects" class="text-link">Створіть предмет</RouterLink>
              , щоб додати пару.
            </p>
          </fieldset>
          <section class="resulting-day" aria-label="Після збереження">
            <h3>Після збереження · {{ activeLessons.length }} пар</h3>
            <p v-if="!activeLessons.length">
              Заняття на цю дату не відбудуться. Для скасування всього дня потрібне підтвердження.
            </p>
            <ul v-else>
              <li v-for="(lesson, index) in activeLessons" :key="index">
                {{ localMinutes(lesson.starts_at_local) }}–{{ localMinutes(lesson.ends_at_local) }}
                ·
                {{
                  subjects.data.value.data.find((subject) => subject.id === lesson.subject_id)
                    ?.name ?? 'Оберіть предмет'
                }}
                <span v-if="lesson.room" class="helper">· Ауд. {{ lesson.room }}</span>
              </li>
            </ul>
          </section>
          <div class="actions">
            <AppButton
              type="submit"
              variant="primary"
              :busy="busy"
              :disabled="unavailable || !dirty || differentSnapshot || !!localErrors.length"
            >
              Зберегти зміни на цю дату
            </AppButton>
          </div>
          <section class="danger-actions">
            <h3>Скасування та повернення занять</h3>
            <p class="helper">
              Скасування прибере всі пари лише з цієї дати. Відновлення поверне чинні регулярні
              заняття замість окремого списку.
            </p>
            <div class="actions">
              <AppButton :disabled="unavailable || differentSnapshot" @click="cancelling = true">
                Скасувати всі пари на цю дату
              </AppButton>
              <AppButton v-if="current" :disabled="unavailable" @click="deleting = true">
                Відновити щотижневий розклад
              </AppButton>
            </div>
          </section>
        </form>
      </AppCard>
    </template>
    <AppModal
      v-if="cancelling"
      title="Скасувати всі пари на цю дату?"
      :busy="busy"
      @close="cancelling = false"
    >
      <p>
        На {{ displayDate }} не відбудеться жодної пари. Поточну чернетку буде замінено. Інші дати
        не зміняться. Пізніше можна повернути щотижневий розклад.
      </p>
      <div class="actions">
        <AppButton :disabled="busy" @click="cancelling = false">Повернутися</AppButton>
        <AppButton
          :busy="busy"
          :disabled="unavailable"
          variant="danger"
          @click="store({ mode: 'replace', lessons: [] })"
        >
          Підтвердити скасування дня
        </AppButton>
      </div>
    </AppModal>
    <ConfirmDialog
      v-if="deleting"
      title="Відновити щотижневий розклад?"
      confirm-label="Відновити розклад"
      :busy="busy"
      @close="deleting = false"
      @confirm="restore"
    >
      Збережену заміну на {{ date }} буде видалено. Сервер застосує поточні щотижневі правила для
      цієї дати.
    </ConfirmDialog>
  </div>
</template>
