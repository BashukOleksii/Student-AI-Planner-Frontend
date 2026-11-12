<script setup lang="ts">
import { computed, ref, onMounted, onScopeDispose } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { lessonsApi } from '@/api/lessons'
import { ApiError, fieldErrors } from '@/api/client'
import { scheduleApi } from '@/api/endpoints'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { useLessonCatalog } from '@/composables/useLessonCatalog'
import { useAcademicContext } from '@/composables/useAcademicContext'
import { localDate, today } from '@/utils/dates'
import { calendarDate } from '@/utils/semesterSchedule'
import type { LessonInput } from '@/types/lessons'
import LessonForm from '@/components/schedule/LessonForm.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'

const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore()
const id = Number(route.params.id) || null
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const selectedDate =
  typeof route.query.date === 'string' && calendarDate(route.query.date)
    ? route.query.date
    : today(timezone.value)
const detail = useResource(async (signal) => (id ? (await lessonsApi.get(id, signal)).data : null))
const catalog = useLessonCatalog()
const context = useAcademicContext(
  () => catalog.periods.data.value?.data ?? [],
  () => catalog.institutions.data.value?.data ?? [],
)
const lesson = detail.data
const date = computed(() =>
  lesson.value ? localDate(lesson.value.starts_at, timezone.value) : selectedDate,
)
const busy = ref(false),
  error = ref<unknown>(null),
  dirty = ref(false),
  saved = ref(false),
  uncertain = ref(false)
