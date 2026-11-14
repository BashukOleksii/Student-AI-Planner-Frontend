<script setup lang="ts">
import { useWorkLabels } from '@/composables/useWorkLabels'
import { ref, computed, onScopeDispose } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { remindersApi } from '@/api/reminders'
import { ApiError, fieldErrors } from '@/api/client'
import { useResource } from '@/composables/useResource'
import { useReminderTargets } from '@/composables/useReminderTargets'
import { useAuthStore } from '@/stores/auth'
import { taskStatusLabels } from '@/utils/tasks'
import type { ReminderInput, ReminderPatch } from '@/types/reminders'
import ReminderForm from '@/components/reminders/ReminderForm.vue'
import ReminderCard from '@/components/reminders/ReminderCard.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
import AppCard from '@/components/ui/AppCard.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore(),
  id = Number(route.params.id) || null,
  timezone = computed(() => auth.user?.timezone ?? 'UTC')
const detail = useResource(async (signal) =>
  id ? (await remindersApi.get(id, signal)).data : null,
)
const selection = useReminderTargets(id ? {} : route.query)
const {
  taskStatus,
  relativeAvailable,
  kind,
  taskId,
  childId,
  page,
  tasks,
  selectedTask,
  children,
  target,
} = selection
const busy = ref(false),
  error = ref<unknown>(null),
  uncertain = ref(false)
let active = true
onScopeDispose(() => {
  active = false
})
async function save(send: () => ReturnType<typeof remindersApi.create>) {
  if (busy.value || uncertain.value) return
  busy.value = true
  error.value = null
  try {
    const response = await send()
    if (active) await router.push(`/reminders/${response.data.id}`)
  } catch (e) {
    if (active) {
      error.value = e
      if (e instanceof ApiError && [0, 500, 502, 503].includes(e.status)) uncertain.value = true
    }
  } finally {
    if (active) busy.value = false
  }
}
function create(input: ReminderInput) {
  if (!id) void save(() => remindersApi.create(input))
}
function update(input: ReminderPatch) {
  if (id) void save(() => remindersApi.update(id, input))
}
const blocked = computed(
  () => uncertain.value || (!id && kind.value !== 'general' && !target.value),
)
useWorkLabels(() => detail.data.value)
</script>
<template>
  <div class="page-workspace page-editor">
    <header class="page-heading">
      <div>
        <RouterLink :to="id ? `/reminders/${id}` : '/reminders'" class="text-link">
          ← До нагадувань
        </RouterLink>
        <h1>{{ id ? 'Редагування нагадування' : 'Нове нагадування' }}</h1>
      </div>
    </header>
    <LoadingState v-if="detail.loading.value" />
    <ErrorState
      v-else-if="detail.error.value"
      :error="detail.error.value"
      retry
      @retry="detail.reload"
    />
    <template v-else>
      <ReminderCard v-if="detail.data.value" :reminder="detail.data.value" :timezone="timezone" />
      <AppCard v-if="!id || detail.data.value?.status === 'scheduled'" title="Про що нагадати">
        <p v-if="!id && route.query.study_session_id" class="helper">
          Нагадування про сесії налаштовуються у профілі.
          <RouterLink to="/profile#session-reminders" class="text-link">
            Налаштувати нагадування про сесії
          </RouterLink>
        </p>
        <template v-if="!id">
          <fieldset :disabled="busy || uncertain" class="report-fieldset reminder-target-fields">
            <div class="field">
              <label for="reminder-target-kind">Пов’язати з навчанням</label>
              <select id="reminder-target-kind" v-model="kind">
                <option value="general">Загальне нагадування</option>
                <option value="task">Завдання</option>
                <option value="subtask">Підзавдання</option>
              </select>
            </div>
            <template v-if="kind === 'task' || kind === 'subtask'">
              <LoadingState v-if="tasks.loading.value" />
              <ErrorState
                v-if="tasks.error.value"
                :error="tasks.error.value"
                retry
                @retry="tasks.reload"
              />
              <div class="field">
                <label for="reminder-task-status">Стан завдань</label>
                <select id="reminder-task-status" v-model="taskStatus">
                  <option value="pending">Невиконані</option>
                  <option value="missed">Пропущені</option>
                </select>
              </div>
              <div class="field">
                <label for="reminder-task">Яке завдання</label>
                <select id="reminder-task" v-model="taskId" :disabled="tasks.loading.value">
                  <option :value="null">Оберіть завдання</option>
                  <option
                    v-if="taskId && !tasks.data.value?.data.some((t) => t.id === taskId)"
                    :value="taskId"
                  >
                    Обране завдання недоступне
                  </option>
                  <option v-for="task in tasks.data.value?.data" :key="task.id" :value="task.id">
                    {{ task.title }} · {{ taskStatusLabels[task.status] }}
                  </option>
                </select>
              </div>
              <PageNavigation
                v-if="tasks.data.value && tasks.data.value.meta.last_page > 1"
                :current="tasks.data.value.meta.current_page"
                :last="tasks.data.value.meta.last_page"
                :total="tasks.data.value.meta.total"
                :busy="tasks.loading.value"
                @page="page = $event"
              />
              <ErrorState
                v-if="selectedTask.error.value"
                :error="selectedTask.error.value"
                retry
                @retry="selectedTask.reload"
              />
              <p
                v-if="
                  kind === 'task' &&
                  selectedTask.data.value &&
                  !selectedTask.data.value.data.deadline_at
                "
                class="helper"
              >
                Завдання не має дедлайну. Для відносного нагадування потрібен його власний дедлайн.
              </p>
              <p v-if="selectedTask.data.value?.data.status === 'completed'" class="field-error">
                Ціль завершена; сервер може відхилити створення.
              </p>
            </template>
            <template v-if="kind === 'subtask'">
              <ErrorState
                v-if="children.error.value"
                :error="children.error.value"
                retry
                @retry="children.reload"
              />
              <div class="field">
                <label for="reminder-subtask">Який навчальний крок</label>
                <select id="reminder-subtask" v-model="childId" :disabled="children.loading.value">
                  <option :value="null">Оберіть підзавдання</option>
                  <option
                    v-for="child in children.data.value?.data"
                    :key="child.id"
                    :value="child.id"
                  >
                    {{ child.title }}
                  </option>
                </select>
              </div>
              <p class="helper">
                Використовується лише власний дедлайн підзавдання. Дедлайн батьківського завдання не
                підставляється.
              </p>
              <p
                v-if="
                  childId && !children.data.value?.data.find((c) => c.id === childId)?.deadline_at
                "
                class="helper"
              >
                Обране підзавдання не має власного дедлайну.
              </p>
            </template>
          </fieldset>
        </template>
        <FormNotice :error="error" />
        <p v-if="uncertain" role="alert" class="report-warning">
          Результат збереження невідомий. Автоматичного повтору не було. Перевірте список або
          відомий запис перед новою спробою.
        </p>
        <h2>Повідомлення та час</h2>
        <ReminderForm
          :reminder="detail.data.value ?? undefined"
          :target="target"
          :relative-available="relativeAvailable"
          :timezone="timezone"
          :errors="fieldErrors(error)"
          :busy="busy"
          :blocked="blocked"
          @create="create"
          @update="update"
        />
      </AppCard>
      <p v-else class="helper">Надіслані та скасовані нагадування є незмінною історією.</p>
    </template>
  </div>
</template>
