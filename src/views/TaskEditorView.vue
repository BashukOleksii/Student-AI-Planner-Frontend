<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { tasksApi, subjectsApi } from '@/api/endpoints'
import { subtasksApi } from '@/api/subtasks'
import { ApiError, fieldErrors } from '@/api/client'
import type { TaskInput, Task, Subtask, SubtaskInput } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { useTaskCreationDraft, type DraftSubtask } from '@/stores/taskCreationDraft'
import { useResource } from '@/composables/useResource'
import { uncertainMutation } from '@/composables/useSemesterMutation'
import { dateTime, isOverdue, toUtc } from '@/utils/dates'
import { taskMinutes, taskStatusLabels } from '@/utils/tasks'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import TaskForm from '@/components/domain/TaskForm.vue'
import TaskSubtasks from '@/components/domain/TaskSubtasks.vue'
import SubtaskForm from '@/components/domain/SubtaskForm.vue'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const draft = useTaskCreationDraft()
const id = Number(route.params.id) || null
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const task = useResource<Task | null>(async (signal) =>
  id ? (await tasksApi.get(id, signal)).data : null,
)
const subjects = useResource(subjectsApi)
const relevant = computed(() => !id || draft.parent?.id === id)
const parent = computed(() => task.data.value ?? (relevant.value ? draft.parent : null))
const rows = computed(() => (relevant.value ? draft.items : []))
const busy = ref(false)
const error = ref<unknown>(null)
const childError = ref<unknown>(null)
const failedDraftKey = ref<string | null>(null)
const formDirty = ref(false)
const saved = ref(false)
const uncertain = ref(false)
const checked = ref(false)
const modal = ref<DraftSubtask | null | undefined>(undefined)
const modalDirty = ref(false)
const formContext = ref({ estimate: '', deadline: '' })
const serverChildren = ref<Subtask[]>([])
const childrenReady = ref(false)
const candidates = ref<Task[]>([])
const childCandidates = ref<Subtask[]>([])
const checkedChild = ref<string | null>(null)
const controller = new AbortController()
const pendingRows = computed(() => rows.value.filter((item) => !item.id))
const externalChildren = computed(() =>
  serverChildren.value.filter((item) => !rows.value.some((row) => row.id === item.id)),
)
const allocated = computed(() =>
  [...rows.value.map((item) => item.input), ...externalChildren.value].reduce(
    (sum, item) => sum + (item.estimated_minutes ?? 0),
    0,
  ),
)
const unestimated = computed(() =>
  [...rows.value.map((item) => item.input), ...externalChildren.value].some(
    (item) => item.estimated_minutes === null,
  ),
)
const budget = computed(() => {
  if (relevant.value && draft.parent && draft.input) return draft.input.estimated_minutes
  if (parent.value) return parent.value.estimated_minutes
  try {
    return taskMinutes(formContext.value.estimate)
  } catch {
    return null
  }
})
const parentDeadline = computed(() => {
  if (parent.value) return parent.value.deadline_at
  try {
    return toUtc(formContext.value.deadline, timezone.value)
  } catch {
    return null
  }
})
const remaining = computed(() =>
  budget.value === null
    ? null
    : budget.value - allocated.value + (modal.value?.input.estimated_minutes ?? 0),
)
const protectedDraft = computed(
  () =>
    formDirty.value ||
    modalDirty.value ||
    pendingRows.value.length > 0 ||
    (relevant.value && draft.parentUnknown) ||
    uncertain.value ||
    (relevant.value && !parent.value && !!draft.input),
)
async function allTasks() {
  const result: Task[] = []
  let page = 1
  while (true) {
    const response = await tasksApi.list({ page, per_page: 100 }, controller.signal)
    result.push(...response.data)
    if (page >= response.meta.last_page) return result
    page++
  }
}
function sameInput(value: Task | Subtask, input: TaskInput | SubtaskInput) {
  return Object.entries(input).every(([key, field]) => {
    const current = value[key as keyof typeof value]
    return key === 'deadline_at' && typeof field === 'string' && typeof current === 'string'
      ? Date.parse(field) === Date.parse(current)
      : current === field
  })
}
async function submit(input: TaskInput) {
  if (
    busy.value ||
    parent.value?.status === 'completed' ||
    uncertain.value ||
    (relevant.value && draft.parentUnknown) ||
    (!id && draft.parent)
  )
    return
  if (input.estimated_minutes !== null && input.estimated_minutes < allocated.value) return
  busy.value = true
  error.value = null
  let sent = false
  try {
    if (id && task.data.value) {
      const original = task.data.value
      const changes = Object.fromEntries(
        Object.entries(input).filter(([key, value]) => value !== original[key as keyof TaskInput]),
      ) as Partial<TaskInput>
      sent = true
      const response = await tasksApi.update(id, changes, controller.signal)
      task.data.value = response.data
      if (relevant.value && draft.parent) {
        draft.parent = response.data
        draft.input = input
      }
      formDirty.value = false
      if (pendingRows.value.length) await saveDraftChildren()
      else {
        saved.value = true
        await router.push('/tasks')
      }
    } else {
      draft.input = input
      draft.beforeIds = (await allTasks()).map((item) => item.id)
      sent = true
      draft.parent = (await tasksApi.create(input, controller.signal)).data
      formDirty.value = false
      await saveDraftChildren()
    }
  } catch (reason) {
    if (!controller.signal.aborted) {
      error.value = reason
      if (
        sent &&
        (uncertainMutation(reason) || (reason instanceof ApiError && reason.status === 409))
      ) {
        if (!id) draft.parentUnknown = true
        else uncertain.value = true
      }
    }
  } finally {
    busy.value = false
  }
}
async function saveDraftChildren() {
  if (!draft.parent || !relevant.value) return
  childError.value = null
  try {
    // Read before every new write so an unknown result can later be reconciled.
    const current = (await subtasksApi.list(draft.parent.id, controller.signal)).data
    serverChildren.value = current
    for (const item of pendingRows.value) {
      if (item.uncertain) return
      failedDraftKey.value = item.key
      const used = serverChildren.value.reduce((sum, row) => sum + (row.estimated_minutes ?? 0), 0)
      const limit = draft.input?.estimated_minutes
      if (
        limit != null &&
        item.input.estimated_minutes != null &&
        used + item.input.estimated_minutes > limit
      ) {
        throw new ApiError(422, {
          estimated_minutes: [
            `Ліміт перевищено на ${used + item.input.estimated_minutes - limit} хв.`,
          ],
        })
      }
      item.beforeIds = serverChildren.value.map((row) => row.id)
      try {
        const response = await subtasksApi.create(draft.parent.id, item.input, controller.signal)
        item.id = response.data.id
        serverChildren.value.push(response.data)
      } catch (reason) {
        if (uncertainMutation(reason) || (reason instanceof ApiError && reason.status === 409))
          item.uncertain = true
        throw reason
      }
    }
    if (!pendingRows.value.length) {
      const target = draft.parent.id
      draft.clear()
      saved.value = true
      formDirty.value = false
      await router.push(`/tasks/${target}`)
      if (id === target) await task.reload()
    }
  } catch (reason) {
    if (!controller.signal.aborted) childError.value = reason
  }
}
async function finishChildren() {
  if (busy.value || pendingRows.value.some((item) => item.uncertain)) return
  busy.value = true
  await saveDraftChildren()
  busy.value = false
}
async function inspectParent() {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    if (id) {
      await task.reload()
      checked.value = !task.error.value
    } else if (draft.input)
      candidates.value = (await allTasks()).filter(
        (item) => !draft.beforeIds.includes(item.id) && sameInput(item, draft.input!),
      )
  } catch (reason) {
    error.value = reason
  } finally {
    busy.value = false
  }
}
function adoptParent(value: Task) {
  if (!window.confirm(`Продовжити додавання підзавдань до «${value.title}»?`)) return
  draft.parent = value
  draft.parentUnknown = false
  formDirty.value = false
  candidates.value = []
}
async function inspectChild(item: DraftSubtask) {
  if (!draft.parent || busy.value) return
  busy.value = true
  childError.value = null
  try {
    serverChildren.value = (await subtasksApi.list(draft.parent.id, controller.signal)).data
    childCandidates.value = serverChildren.value.filter(
      (row) => !item.beforeIds?.includes(row.id) && sameInput(row, item.input),
    )
    checkedChild.value = item.key
  } catch (reason) {
    childError.value = reason
  } finally {
    busy.value = false
  }
}
function adoptChild(item: DraftSubtask, value: Subtask) {
  item.id = value.id
  item.uncertain = false
  childCandidates.value = []
  checkedChild.value = null
}
function closeModal() {
  if (busy.value || (modalDirty.value && !window.confirm('Закрити підзавдання без збереження?')))
    return
  modal.value = undefined
  modalDirty.value = false
}
function saveLocal(input: SubtaskInput) {
  childError.value = null
  failedDraftKey.value = null
  if (modal.value) modal.value.input = input
  else draft.items.push({ key: crypto.randomUUID(), input })
  modal.value = undefined
  modalDirty.value = false
  saved.value = false
}
function removeLocal(item: DraftSubtask) {
  if (item.id || item.uncertain) return
  if (window.confirm('Прибрати підзавдання з чернетки?'))
    draft.items = draft.items.filter((row) => row.key !== item.key)
}
function moveLocal(index: number, direction: number) {
  const other = draft.items[index + direction]
  const current = draft.items[index]
  if (!current || !other) return
  draft.items[index] = other
  draft.items[index + direction] = current
}
function reviewParent() {
  uncertain.value = false
  checked.value = false
}
function markFormDirty(value: boolean) {
  formDirty.value = value
  saved.value = false
}
function receiveChildren(value: Subtask[]) {
  serverChildren.value = value
  childrenReady.value = true
}
function confirmLeave() {
  if (!auth.user || saved.value) return true
  if (busy.value) return false
  return (
    !protectedDraft.value ||
    window.confirm(
      'Залишити сторінку? Незбережені зміни форми буде втрачено. Чернетка підзавдань зберігається лише в поточному сеансі застосунку.',
    )
  )
}
onBeforeRouteLeave(confirmLeave)
function beforeUnload(event: BeforeUnloadEvent) {
  if (busy.value || protectedDraft.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  controller.abort()
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>
<template>
  <div class="page-workspace page-editor task-editor-workspace">
    <header class="page-heading">
      <div>
        <RouterLink to="/tasks" class="text-link">← До завдань</RouterLink>
        <h1>{{ parent?.title ?? (id ? 'Редагування завдання' : 'Нове завдання') }}</h1>
        <p v-if="parent?.status !== 'completed'" class="muted">
          Укажіть справу та дедлайн. Нижче можна розкласти роботу на навчальні кроки.
        </p>
      </div>
    </header>
    <div v-if="parent" class="actions task-editor-navigation">
      <RouterLink
        v-if="parent.status === 'missed'"
        :to="{ path: '/planning/recovery', query: { task_id: parent.id } }"
        class="button secondary"
      >
        Відновити роботу
      </RouterLink>
      <RouterLink
        :to="{ path: '/reminders/new', query: { task_id: parent.id } }"
        class="button secondary"
      >
        Нагадування для завдання
      </RouterLink>
      <RouterLink
        :to="{ path: '/planning/sessions', query: { task_id: parent.id } }"
        class="text-link"
      >
        Навчальні сесії завдання
      </RouterLink>
    </div>
    <LoadingState v-if="task.loading.value" />
    <ErrorState v-else-if="task.error.value" :error="task.error.value" retry @retry="task.reload" />
    <AppCard v-else class="editor-card">
      <div v-if="parent" class="task-detail-meta">
        <span class="badge">{{ taskStatusLabels[parent.status] }}</span>
        <span v-if="isOverdue(parent.deadline_at, parent.status)" class="badge danger">
          Прострочено
        </span>
        <p v-if="parent.completed_at" class="helper">
          Виконано {{ dateTime(parent.completed_at, timezone) }}
        </p>
      </div>
      <LoadingState v-if="subjects.loading.value" />
      <ErrorState
        v-if="subjects.error.value"
        :error="subjects.error.value"
        retry
        @retry="subjects.reload"
      />
      <FormNotice :error="error" />
      <div
        v-if="uncertain || (relevant && draft.parentUnknown)"
        class="planning-warning"
        role="alert"
      >
        <p>
          Результат збереження потребує перевірки. Повторний запис заблоковано; автоматичного
          повтору не було.
        </p>
        <AppButton :busy="busy" @click="inspectParent">Перевірити актуальні завдання</AppButton>
        <AppButton v-if="id && checked" @click="reviewParent">Я звірив поточний стан</AppButton>
        <div v-for="candidate in candidates" :key="candidate.id" class="actions">
          <span>{{ candidate.title }} · {{ dateTime(candidate.deadline_at, timezone) }}</span>
          <AppButton @click="adoptParent(candidate)">Продовжити з цим завданням</AppButton>
        </div>
        <p v-if="!id" class="helper">
          Якщо запис не знайдено або дані неоднозначні, повторне створення залишається заблокованим.
          Перевірте список перед наступною дією.
        </p>
      </div>
      <dl
        v-if="parent?.status === 'completed'"
        class="report-values task-readonly"
        aria-label="Деталі завершеного завдання"
      >
        <div>
          <dt>Опис</dt>
          <dd>{{ parent.description || 'Без опису' }}</dd>
        </div>
        <div>
          <dt>Дедлайн</dt>
          <dd>{{ dateTime(parent.deadline_at, timezone) }}</dd>
        </div>
        <div>
          <dt>Тривалість</dt>
          <dd>
            {{
              parent.estimated_minutes === null ? 'Без оцінки' : `${parent.estimated_minutes} хв`
            }}
          </dd>
        </div>
        <div>
          <dt>Пріоритет</dt>
          <dd>{{ { 1: 'Низький', 2: 'Звичайний', 3: 'Високий' }[parent.priority] }}</dd>
        </div>
        <div v-if="parent.subject_id">
          <dt>Предмет</dt>
          <dd>
            {{
              subjects.data.value?.data.find((subject) => subject.id === parent?.subject_id)
                ?.name ?? 'Предмет недоступний'
            }}
          </dd>
        </div>
      </dl>
      <TaskForm
        v-else
        :task="task.data.value ?? undefined"
        :initial-input="relevant ? (draft.input ?? undefined) : undefined"
        :allocated-minutes="
          id
            ? serverChildren.reduce((sum, item) => sum + (item.estimated_minutes ?? 0), 0)
            : allocated
        "
        :subjects="subjects.data.value?.data ?? []"
        :timezone="timezone"
        :errors="fieldErrors(error)"
        :busy="busy"
        :blocked="
          (!!id && !childrenReady) ||
          (relevant && !!draft.parent && pendingRows.length > 0) ||
          uncertain ||
          (relevant && draft.parentUnknown) ||
          (!id && !!draft.parent)
        "
        @submit="submit"
        @dirty="markFormDirty"
        @context="formContext = $event"
      />
    </AppCard>
    <AppCard v-if="relevant && (!id || rows.length)" title="Підзавдання" class="subtasks-card">
      <template #action>
        <AppButton :disabled="busy || draft.parentUnknown" @click="modal = null">
          Додати підзавдання
        </AppButton>
      </template>
      <p v-if="draft.parent" class="scope-notice">
        Основне завдання вже створено. Збережено підзавдань:
        {{ rows.filter((item) => item.id).length }} із {{ rows.length }}. Батьківське завдання
        повторно не створюється.
      </p>
      <div class="task-effort-summary">
        <p>Основне завдання: {{ budget === null ? 'Без оцінки' : `${budget} хв` }}</p>
        <p>
          {{
            unestimated ? 'Розподілено за оціненими підзавданнями' : 'Розподілено на підзавдання'
          }}: {{ allocated }} хв
        </p>
        <p v-if="budget !== null">Залишилося: {{ budget - allocated }} хв</p>
      </div>
      <FormNotice :error="childError" />
      <p
        v-for="message in Object.values(fieldErrors(childError)).flat()"
        :key="message"
        class="field-error"
      >
        {{ message }}
      </p>
      <EmptyState
        v-if="!rows.length"
        title="Підзавдань поки немає"
        description="Додайте кроки до створення основного завдання."
      />
      <ol v-else class="subtask-list">
        <li v-for="(item, index) in rows" :key="item.key" class="subtask-row">
          <div>
            <h3>{{ item.input.title }}</h3>
            <p class="helper">
              {{
                item.input.estimated_minutes === null
                  ? 'Без оцінки часу'
                  : `${item.input.estimated_minutes} хв`
              }}
              · {{ dateTime(item.input.deadline_at, timezone) }}
            </p>
            <span class="badge">
              {{
                item.id ? 'Створено' : item.uncertain ? 'Результат потребує перевірки' : 'Чернетка'
              }}
            </span>
          </div>
          <div class="actions">
            <template v-if="!item.id && !item.uncertain">
              <AppButton :disabled="busy" @click="modal = item">Редагувати</AppButton>
              <AppButton :disabled="busy" @click="removeLocal(item)">Прибрати</AppButton>
              <AppButton
                :disabled="busy || index === 0 || !!draft.parent"
                aria-label="Перемістити вгору"
                @click="moveLocal(index, -1)"
              >
                ↑
              </AppButton>
              <AppButton
                :disabled="busy || index === rows.length - 1 || !!draft.parent"
                aria-label="Перемістити вниз"
                @click="moveLocal(index, 1)"
              >
                ↓
              </AppButton>
            </template>
            <AppButton v-if="item.uncertain" :busy="busy" @click="inspectChild(item)">
              Перевірити серверний стан
            </AppButton>
            <template v-if="checkedChild === item.key">
              <AppButton
                v-for="candidate in childCandidates"
                :key="candidate.id"
                @click="adoptChild(item, candidate)"
              >
                Підтвердити збережене підзавдання «{{ candidate.title }}»
              </AppButton>
              <p v-if="!childCandidates.length" class="helper">
                Відповідний запис не знайдено. Чернетку збережено; повторіть перевірку перед
                наступною дією.
              </p>
            </template>
          </div>
        </li>
      </ol>
      <div v-if="draft.parent" class="actions">
        <AppButton
          :busy="busy"
          :disabled="pendingRows.some((item) => item.uncertain)"
          @click="finishChildren"
        >
          Завершити додавання підзавдань
        </AppButton>
        <RouterLink :to="`/tasks/${draft.parent.id}`" class="button secondary">
          Відкрити створене завдання
        </RouterLink>
      </div>
    </AppCard>
    <TaskSubtasks
      v-if="id && task.data.value"
      :task="task.data.value"
      :timezone="timezone"
      :disabled="busy || !!pendingRows.length"
      :readonly="task.data.value.status === 'completed'"
      @children="receiveChildren"
    />
    <AppModal
      v-if="modal !== undefined"
      title="Підзавдання в чернетці"
      :busy="busy"
      @close="closeModal"
    >
      <SubtaskForm
        :subtask="modal?.input"
        :parent-deadline="parentDeadline"
        :remaining-minutes="remaining"
        :timezone="timezone"
        :errors="modal?.key === failedDraftKey ? fieldErrors(childError) : {}"
        :busy="busy"
        draft-mode
        @submit="saveLocal"
        @close="closeModal"
        @dirty="modalDirty = $event"
      />
    </AppModal>
  </div>
</template>
