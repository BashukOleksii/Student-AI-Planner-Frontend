<script setup lang="ts">
import { computed, ref, onScopeDispose } from 'vue'
import { useRoute } from 'vue-router'
import { lessonsApi } from '@/api/lessons'
import { scheduleApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { useResource } from '@/composables/useResource'
import { useLessonCatalog } from '@/composables/useLessonCatalog'
import { useAuthStore } from '@/stores/auth'
import { localDate } from '@/utils/dates'
import { exactDateTime } from '@/utils/planning'
import { lessonTypes, lessonStatuses } from '@/utils/lessons'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const id = Number(useRoute().params.id),
  auth = useAuthStore(),
  timezone = computed(() => auth.user?.timezone ?? 'UTC')
const detail = useResource((signal) => lessonsApi.get(id, signal)),
  catalog = useLessonCatalog()
const decision = ref<'cancel' | 'delete' | null>(null),
  busy = ref(false),
  error = ref<unknown>(null),
  refreshError = ref<unknown>(null),
  notice = ref(''),
  deleted = ref(false),
  originalId = ref<number | null>(null),
  returnDate = ref<string>()
let active = true
onScopeDispose(() => {
  active = false
})
const lesson = computed(() => detail.data.value?.data)
const canReplace = computed(
  () =>
    lesson.value?.status === 'active' &&
    !lesson.value.replaces_lesson_id &&
    !lesson.value.replacement_id,
)
function ask(operation: 'cancel' | 'delete') {
  decision.value = operation
  error.value = null
}
async function mutate() {
  if (!lesson.value || !decision.value || busy.value) return
  const current = lesson.value,
    action = decision.value
  busy.value = true
  error.value = null
  refreshError.value = null
  try {
    if (action === 'delete') await lessonsApi.remove(id)
    else await lessonsApi.cancel(id)
    if (!active) return
    originalId.value = current.replaces_lesson_id
    returnDate.value = localDate(current.starts_at, timezone.value)
    deleted.value = action === 'delete'
    decision.value = null
    notice.value =
      action === 'delete' ? 'Заняття видалено зі збереженням історії.' : 'Заняття скасовано.'
    if (!deleted.value) await detail.reload()
    const refreshed = await Promise.allSettled([
      scheduleApi('day', returnDate.value),
      ...(deleted.value && originalId.value
        ? [
            lessonsApi.get(originalId.value).then(async (response) => {
              if (!active) return
              const originalDate = localDate(response.data.starts_at, timezone.value)
              const replacementDate = returnDate.value
              returnDate.value = originalDate
              if (originalDate !== replacementDate) await scheduleApi('day', originalDate)
            }),
          ]
        : []),
    ])
    if (active) {
      const failure = refreshed.find((r) => r.status === 'rejected')
      if (failure?.status === 'rejected') refreshError.value = failure.reason
    }
  } catch (e) {
    if (active) {
      error.value = e
      if (e instanceof ApiError && [0, 500, 502, 503].includes(e.status)) {
        decision.value = null
        notice.value =
          'Результат операції не встановлено. Перевірте актуальні деталі й розклад перед новою дією. Запит не повторювався.'
        await detail.reload()
      }
    }
  } finally {
    if (active) busy.value = false
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <RouterLink :to="{ path: '/schedule', query: { date: returnDate } }" class="text-link">
        ← До розкладу
      </RouterLink>
      <h1>Заняття №{{ id }}</h1>
    </div>
  </header>
  <p v-if="notice" role="status" class="success-notice">{{ notice }}</p>
  <FormNotice :error="error" />
  <ErrorState v-if="refreshError" :error="refreshError" />
  <template v-if="deleted">
    <AppCard title="Заняття видалено">
      <p>Запис більше не входить до ефективного розкладу.</p>
      <RouterLink v-if="originalId" :to="`/schedule/lessons/${originalId}`" class="text-link">
        Перевірити відновлене початкове заняття №{{ originalId }} →
      </RouterLink>
      <RouterLink :to="{ path: '/schedule', query: { date: returnDate } }" class="button secondary">
        Перевірити розклад
      </RouterLink>
    </AppCard>
  </template>
  <LoadingState v-else-if="detail.loading.value" />
  <ErrorState
    v-else-if="detail.error.value"
    :error="detail.error.value"
    retry
    @retry="detail.reload"
  />
  <template v-else-if="lesson">
    <AppCard
      :title="
        catalog.subjects.data.value?.data.find((s) => s.id === lesson?.subject_id)?.name ??
        (lesson.subject_id ? `Предмет №${lesson.subject_id}` : 'Предмет недоступний')
      "
    >
      <span class="badge">{{ lessonStatuses[lesson.status] }}</span>
      <dl class="lesson-details">
        <div>
          <dt>Тип заняття</dt>
          <dd>{{ lessonTypes[lesson.type] }}</dd>
        </div>
        <div>
          <dt>Початок</dt>
          <dd>{{ exactDateTime(lesson.starts_at, timezone) }}</dd>
        </div>
        <div>
          <dt>Завершення</dt>
          <dd>{{ exactDateTime(lesson.ends_at, timezone) }}</dd>
        </div>
        <div>
          <dt>Викладач</dt>
          <dd>
            {{
              catalog.teachers.data.value?.data.find((t) => t.id === lesson?.teacher_id)?.name ??
              (lesson.teacher_id ? `Викладач №${lesson.teacher_id}` : 'Не вказано')
            }}
          </dd>
        </div>
        <div>
          <dt>Навчальний період</dt>
          <dd>
            {{
              catalog.periods.data.value?.data.find((p) => p.id === lesson?.academic_period_id)
                ?.name ??
              (lesson.academic_period_id ? `Період №${lesson.academic_period_id}` : 'Не вказано')
            }}
          </dd>
        </div>
        <div>
          <dt>Аудиторія</dt>
          <dd>{{ lesson.room ?? 'Не вказано' }}</dd>
        </div>
      </dl>
      <div class="actions">
        <RouterLink
          v-if="lesson.replaces_lesson_id"
          :to="`/schedule/lessons/${lesson.replaces_lesson_id}`"
          class="text-link"
        >
          Початкове заняття №{{ lesson.replaces_lesson_id }}
        </RouterLink>
        <RouterLink
          v-if="lesson.replacement_id"
          :to="`/schedule/lessons/${lesson.replacement_id}`"
          class="text-link"
        >
          Заміна №{{ lesson.replacement_id }}
        </RouterLink>
      </div>
      <div v-for="(resource, key) in catalog" :key="key">
        <ErrorState
          v-if="resource.error.value"
          :error="resource.error.value"
          retry
          @retry="resource.reload"
        />
      </div>
    </AppCard>
    <AppCard title="Керування заняттям">
      <div class="actions">
        <RouterLink :to="`/schedule/lessons/${id}/edit`" class="button secondary">
          Редагувати заняття
        </RouterLink>
        <RouterLink
          v-if="canReplace"
          :to="`/schedule/lessons/${id}/replacement`"
          class="button secondary"
        >
          Замінити заняття
        </RouterLink>
        <AppButton v-if="lesson.status === 'active'" :disabled="busy" @click="ask('cancel')">
          Скасувати заняття
        </AppButton>
        <AppButton
          variant="danger"
          :disabled="busy || !!lesson.replacement_id"
          @click="ask('delete')"
        >
          Видалити заняття
        </AppButton>
      </div>
      <p v-if="lesson.replacement_id" class="helper">
        Початкове заняття з чинною заміною видалити не можна. Спершу перегляньте заміну.
      </p>
    </AppCard>
  </template>
  <AppModal
    v-if="decision && lesson"
    :title="decision === 'cancel' ? 'Скасувати заняття?' : 'Видалити заняття?'"
    :busy="busy"
    @close="decision = null"
  >
    <p v-if="decision === 'cancel'">
      Заняття стане скасованим і зникне з ефективного розкладу. Скасування заміни не відновлює
      початкове заняття.
    </p>
    <p v-else-if="lesson.replaces_lesson_id">
      Видалення цієї заміни відновить початкове заняття, якщо сервер не виявить конфлікту. Обидві
      зміни виконуються разом; це не звичайне скасування.
    </p>
    <p v-else>
      Заняття буде м’яко видалено та виключено з розкладу. Історія збережеться; каскадне або
      остаточне стирання не виконується.
    </p>
    <FormNotice :error="error" />
    <div class="actions">
      <AppButton :disabled="busy" @click="decision = null">Залишити без змін</AppButton>
      <AppButton variant="danger" :busy="busy" @click="mutate">
        {{ decision === 'cancel' ? 'Підтвердити скасування' : 'Підтвердити видалення' }}
      </AppButton>
    </div>
  </AppModal>
</template>
