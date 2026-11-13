<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { tasksApi, subjectsApi } from '@/api/endpoints'
import { taskListPage, type TaskListFilters } from '@/api/taskList'
import type { Task, Priority, TaskLifecycleAction } from '@/types/api'
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
import WorkCompletionDialog from '@/components/domain/WorkCompletionDialog.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
const auth = useAuthStore()
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const status = ref<'active' | 'completed' | ''>('active')
const priority = ref('')
const subject = ref('')
const deadline = ref('')
const deadlineFrom = ref('')
const page = ref(1)
const deadlineRange = ref<{ from?: string; to?: string }>({})
const filters = computed<TaskListFilters>(() => ({
  status: status.value ? status.value : undefined,
  priority: priority.value ? (Number(priority.value) as Priority) : undefined,
  subject_id: subject.value ? Number(subject.value) : undefined,
  deadline_from: deadlineRange.value.from,
  deadline_to: deadlineRange.value.to,
  page: page.value,
  per_page: 15,
}))
const filterError = ref('')
const applied = ref<TaskListFilters>({ status: 'active', page: 1, per_page: 15 })
watch([status, priority, subject], () => {
  page.value = 1
  apply()
})
function resetFilters() {
  status.value = 'active'
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
  (signal) => taskListPage(applied.value, signal),
  [applied],
)
const subjects = useResource(subjectsApi)
watch(data, (value) => {
  if (value && page.value > value.meta.last_page) page.value = Math.max(1, value.meta.last_page)
})
const pendingDelete = ref<Task | null>(null)
const deleting = ref(false)
const deleteError = ref<unknown>(null)
const success = ref('')
const pendingCompletion = ref<Task | null>(null)
function changeStatus(task: Task, action: TaskLifecycleAction) {
  if (action === 'complete' && task.status !== 'completed' && !pendingCompletion.value)
    pendingCompletion.value = task
}
async function finished(type: 'task' | 'subtask') {
  pendingCompletion.value = null
  success.value = type === 'task' ? 'Завдання завершено.' : 'Підзавдання завершено.'
  await reload()
}
function closeCompletion() {
  pendingCompletion.value = null
  void reload()
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
          <span id="task-status-label">Завдання</span>
          <div
            class="segmented task-status-filter"
            role="group"
            aria-labelledby="task-status-label"
          >
            <button
              v-for="option in [
                { value: 'active', label: 'Активні' },
                { value: 'completed', label: 'Завершені' },
                { value: '', label: 'Усі' },
              ] as const"
              :key="option.value"
              type="button"
              :aria-pressed="status === option.value"
              @click="status = option.value"
            >
              {{ option.label }}
            </button>
          </div>
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
          :busy="pendingCompletion?.id === task.id || deleting"
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
    <WorkCompletionDialog
      v-if="pendingCompletion"
      :task-id="pendingCompletion.id"
      :title="pendingCompletion.title"
      :timezone="timezone"
      @close="closeCompletion"
      @completed="finished"
    />
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
