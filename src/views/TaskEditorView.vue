<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { tasksApi, subjectsApi } from '@/api/endpoints'
import { fieldErrors } from '@/api/client'
import type { TaskInput, Task } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { dateTime } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import TaskForm from '@/components/domain/TaskForm.vue'
import TaskSubtasks from '@/components/domain/TaskSubtasks.vue'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const id = Number(route.params.id) || null
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const task = useResource<Task | null>(async (signal) =>
  id ? (await tasksApi.get(id, signal)).data : null,
)
const subjects = useResource(subjectsApi)
const busy = ref(false)
const error = ref<unknown>(null)
const dirty = ref(false)
const saved = ref(false)
const controller = new AbortController()
async function submit(input: TaskInput) {
  busy.value = true
  error.value = null
  try {
    if (id && task.data.value) {
      const original = task.data.value
      const changes = Object.fromEntries(
        Object.entries(input).filter(([key, value]) => value !== original[key as keyof TaskInput]),
      ) as Partial<TaskInput>
      await tasksApi.update(id, changes, controller.signal)
    } else await tasksApi.create(input, controller.signal)
    if (!controller.signal.aborted) {
      saved.value = true
      dirty.value = false
      await router.push('/tasks')
    }
  } catch (e) {
    if (!controller.signal.aborted) error.value = e
  } finally {
    if (!controller.signal.aborted) busy.value = false
  }
}
function confirmLeave() {
  return (
    !auth.user ||
    !dirty.value ||
    saved.value ||
    window.confirm('Залишити сторінку? Незбережені зміни буде втрачено.')
  )
}
onBeforeRouteLeave(confirmLeave)
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value && !saved.value) {
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
  <header class="page-heading">
    <div>
      <RouterLink to="/tasks" class="text-link">← До завдань</RouterLink>
      <h1>{{ id ? 'Редагування завдання' : 'Нове завдання' }}</h1>
      <p class="muted">Невеликий крок до вашої навчальної мети.</p>
    </div>
  </header>
  <LoadingState v-if="task.loading.value" />
  <ErrorState v-else-if="task.error.value" :error="task.error.value" retry @retry="task.reload" />
  <AppCard v-else class="editor-card">
    <div v-if="task.data.value" class="task-detail-meta">
      <span class="badge">
        {{ task.data.value.status === 'completed' ? 'Виконано' : 'До виконання' }}
      </span>
      <p v-if="task.data.value.completed_at" class="helper">
        Виконано {{ dateTime(task.data.value.completed_at, timezone) }}
      </p>
    </div>
    <LoadingState v-if="subjects.loading.value" />
    <div v-if="subjects.error.value">
      <ErrorState :error="subjects.error.value" retry @retry="subjects.reload" />
      <p class="helper">Можна зберегти завдання без предмета.</p>
    </div>
    <FormNotice :error="error" />
    <TaskForm
      :task="task.data.value ?? undefined"
      :subjects="subjects.data.value?.data ?? []"
      :timezone="timezone"
      :errors="fieldErrors(error)"
      :busy="busy"
      @submit="submit"
      @dirty="dirty = $event"
    />
  </AppCard>
  <TaskSubtasks v-if="task.data.value" :task="task.data.value" :timezone="timezone" />
</template>
