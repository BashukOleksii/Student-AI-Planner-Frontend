<script setup lang="ts">
import { computed, ref, watch, onScopeDispose } from 'vue'
import { useRoute, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { importReturnId } from '@/utils/scheduleImport'
import { academicApi } from '@/api/academic'
import { ApiError, fieldErrors } from '@/api/client'
import type {
  AcademicKind,
  AcademicRecord,
  AcademicDraft,
  EducationInstitution,
  AcademicPeriod,
} from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { useAcademicContext } from '@/composables/useAcademicContext'
import { calendarLabel } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import AcademicForm from '@/components/domain/AcademicForm.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import FormField from '@/components/ui/FormField.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
const route = useRoute()
const kind = route.params.section as AcademicKind
const semesterImportId = importReturnId(route.query.semester_import)
const importLink = `/schedule/semester-imports/${semesterImportId}`
const auth = useAuthStore()
const sections = {
  institutions: 'Заклади',
  periods: 'Навчальні періоди',
  subjects: 'Предмети',
  teachers: 'Викладачі',
}
const purposes = {
  institutions:
    'Додайте університет або інший заклад, щоб об’єднати його предмети, викладачів і навчальні періоди.',
  periods: 'Семестр або інший навчальний період визначає дати занять і межі імпорту розкладу.',
  subjects:
    'Предмети пов’язують ваші заняття, завдання та статистику. Додайте ті, які вивчаєте зараз.',
  teachers:
    'Збережіть викладачів, щоб призначати їх заняттям. Для семестрової пари потрібен один викладач.',
}
const emptyTitles = {
  institutions: 'Додайте свій навчальний заклад',
  periods: 'Вкажіть дати першого семестру',
  subjects: 'Додайте перший предмет',
  teachers: 'Додайте першого викладача',
}
const createLabels = {
  institutions: 'Додати заклад',
  periods: 'Додати період',
  subjects: 'Додати предмет',
  teachers: 'Додати викладача',
}
const deletionNotes = {
  institutions: 'Пов’язані періоди, предмети та викладачі збережуться без прив’язки до закладу.',
  periods:
    'Сервер перевірить зв’язки з розкладом та історією імпорту. Видалення може бути відхилено.',
  subjects:
    'Завдання збережуться без цього предмета. Сервер може відхилити видалення через пов’язані записи розкладу.',
  teachers:
    'Заняття збережуться без прив’язки до викладача. Сервер перевірить можливість видалення.',
}
const collection = useResource(async (signal) => {
  if (kind === 'institutions') {
    const { data } = await academicApi.institutions.list(signal)
    return { records: data as AcademicRecord[], institutions: data }
  }
  const [records, institutions] = await Promise.all([
    academicApi[kind].list(signal),
    academicApi.institutions.list(signal),
  ])
  return { records: records.data as AcademicRecord[], institutions: institutions.data }
})
const context = useAcademicContext(
  () => (kind === 'periods' ? ((collection.data.value?.records as AcademicPeriod[]) ?? []) : []),
  () => collection.data.value?.institutions ?? [],
)
const canCreate = computed(() => {
  if (!collection.data.value || collection.loading.value || collection.error.value) return false
  if (kind === 'institutions') return collection.data.value.institutions.length === 0
  if (!context.institution.value) return false
  return kind !== 'periods' || context.currentPeriods.value.length === 0
})
const paginated = kind === 'subjects' || kind === 'teachers'
const institutionFilter = ref('')
const page = ref(1)
const pageSize = 12
watch(
  institutionFilter,
  () => {
    page.value = 1
  },
  { flush: 'sync' },
)
const visibleRecords = computed(
  () =>
    collection.data.value?.records.filter(
      (record) =>
        (!('ends_on' in record) || record.ends_on >= context.date.value) &&
        (!paginated ||
          !institutionFilter.value ||
          ('education_institution_id' in record &&
            String(record.education_institution_id ?? 'none') === institutionFilter.value)),
    ) ?? [],
)
const lastPage = computed(() => Math.max(1, Math.ceil(visibleRecords.value.length / pageSize)))
watch(
  lastPage,
  (last) => {
    page.value = Math.min(page.value, last)
  },
  { flush: 'sync' },
)
const pageRecords = computed(() =>
  paginated
    ? visibleRecords.value.slice((page.value - 1) * pageSize, page.value * pageSize)
    : visibleRecords.value,
)
const historicalPeriods = computed(() =>
  kind === 'periods'
    ? ((collection.data.value?.records as AcademicPeriod[]) ?? []).filter(
        (period) => period.ends_on < context.date.value,
      )
    : [],
)
const academicIssue = computed(() => {
  if (!collection.data.value) return ''
  if (collection.data.value.institutions.length > 1 && !context.institution.value)
    return 'Збережено кілька навчальних закладів. Виберіть поточний у розділі «Заклади». Інші заклади та пов’язані дані залишаться збереженими.'
  if (kind !== 'institutions' && !context.institution.value)
    return 'Спочатку додайте навчальний заклад. Він автоматично використовуватиметься для нових записів.'
  if (kind === 'periods' && context.currentPeriods.value.length > 1)
    return 'Кілька періодів охоплюють поточну дату. Відредагуйте їхні межі, щоб залишився один актуальний період. Історичні записи збережено.'
  return ''
})
const editor = ref<{ id: number | null } | null>(null)
const detail = useResource<AcademicRecord | null>(
  async (signal) =>
    editor.value?.id ? (await academicApi[kind].get(editor.value.id, signal)).data : null,
  [() => editor.value?.id],
)
const deleting = ref<AcademicRecord | null>(null)
const busy = ref(false)
const error = ref<unknown>(null)
const success = ref('')
const dirty = ref(false)
const controller = new AbortController()
onScopeDispose(() => controller.abort())
function open(id: number | null) {
  if (id === null && !canCreate.value) return
  error.value = null
  success.value = ''
  dirty.value = false
  editor.value = { id }
}
function close() {
  if (!busy.value && (!dirty.value || window.confirm('Закрити форму без збереження?'))) {
    editor.value = null
    dirty.value = false
  }
}
function leave() {
  return (
    !auth.user ||
    (!busy.value && (!dirty.value || window.confirm('Залишити сторінку без збереження?')))
  )
}
onBeforeRouteLeave(leave)
onBeforeRouteUpdate(leave)
async function save(draft: AcademicDraft) {
  if (busy.value || !editor.value) return
  busy.value = true
  error.value = null
  const id = editor.value.id
  try {
    if (!id && !canCreate.value)
      throw new ApiError(422, {
        name: ['Створення недоступне: перевірте актуальний заклад і навчальний період.'],
      })
    if (draft.kind === 'periods') {
      const existing = (collection.data.value?.records as AcademicPeriod[]) ?? []
      if (
        existing.some(
          (period) =>
            period.id !== id &&
            period.ends_on >= context.date.value &&
            draft.value.starts_on <= period.ends_on &&
            draft.value.ends_on >= period.starts_on,
        )
      )
        throw new ApiError(422, {
          starts_on: [
            'Ці дати перетинаються з іншим незавершеним періодом. Уточніть межі, щоб актуальний період визначався однозначно.',
          ],
        })
    }
    // Explicit dispatch keeps each input tied to its actual backend contract.
    switch (draft.kind) {
      case 'institutions':
        if (id) await academicApi.institutions.update(id, draft.value, controller.signal)
        else await academicApi.institutions.create(draft.value, controller.signal)
        break
      case 'periods':
        if (id) await academicApi.periods.update(id, draft.value, controller.signal)
        else await academicApi.periods.create(draft.value, controller.signal)
        break
      case 'subjects':
        if (id) await academicApi.subjects.update(id, draft.value, controller.signal)
        else await academicApi.subjects.create(draft.value, controller.signal)
        break
      case 'teachers':
        if (id) await academicApi.teachers.update(id, draft.value, controller.signal)
        else await academicApi.teachers.create(draft.value, controller.signal)
        break
    }
    if (controller.signal.aborted) return
    editor.value = null
    dirty.value = false
    success.value = 'Запис збережено.'
    await collection.reload()
  } catch (e) {
    if (!controller.signal.aborted) error.value = e
  } finally {
    if (!controller.signal.aborted) busy.value = false
  }
}
function confirmDelete(record: AcademicRecord) {
  deleting.value = record
  error.value = null
  success.value = ''
}
async function remove() {
  if (busy.value || !deleting.value) return
  busy.value = true
  error.value = null
  try {
    await academicApi[kind].remove(deleting.value.id, controller.signal)
    if (controller.signal.aborted) return
    deleting.value = null
    success.value = 'Запис видалено.'
    await collection.reload()
  } catch (e) {
    if (!controller.signal.aborted) error.value = e
  } finally {
    if (!controller.signal.aborted) busy.value = false
  }
}
function institutionName(record: AcademicRecord, institutions: EducationInstitution[]) {
  return 'education_institution_id' in record
    ? (institutions.find((i) => i.id === record.education_institution_id)?.name ?? 'Без закладу')
    : ''
}
</script>
<template>
  <div class="page-workspace page-catalog" :class="{ 'catalog-full-width': !paginated }">
    <header class="page-heading">
      <div>
        <p class="eyebrow">АКАДЕМІЧНИЙ ПРОСТІР</p>
        <h1>{{ sections[kind] }}</h1>
        <p class="muted">{{ purposes[kind] }}</p>
      </div>
      <AppButton
        v-if="canCreate"
        variant="primary"
        :disabled="busy || collection.loading.value || !!collection.error.value"
        @click="open(null)"
      >
        {{ createLabels[kind] }}
      </AppButton>
    </header>
    <p v-if="semesterImportId" class="schedule-warning">
      Виправлення назв для імпорту. Після збереження поверніться до пакета й повторно перевірте
      його.
      <RouterLink :to="importLink" class="text-link">Повернутися до перевірки імпорту →</RouterLink>
    </p>
    <nav class="section-nav" aria-label="Розділи навчального простору">
      <RouterLink
        v-for="(label, key) in sections"
        :key="key"
        :to="{
          path: `/academic/${key}`,
          query: semesterImportId ? { semester_import: semesterImportId } : {},
        }"
        active-class="active"
      >
        {{ label }}
      </RouterLink>
    </nav>
    <AppCard
      v-if="kind === 'institutions' && (collection.data.value?.institutions.length ?? 0) > 1"
    >
      <FormField
        id="current-institution"
        label="Поточний навчальний заклад"
        hint="Вибір діє для нових записів і зберігається в цьому браузері для вашого облікового запису. Інші заклади не видаляються."
        v-slot="f"
      >
        <select
          :id="f.id"
          :value="context.institution.value?.id ?? ''"
          :aria-describedby="f.describedby"
          :disabled="busy"
          @change="context.chooseInstitution(Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="" disabled>Виберіть поточний заклад</option>
          <option
            v-for="institution in collection.data.value?.institutions"
            :key="institution.id"
            :value="institution.id"
          >
            {{ institution.name }}
          </option>
        </select>
      </FormField>
    </AppCard>
    <FormField v-if="paginated" id="catalog-institution" label="Навчальний заклад" v-slot="f">
      <select :id="f.id" v-model="institutionFilter" :disabled="collection.loading.value || busy">
        <option value="">Усі заклади</option>
        <option value="none">Без закладу</option>
        <option
          v-for="institution in collection.data.value?.institutions"
          :key="institution.id"
          :value="String(institution.id)"
        >
          {{ institution.name }}
        </option>
      </select>
    </FormField>
    <p v-if="academicIssue" class="schedule-warning" role="alert">
      {{ academicIssue }}
      <RouterLink v-if="kind !== 'institutions'" to="/academic/institutions" class="text-link">
        Переглянути заклади
      </RouterLink>
    </p>
    <p
      v-if="
        collection.data.value &&
        kind === 'periods' &&
        !academicIssue &&
        !context.currentPeriods.value.length
      "
      class="scope-notice"
    >
      Немає актуального періоду на сьогодні. Створіть його або уточніть дати запланованого періоду.
      Завершені записи залишаються в історії.
    </p>
    <p v-if="success" class="success-notice" role="status">{{ success }}</p>
    <AppCard
      v-if="
        collection.loading.value ||
        collection.error.value ||
        visibleRecords.length ||
        !historicalPeriods.length
      "
    >
      <LoadingState v-if="collection.loading.value" />
      <ErrorState
        v-else-if="collection.error.value"
        :error="collection.error.value"
        retry
        @retry="collection.reload"
      />
      <EmptyState
        v-else-if="!visibleRecords.length"
        :title="emptyTitles[kind]"
        :description="purposes[kind]"
      />
      <div v-else class="academic-list">
        <article v-for="record in pageRecords" :key="record.id" class="academic-row">
          <div>
            <h3>{{ record.name }}</h3>
            <span
              v-if="kind === 'institutions' && record.id === context.institution.value?.id"
              class="badge"
            >
              Поточний заклад
            </span>
            <p v-if="kind !== 'institutions'" class="helper">
              {{ institutionName(record, collection.data.value?.institutions ?? []) }}
            </p>
            <p v-if="'starts_on' in record" class="helper">
              {{ calendarLabel(record.starts_on) }} — {{ calendarLabel(record.ends_on) }}
            </p>
            <p v-if="'code' in record && record.code !== null" class="helper">
              Код: {{ record.code || 'порожній' }}
            </p>
            <p v-if="'color' in record && record.color" class="helper inline">
              <span
                class="color-dot"
                :style="{ backgroundColor: record.color }"
                aria-hidden="true"
              ></span>
              Колір предмета
            </p>
          </div>
          <div class="actions">
            <AppButton
              :disabled="busy"
              :aria-label="`Редагувати: ${record.name}`"
              @click="open(record.id)"
            >
              Редагувати
            </AppButton>
            <AppButton
              variant="danger"
              :disabled="busy"
              :aria-label="`Видалити: ${record.name}`"
              @click="confirmDelete(record)"
            >
              Видалити
            </AppButton>
          </div>
        </article>
      </div>
    </AppCard>
    <PageNavigation
      v-if="
        paginated && !collection.loading.value && !collection.error.value && visibleRecords.length
      "
      :current="page"
      :last="lastPage"
      :total="visibleRecords.length"
      :busy="busy"
      @page="page = $event"
    />
    <details v-if="historicalPeriods.length" class="secondary-disclosure">
      <summary>Завершені періоди · {{ historicalPeriods.length }}</summary>
      <p class="helper">
        Вони не використовуються в нових заняттях та імпортах. Розклади й пов’язана історія
        збережені.
      </p>
      <div class="academic-list">
        <article v-for="period in historicalPeriods" :key="period.id" class="academic-row">
          <div>
            <h3>{{ period.name }}</h3>
            <p class="helper">
              {{ calendarLabel(period.starts_on) }} — {{ calendarLabel(period.ends_on) }}
            </p>
          </div>
          <AppButton
            :disabled="busy"
            :aria-label="`Редагувати: ${period.name}`"
            @click="open(period.id)"
          >
            Редагувати
          </AppButton>
        </article>
      </div>
    </details>
    <AppModal
      v-if="editor"
      :title="
        editor.id ? `Редагувати: ${detail.data.value?.name ?? sections[kind]}` : createLabels[kind]
      "
      :busy="busy"
      @close="close"
    >
      <LoadingState v-if="detail.loading.value" />
      <ErrorState
        v-else-if="detail.error.value"
        :error="detail.error.value"
        retry
        @retry="detail.reload"
      />
      <template v-else>
        <FormNotice :error="error" />
        <AcademicForm
          :key="editor.id ?? 'new'"
          :kind="kind"
          :record="detail.data.value ?? undefined"
          :institutions="
            !editor.id && context.institution.value
              ? [context.institution.value]
              : (collection.data.value?.institutions ?? [])
          "
          :errors="fieldErrors(error)"
          :busy="busy"
          @submit="save"
          @close="close"
          @dirty="dirty = $event"
        />
      </template>
    </AppModal>
    <ConfirmDialog
      v-if="deleting"
      title="Видалити запис?"
      :busy="busy"
      :error="error"
      @close="deleting = null"
      @confirm="remove"
    >
      <p>«{{ deleting.name }}». {{ deletionNotes[kind] }}</p>
    </ConfirmDialog>
  </div>
</template>