const decision = ref<'cancel' | 'delete' | null>(null)
const leaving = ref(false)
let resolveLeave: ((value: boolean) => void) | undefined
let active = true
function askLeave() {
  if (leaving.value) return false
  leaving.value = true
  return new Promise<boolean>((resolve) => {
    resolveLeave = resolve
  })
}
function decideLeave(value: boolean) {
  leaving.value = false
  resolveLeave?.(value)
  resolveLeave = undefined
}
onBeforeRouteLeave(() => !auth.user || saved.value || (!busy.value && (!dirty.value || askLeave())))
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onScopeDispose(() => {
  active = false
  resolveLeave?.(false)
  window.removeEventListener('beforeunload', beforeUnload)
})
const errors = computed(() => {
  const fields = { ...fieldErrors(error.value) }
  if (fields.schedule)
    fields.schedule = fields.schedule.map((message) => {
      if (
        message === 'This lesson overlaps an existing active lesson.' ||
        message === 'This lesson overlaps an effective semester lesson.'
      )
        return 'Вибраний час уже зайнятий іншим заняттям. Змініть початок або кінець і збережіть ще раз.'
      if (
        message ===
        'The effective schedule could not be validated. Review the semester schedule and timezone before saving.'
      )
        return 'Не вдалося перевірити розклад. Перегляньте семестрові налаштування та часовий пояс перед збереженням.'
      return message
    })
  for (const key of ['starts_at', 'ends_at'] as const) {
    if (fields[key])
      fields[key] = fields[key].map((message) =>
        message === 'The end time must be after the start time.'
          ? 'Кінець заняття має бути пізніше початку.'
          : message,
      )
  }
  return fields
})
const displayError = computed(() =>
  error.value instanceof ApiError ? new ApiError(error.value.status, errors.value) : error.value,
)
const catalogUnavailable = computed(() =>
  Object.values(catalog).some((item) => item.loading.value || !!item.error.value),
)
const blocked = computed(
  () =>
    uncertain.value ||
    catalogUnavailable.value ||
    (!id && (!context.period.value || !catalog.subjects.data.value?.data.length)),
)
async function cancelEditing() {
  if (!busy.value) await router.push({ path: '/schedule/legacy', query: { date: date.value } })
}
function failed(reason: unknown) {
  error.value = reason
  if (reason instanceof ApiError && [0, 409, 500, 502, 503, 504].includes(reason.status))
    uncertain.value = true
}
async function submit(input: LessonInput) {
  if (busy.value || blocked.value) return
  // Recheck the current academic context rather than trusting a stale form value.
  if (!id && input.academic_period_id !== context.period.value?.id) return
  busy.value = true
  error.value = null
  try {
    let response
    if (id && lesson.value) {
      const original = lesson.value
      const changes = Object.fromEntries(
        Object.entries(input).filter(
          ([key, value]) => value !== original[key as keyof LessonInput],
        ),
      ) as Partial<LessonInput>
      response = await lessonsApi.update(id, changes)
    } else response = await lessonsApi.create(input)
    if (!active) return
    saved.value = true
    dirty.value = false
    const returnDate = localDate(response.data.starts_at, timezone.value)
    await Promise.allSettled([scheduleApi('day', returnDate)])
    if (active) await router.push({ path: '/schedule/legacy', query: { date: returnDate } })
  } catch (reason) {
    if (active) failed(reason)
  } finally {
    if (active) busy.value = false
  }
}
async function mutate() {
  if (!id || !lesson.value || !decision.value || busy.value || uncertain.value) return
  const current = lesson.value,
    action = decision.value
  busy.value = true
  error.value = null
  try {
    if (action === 'delete') await lessonsApi.remove(id)
    else await lessonsApi.cancel(id)
    if (!active) return
    saved.value = true
    dirty.value = false
    decision.value = null
    let returnDate = localDate(current.starts_at, timezone.value)
    await Promise.allSettled([scheduleApi('day', returnDate)])
    if (action === 'delete' && current.replaces_lesson_id) {
      // Deleting a historical replacement can restore its original on another day.
      const original = await Promise.allSettled([lessonsApi.get(current.replaces_lesson_id)])
      const result = original[0]
      if (result?.status === 'fulfilled') {
        returnDate = localDate(result.value.data.starts_at, timezone.value)
        await Promise.allSettled([scheduleApi('day', returnDate)])
      }
    }
    if (active) await router.push({ path: '/schedule/legacy', query: { date: returnDate } })
  } catch (reason) {
    if (active) {
      failed(reason)
      decision.value = null
    }
  } finally {
    if (active) busy.value = false
  }
}
async function refresh() {
  if (
    busy.value ||
    (dirty.value && !window.confirm('Оновити дані заняття? Незбережені зміни буде втрачено.'))
  )
    return
  await detail.reload()
  if (!detail.error.value) {
    uncertain.value = false
    error.value = null
    dirty.value = false
  }
}
</script>
<template>
  <div class="page-workspace page-editor lesson-editor">
    <header class="page-heading">
      <div>
        <h1>{{ id ? 'Редагування заняття' : 'Нове заняття' }}</h1>
        <p class="muted">Окреме заняття на вибраний день</p>
      </div>
    </header>
    <div class="scope-notice">
      <strong>Заняття на конкретну дату</strong>
      <p>
        Зміни стосуються лише цього заняття. Повторювані пари налаштовуються в керуванні семестром.
      </p>
    </div>
    <LoadingState v-if="detail.loading.value" />
    <ErrorState
      v-else-if="detail.error.value"
      :error="detail.error.value"
      retry
      @retry="detail.reload"
    />
    <AppCard v-else>
      <div v-for="(resource, key) in catalog" :key="key">
        <LoadingState v-if="resource.loading.value" />
        <ErrorState
          v-else-if="resource.error.value"
          :error="resource.error.value"
          retry
          @retry="resource.reload"
        />
      </div>
      <div
        v-if="!id && !catalogUnavailable && context.issue.value"
        class="schedule-warning"
        role="alert"
      >
        <p>{{ context.issue.value }}</p>
        <RouterLink to="/academic/periods" class="text-link">
          Налаштувати навчальний період
        </RouterLink>
        <RouterLink v-if="!context.institution.value" to="/academic/institutions" class="text-link">
          Налаштувати заклад
        </RouterLink>
      </div>
      <p
        v-if="!catalog.subjects.loading.value && !catalog.subjects.data.value?.data.length"
        class="helper"
      >
        Додайте предмет в
        <RouterLink to="/academic/subjects" class="text-link">академічному просторі</RouterLink>
        .
      </p>
      <p v-if="lesson && lesson.status !== 'active'" class="schedule-warning">
        {{ lesson.status === 'cancelled' ? 'Заняття скасоване.' : 'Заняття замінене іншим.' }}
        Збереження полів не змінює цей стан.
      </p>
      <div v-if="lesson?.replaces_lesson_id || lesson?.replacement_id" class="actions">
        <RouterLink
          v-if="lesson.replaces_lesson_id"
          :to="`/schedule/lessons/${lesson.replaces_lesson_id}`"
          class="text-link"
        >
          Початкове заняття
        </RouterLink>
        <RouterLink
          v-if="lesson.replacement_id"
          :to="`/schedule/lessons/${lesson.replacement_id}`"
          class="text-link"
        >
          Збережена заміна
        </RouterLink>
      </div>
      <FormNotice :error="displayError" />
      <div v-if="uncertain" role="alert" class="schedule-warning">
        <p>
          Дані змінилися або результат запиту невідомий. Перевірте актуальний розклад перед
          наступною дією. Запит автоматично не повторювався.
        </p>
        <AppButton v-if="id" :disabled="busy" @click="refresh">Отримати актуальні дані</AppButton>
        <RouterLink :to="{ path: '/schedule/legacy', query: { date } }" class="text-link">
          Перевірити розклад
        </RouterLink>
      </div>
      <LessonForm
        :lesson="lesson ?? undefined"
        :date="date"
        :active-period-id="context.period.value?.id"
        :subjects="catalog.subjects.data.value?.data ?? []"
        :teachers="catalog.teachers.data.value?.data ?? []"
        :timezone="timezone"
        :errors="errors"
        :busy="busy"
        :blocked="blocked"
        :submit-label="id ? 'Зберегти зміни' : 'Створити заняття'"
        @submit="submit"
        @cancel="cancelEditing"
        @dirty="dirty = $event"
      />
      <div v-if="lesson" class="lesson-editor-danger">
        <p class="helper">
          Ці дії стосуються збереженого заняття. Незбережені зміни форми не застосовуватимуться.
        </p>
        <div class="actions">
          <AppButton
            v-if="lesson.status === 'active'"
            :disabled="busy || uncertain"
            @click="decision = 'cancel'"
          >
            Скасувати заняття
          </AppButton>
          <AppButton
            variant="danger"
            :disabled="busy || uncertain || !!lesson.replacement_id"
            @click="decision = 'delete'"
          >
            Видалити заняття
          </AppButton>
        </div>
        <p v-if="lesson.replacement_id" class="helper">
          Спочатку перегляньте збережену заміну. Початкове заняття з чинною заміною видалити не
          можна.
        </p>
      </div>
    </AppCard>
    <AppModal
      v-if="decision && lesson"
      :title="decision === 'cancel' ? 'Скасувати заняття?' : 'Видалити заняття?'"
      :busy="busy"
      @close="decision = null"
    >
      <p v-if="decision === 'cancel'">
        Заняття не відбудеться та зникне з розкладу. Скасування заміни не відновлює початкове
        заняття.
      </p>
      <p v-else-if="lesson.replaces_lesson_id">
        Видалення цієї заміни відновить початкове заняття, якщо сервер не виявить конфлікту. Історія
        збережеться.
      </p>
      <p v-else>Заняття буде вилучено з розкладу. Історія збережеться.</p>
      <p v-if="dirty" class="schedule-warning">
        Незбережені зміни форми буде втрачено після підтвердження.
      </p>
      <FormNotice :error="error" />
      <div class="actions">
        <AppButton :disabled="busy" @click="decision = null">Залишити без змін</AppButton>
        <AppButton variant="danger" :busy="busy" @click="mutate">
          {{ decision === 'cancel' ? 'Підтвердити скасування' : 'Підтвердити видалення' }}
        </AppButton>
      </div>
    </AppModal>
    <AppModal v-if="leaving" title="Вийти без збереження?" @close="decideLeave(false)">
      <p>У вас є незбережені зміни. Якщо вийти, вони будуть втрачені.</p>
      <div class="actions">
        <AppButton @click="decideLeave(false)">Продовжити редагування</AppButton>
        <AppButton variant="danger" @click="decideLeave(true)">Вийти без збереження</AppButton>
      </div>
    </AppModal>
  </div>
</template>
