<script setup lang="ts">
import { computed, reactive, ref, watch, onScopeDispose } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { tasksApi, subjectsApi } from '@/api/endpoints'
import type { Task, TaskFilters, Priority, TaskLifecycleAction } from '@/types/api'
import { ApiError } from '@/api/client'
import { taskStatusLabels } from '@/utils/tasks'
import { useResource } from '@/composables/useResource'
import { toUtc } from '@/utils/dates'
import TaskDateTimeField from '@/components/ui/TaskDateTimeField.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import TaskCard from '@/components/domain/TaskCard.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
const auth = useAuthStore()
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const status = ref('')
const priority = ref('')
const subject = ref('')
const deadline = ref('')
const deadlineFrom = ref('')
const page = ref(1)
const deadlineRange = ref<{ from?: string; to?: string }>({})
const filters = computed<TaskFilters>(() => ({
  status: status.value ? (status.value as Task['status']) : undefined,
  priority: priority.value ? (Number(priority.value) as Priority) : undefined,
  subject_id: subject.value ? Number(subject.value) : undefined,
  deadline_from: deadlineRange.value.from,
  deadline_to: deadlineRange.value.to,
  page: page.value,
}))
const filterError = ref('')
const applied = ref<TaskFilters>({})
watch([status, priority, subject], () => {
  page.value = 1
  apply()
})
function resetFilters() {
  status.value = ''
  priority.value = ''
  subject.value = ''
  deadline.value = ''
  deadlineFrom.value = ''
  deadlineRange.value = {}
  page.value = 1
  apply()
}
function applyDeadline() {
  filterError.value = ''
  try {
    const from = toUtc(deadlineFrom.value, timezone.value) ?? undefined
    const to = toUtc(deadline.value, timezone.value) ?? undefined
    if (from && to && from > to)
      throw new Error('Кінець періоду дедлайну має бути не раніше початку.')
    deadlineRange.value = { from, to }
    page.value = 1
    apply()
  } catch (reason) {
    filterError.value = reason instanceof Error ? reason.message : 'Перевірте дедлайн.'
  }
}
function apply() {
  filterError.value = ''
  try {
    const candidate = { ...filters.value }
    if (
      candidate.deadline_from &&
      candidate.deadline_to &&
      candidate.deadline_from > candidate.deadline_to
    )
      throw new Error('Кінець періоду дедлайну має бути не раніше початку.')
    applied.value = candidate
  } catch (e) {
    filterError.value = e instanceof Error ? e.message : 'Перевірте дедлайн.'
  }
}
watch(page, apply)
const { data, loading, error, reload } = useResource(
  (signal) => tasksApi.list(applied.value, signal),
  [applied],
)
const subjects = useResource(subjectsApi)
watch(data, (value) => {
  if (value && page.value > value.meta.last_page) page.value = Math.max(1, value.meta.last_page)
})
const pendingDelete = ref<Task | null>(null)
const deleting = ref(false)
const deleteError = ref<unknown>(null)
const busyIds = reactive(new Set<number>())
const blockedIds = reactive(new Set<number>())
const actionError = ref<unknown>(null)
const reconciliationError = ref<unknown>(null)
const actionNotice = ref('')
const success = ref('')
let active = true
onScopeDispose(() => {
  active = false
})
async function readCurrent(id: number) {
  const current = (await tasksApi.get(id)).data
  if (!active) return
  if (data.value)
    data.value = {
      ...data.value,
      data: data.value.data.map((task) => (task.id === id ? current : task)),
    }
  blockedIds.delete(id)
  await reload()
}
async function refreshTask(id: number) {
  if (busyIds.has(id)) return
  busyIds.add(id)
  reconciliationError.value = null
  try {
    await readCurrent(id)
    if (active) {
      actionError.value = null
      actionNotice.value =
        'Поточні дані перевірено. Це не повторює попередню зміну; перед новою дією перевірте стан завдання.'
    }
  } catch (e) {
    if (active) {
      reconciliationError.value = e
      if (e instanceof ApiError && e.status === 404) await reload()
    }
  } finally {
    if (active) busyIds.delete(id)
  }
}
async function changeStatus(task: Task, action: TaskLifecycleAction) {
  if (
    busyIds.has(task.id) ||
    blockedIds.has(task.id) ||
    (action === 'miss' && task.status === 'completed')
  )
    return
  busyIds.add(task.id)
  actionError.value = null
  reconciliationError.value = null
  actionNotice.value = ''
  success.value = ''
  try {
    const response = await tasksApi[action](task.id)
    if (!active) return
    success.value = `Стан завдання збережено: «${taskStatusLabels[response.data.status]}».`
    await reload()
  } catch (e) {
    if (!active) return
    actionError.value = e
    if (e instanceof ApiError && e.status === 409) {
      blockedIds.add(task.id)
      actionNotice.value =
        'Конфлікт стану завдання. Читаємо актуальний запис. Завершене завдання не відкривається автоматично; повернення до виконання потребує окремої дії.'
      try {
        await readCurrent(task.id)
      } catch (reason) {
        if (active) reconciliationError.value = reason
      }
    } else if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) {
      blockedIds.add(task.id)
      actionNotice.value =
        'Результат зміни стану невідомий. Запит міг зберегтися; повторне надсилання заблоковано. Перевірте поточний стан перед новою дією. Автоматичного повтору не було.'
    } else if (e.status === 404) await reload()
  } finally {
    if (active) busyIds.delete(task.id)
  }
}
function confirmDelete(task: Task) {
  pendingDelete.value = task
  deleteError.value = null
}
async function remove() {
  if (!pendingDelete.value) return
  deleting.value = true
  deleteError.value = null
  try {
    await tasksApi.remove(pendingDelete.value.id)
    pendingDelete.value = null
    success.value = 'Завдання видалено.'
    await reload()
  } catch (e) {
    deleteError.value = e
  } finally {
    deleting.value = false
  }
}
</script>
<template>
  <div class="page-workspace page-work">
    <header class="page-heading">
      <div>
        <p class="eyebrow">КРОК ЗА КРОКОМ</p>
        <h1>Завдання</h1>
        <p class="muted">Тримайте навчальні справи у фокусі.</p>
      </div>
      <RouterLink to="/tasks/new" class="button primary">+ Створити завдання</RouterLink>
    </header>
    <AppCard class="filter-controls">
      <div class="filters">
        <div class="field">
          <label for="status-filter">Статус</label>
          <select id="status-filter" v-model="status">
            <option value="">Усі статуси</option>
            <option value="pending">Очікує виконання</option>
            <option value="missed">Не виконано</option>
            <option value="completed">Виконано</option>
          </select>
        </div>
        <div class="field">
          <label for="priority-filter">Пріоритет</label>
          <select id="priority-filter" v-model="priority">
            <option value="">Усі пріоритети</option>
            <option value="3">Високий</option>
            <option value="2">Звичайний</option>
            <option value="1">Низький</option>
          </select>
        </div>
        <div class="field">
          <label for="subject-filter">Предмет</label>
          <select
            id="subject-filter"
            v-model="subject"
            :disabled="subjects.loading.value || !!subjects.error.value"
          >
            <option value="">Усі предмети</option>
            <option
              v-for="item in subjects.data.value?.data"
              :key="item.id"
              :value="String(item.id)"
            >
              {{ item.name }}
            </option>
          </select>
        </div>
      </div>
      <details class="filters-disclosure" :open="!!filterError || !!deadline || !!deadlineFrom">
        <summary>Період дедлайну</summary>
        <form class="deadline-filter" @submit.prevent="applyDeadline">
          <TaskDateTimeField
            id="deadline-from-filter"
            v-model="deadlineFrom"
            label="Дедлайн від"
            :timezone="timezone"
          />
          <TaskDateTimeField
            id="deadline-filter"
            v-model="deadline"
            label="Дедлайн до"
            :timezone="timezone"
          />
          <AppButton type="submit">Застосувати</AppButton>
        </form>

        <span class="helper">
          Прострочено — минув дедлайн. «Не виконано» — ви позначили результат.
        </span>
      </details>
      <p v-if="filterError" class="field-error" role="alert">{{ filterError }}</p>
      <div class="actions">
        <AppButton @click="resetFilters">Скинути фільтри</AppButton>
      </div>
      <ErrorState
        v-if="subjects.error.value"
        :error="subjects.error.value"
        retry
        @retry="subjects.reload"
      />
    </AppCard>
    <p v-if="success" class="success-notice" role="status">{{ success }}</p>
    <FormNotice :error="actionError" />
    <p v-if="actionNotice" role="status" class="planning-warning">{{ actionNotice }}</p>
    <FormNotice :error="reconciliationError" />
    <div v-if="blockedIds.size" class="actions">
      <AppButton
        v-for="id in blockedIds"
        :key="id"
        :busy="busyIds.has(id)"
        @click="refreshTask(id)"
      >
        Перевірити стан: {{ data?.data.find((task) => task.id === id)?.title ?? 'завдання' }}
      </AppButton>
    </div>
    <AppCard class="task-list">
      <LoadingState v-if="loading" />
      <template v-else-if="error">
        <FormNotice :error="error" />
        <AppButton @click="reload">Спробувати ще раз</AppButton>
      </template>
      <EmptyState
        v-else-if="!data?.data.length"
        title="Завдань поки немає"
        description="Створіть завдання або змініть фільтри."
      />
      <div v-else>
        <TaskCard
          v-for="task in data.data"
          :key="task.id"
          :task="task"
          :timezone="timezone"
          :subject="subjects.data.value?.data.find((s) => s.id === task.subject_id)?.name"
          :busy="busyIds.has(task.id) || blockedIds.has(task.id)"
          actions
          @lifecycle="changeStatus(task, $event)"
          @remove="confirmDelete(task)"
        />
      </div>
      <footer
        v-if="data && data.meta.last_page > 1"
        class="pagination"
        aria-label="Сторінки завдань"
      >
        <AppButton :disabled="page <= 1 || loading" @click="page--">← Назад</AppButton>
        <span class="helper">
          {{ data.meta.current_page }} / {{ data.meta.last_page }} · Усього {{ data.meta.total }}
        </span>
        <AppButton :disabled="page >= data.meta.last_page || loading" @click="page++">
          Далі →
        </AppButton>
      </footer>
    </AppCard>
    <ConfirmDialog
      v-if="pendingDelete"
      title="Видалити завдання?"
      :busy="deleting"
      :error="deleteError"
      @close="pendingDelete = null"
      @confirm="remove"
    >
      <p>
        «{{ pendingDelete.title }}» буде видалено разом із підзавданнями. Пов’язані заплановані
        сесії та нагадування буде скасовано.
      </p>
    </ConfirmDialog>
  </div>
</template>
