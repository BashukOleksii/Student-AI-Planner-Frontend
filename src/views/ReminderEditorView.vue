<script setup lang="ts">
import { ref, computed, onScopeDispose } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { remindersApi } from '@/api/reminders'
import { ApiError, fieldErrors } from '@/api/client'
import { useResource } from '@/composables/useResource'
import { useReminderTargets } from '@/composables/useReminderTargets'
import { useAuthStore } from '@/stores/auth'
import { validateRange, exactDateTime, sessionStatuses } from '@/utils/planning'
import type { ReminderInput, ReminderPatch } from '@/types/reminders'
import ReminderForm from '@/components/reminders/ReminderForm.vue'
import ReminderCard from '@/components/reminders/ReminderCard.vue'
import RangeFields from '@/components/planning/RangeFields.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
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
const selection = useReminderTargets(timezone.value, id ? {} : route.query)
const {
  kind,
  taskId,
  childId,
  sessionId,
  page,
  range,
  tasks,
  selectedTask,
  children,
  sessions,
  selectedSession,
  target,
} = selection
const busy = ref(false),
  error = ref<unknown>(null),
  uncertain = ref(false),
  localError = ref('')
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
function searchSessions() {
  localError.value = ''
  try {
    validateRange(range.value)
    selection.selectedRange.value = { ...range.value }
  } catch (e) {
    localError.value = e instanceof Error ? e.message : ''
  }
}
const blocked = computed(
  () => uncertain.value || (!id && kind.value !== 'general' && !target.value),
)
</script>
<template>
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
    <AppCard v-if="!id || detail.data.value?.status === 'scheduled'">
      <template v-if="!id">
        <fieldset :disabled="busy || uncertain" class="report-fieldset">
          <div class="field">
            <label for="reminder-target-kind">Ціль нагадування</label>
            <select id="reminder-target-kind" v-model="kind">
              <option value="general">Загальне нагадування</option>
              <option value="task">Завдання</option>
              <option value="subtask">Підзавдання</option>
              <option value="session">Навчальна сесія</option>
            </select>
          </div>
          <template v-if="kind === 'task' || kind === 'subtask'">
            <ErrorState
              v-if="tasks.error.value"
              :error="tasks.error.value"
              retry
              @retry="tasks.reload"
            />
            <div class="field">
              <label for="reminder-task">Завдання-ціль</label>
              <select id="reminder-task" v-model="taskId" :disabled="tasks.loading.value">
                <option :value="null">Оберіть завдання</option>
                <option
                  v-if="taskId && !tasks.data.value?.data.some((t) => t.id === taskId)"
                  :value="taskId"
                >
                  Завдання №{{ taskId }}
                </option>
                <option v-for="task in tasks.data.value?.data" :key="task.id" :value="task.id">
                  {{ task.title }} · {{ task.status === 'pending' ? 'До виконання' : 'Завершене' }}
                </option>
              </select>
            </div>
            <PageNavigation
              v-if="tasks.data.value"
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
              v-if="selectedTask.data.value && !selectedTask.data.value.data.deadline_at"
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
              <label for="reminder-subtask">Підзавдання-ціль</label>
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
          <template v-if="kind === 'session'">
            <RangeFields v-model="range" />
            <AppButton @click="searchSessions">Завантажити сесії періоду</AppButton>
            <ErrorState
              v-if="sessions.error.value"
              :error="sessions.error.value"
              retry
              @retry="sessions.reload"
            />
            <div class="field">
              <label for="reminder-session">Сесія-ціль</label>
              <select id="reminder-session" v-model="sessionId" :disabled="sessions.loading.value">
                <option :value="null">Оберіть сесію</option>
                <option
                  v-if="sessionId && !sessions.data.value?.data.some((s) => s.id === sessionId)"
                  :value="sessionId"
                >
                  Сесія №{{ sessionId }}
                </option>
                <option
                  v-for="session in sessions.data.value?.data"
                  :key="session.id"
                  :value="session.id"
                >
                  Сесія №{{ session.id }} · {{ exactDateTime(session.starts_at, timezone) }} ·
                  {{ sessionStatuses[session.status] }}
                </option>
              </select>
            </div>
            <ErrorState
              v-if="selectedSession.error.value"
              :error="selectedSession.error.value"
              retry
              @retry="selectedSession.reload"
            />
            <p class="helper">
              Сервер перевірить майбутній запланований стан і доступність роботи. Заміна сесії не
              обирається автоматично.
            </p>
          </template>
        </fieldset>
      </template>
      <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
      <FormNotice :error="error" />
      <p v-if="uncertain" role="alert" class="report-warning">
        Результат збереження невідомий. Автоматичного повтору не було. Перевірте список або відомий
        запис перед новою спробою.
      </p>
      <ReminderForm
        :reminder="detail.data.value ?? undefined"
        :target="target"
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
</template>
