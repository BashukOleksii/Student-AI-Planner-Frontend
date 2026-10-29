<script setup lang="ts">
import { ref, onScopeDispose } from 'vue'
import { useRoute, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { importReturnId } from '@/utils/scheduleImport'
import { academicApi } from '@/api/academic'
import { fieldErrors } from '@/api/client'
import type { AcademicKind, AcademicRecord, AcademicDraft, EducationInstitution } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { calendarLabel } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import AcademicForm from '@/components/domain/AcademicForm.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
const route = useRoute()
const kind = route.params.section as AcademicKind
const importBatchId = importReturnId(route.query.import_batch)
const auth = useAuthStore()
const sections = {
  institutions: 'Заклади',
  periods: 'Навчальні періоди',
  subjects: 'Предмети',
  teachers: 'Викладачі',
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
  <header class="page-heading">
    <div>
      <p class="eyebrow">АКАДЕМІЧНИЙ ПРОСТІР</p>
      <h1>Навчання</h1>
      <p class="muted">Заклади, періоди, предмети та люди вашого навчального простору.</p>
    </div>
    <AppButton
      variant="primary"
      :disabled="busy || collection.loading.value || !!collection.error.value"
      @click="open(null)"
    >
      {{ createLabels[kind] }}
    </AppButton>
  </header>
  <p v-if="importBatchId" class="schedule-warning">
    Виправлення для імпорту №{{ importBatchId }}. Після збереження поверніться до пакета й повторно
    перевірте його.
    <RouterLink :to="`/schedule/imports/${importBatchId}`" class="text-link">
      Повернутися до імпорту №{{ importBatchId }} →
    </RouterLink>
  </p>
  <nav class="section-nav" aria-label="Розділи навчального простору">
    <RouterLink
      v-for="(label, key) in sections"
      :key="key"
      :to="{
        path: `/academic/${key}`,
        query: importBatchId ? { import_batch: importBatchId } : {},
      }"
      active-class="active"
    >
      {{ label }}
    </RouterLink>
  </nav>
  <p v-if="success" class="success-notice" role="status">{{ success }}</p>
  <AppCard :title="sections[kind]">
    <LoadingState v-if="collection.loading.value" />
    <ErrorState
      v-else-if="collection.error.value"
      :error="collection.error.value"
      retry
      @retry="collection.reload"
    />
    <EmptyState
      v-else-if="!collection.data.value?.records.length"
      title="Записів поки немає"
      description="Додайте перший запис до свого навчального простору."
    />
    <div v-else class="academic-list">
      <article
        v-for="record in collection.data.value.records"
        :key="record.id"
        class="academic-row"
      >
        <div>
          <h3>{{ record.name }}</h3>
          <p v-if="kind !== 'institutions'" class="helper">
            {{ institutionName(record, collection.data.value.institutions) }}
          </p>
          <p v-if="'starts_on' in record" class="helper">
            {{ calendarLabel(record.starts_on) }} — {{ calendarLabel(record.ends_on) }}
            <span>({{ record.starts_on }} — {{ record.ends_on }})</span>
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
            {{ record.color }}
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
  <AppModal
    v-if="editor"
    :title="editor.id ? 'Редагувати запис' : createLabels[kind]"
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
        :institutions="collection.data.value?.institutions ?? []"
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
</template>
