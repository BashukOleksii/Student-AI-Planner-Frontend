<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { tasksApi, subjectsApi } from '@/api/endpoints'
import type { Task, TaskFilters, Priority } from '@/types/api'
import { useResource } from '@/composables/useResource'
import { toUtc } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
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
const page = ref(1)
const filters = computed<TaskFilters>(() => ({
  status: status.value ? (status.value as Task['status']) : undefined,
  priority: priority.value ? (Number(priority.value) as Priority) : undefined,
  subject_id: subject.value ? Number(subject.value) : undefined,
  deadline_to: deadline.value ? (toUtc(deadline.value, timezone.value) ?? undefined) : undefined,
  page: page.value,
}))
const filterError = ref('')
const applied = ref<TaskFilters>({})
watch([status, priority, subject], () => {
  page.value = 1
  apply()
})
function applyDeadline() {
  page.value = 1
  apply()
}
function apply() {
  filterError.value = ''
  try {
    applied.value = { ...filters.value }
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
const pendingDelete = ref<Task | null>(null)
const deleting = ref(false)
const deleteError = ref<unknown>(null)
const busyIds = reactive(new Set<number>())
const actionError = ref<unknown>(null)
const success = ref('')
async function toggle(task: Task) {
  busyIds.add(task.id)
  actionError.value = null
  success.value = ''
  try {
    await (task.status === 'completed' ? tasksApi.reopen(task.id) : tasksApi.complete(task.id))
    success.value = task.status === 'completed' ? 'Завдання відновлено.' : 'Завдання виконано.'
    await reload()
  } catch (e) {
    actionError.value = e
  } finally {
    busyIds.delete(task.id)
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
    if (data.value?.data.length === 1 && page.value > 1) page.value--
    else await reload()
  } catch (e) {
    deleteError.value = e
  } finally {
    deleting.value = false
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <p class="eyebrow">КРОК ЗА КРОКОМ</p>
      <h1>Завдання</h1>
      <p class="muted">Тримайте навчальні справи у фокусі.</p>
    </div>
    <RouterLink to="/tasks/new" class="button primary">+ Створити завдання</RouterLink>
  </header>
  <AppCard>
    <div class="filters">
      <div class="field">
        <label for="status-filter">Статус</label>
        <select id="status-filter" v-model="status">
          <option value="">Усі статуси</option>
          <option value="pending">До виконання</option>
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
          <option v-for="item in subjects.data.value?.data" :key="item.id" :value="String(item.id)">
            {{ item.name }}
          </option>
        </select>
      </div>
      <form class="deadline-filter" @submit.prevent="applyDeadline">
        <div class="field">
          <label for="deadline-filter">Дедлайн до ({{ timezone }})</label>
          <input id="deadline-filter" v-model="deadline" type="datetime-local" step="1" />
        </div>
        <AppButton type="submit">Застосувати</AppButton>
      </form>
    </div>
    <p v-if="filterError" class="field-error" role="alert">{{ filterError }}</p>
    <ErrorState
      v-if="subjects.error.value"
      :error="subjects.error.value"
      retry
      @retry="subjects.reload"
    />
  </AppCard>
  <p v-if="success" class="success-notice" role="status">{{ success }}</p>
  <ErrorState v-if="actionError" :error="actionError" />
  <AppCard class="task-list">
    <LoadingState v-if="loading" />
    <ErrorState v-else-if="error" :error="error" retry @retry="reload" />
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
        :busy="busyIds.has(task.id)"
        actions
        @toggle="toggle(task)"
        @remove="confirmDelete(task)"
      />
    </div>
    <footer v-if="data && data.meta.last_page > 1" class="pagination" aria-label="Сторінки завдань">
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
      «{{ pendingDelete.title }}» буде видалено разом із підзавданнями. Пов’язані заплановані сесії
      та нагадування буде скасовано.
    </p>
  </ConfirmDialog>
</template>
