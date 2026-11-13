<script setup lang="ts">
import { computed, ref, watch, onScopeDispose } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import type { Task, Subtask } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { useSubtasks } from '@/composables/useSubtasks'
import { dateTime, isOverdue } from '@/utils/dates'
import { fieldErrors } from '@/api/client'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import SubtaskForm from './SubtaskForm.vue'
import WorkCompletionDialog from './WorkCompletionDialog.vue'
const props = defineProps<{
  task: Task
  timezone: string
  disabled?: boolean
  readonly?: boolean
}>()
const emit = defineEmits<{ children: [value: import('@/types/api').Subtask[]] }>()
const auth = useAuthStore()
const {
  blocked,
  checked,
  reviewed,
  children,
  progress,
  editor,
  detail,
  deleting,
  busy,
  error,
  success,
  dirty,
  refresh,
  open,
  close,
  save,
  toggle,
  confirmDelete,
  remove,
  move,
} = useSubtasks(props.task.id)
const allocated = computed(() =>
  (children.data.value?.data ?? []).reduce((sum, item) => sum + (item.estimated_minutes ?? 0), 0),
)
const unestimated = computed(() =>
  children.data.value?.data.some((item) => item.estimated_minutes === null),
)
const remaining = computed(() =>
  props.task.estimated_minutes === null
    ? null
    : props.task.estimated_minutes - allocated.value + (detail.data.value?.estimated_minutes ?? 0),
)
watch(children.data, (value) => {
  if (value) emit('children', value.data)
})
const completing = ref<Subtask | null>(null)
async function completedWork() {
  completing.value = null
  await refresh()
}
function requestToggle(child: Subtask, event: Event) {
  if (props.readonly || completing.value || props.disabled || busy.value || blocked.value) return
  ;(event.target as HTMLInputElement).checked = child.status === 'completed'
  if (child.status === 'completed') void toggle(child)
  else completing.value = child
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || busy.value || blocked.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', beforeUnload)
onScopeDispose(() => window.removeEventListener('beforeunload', beforeUnload))
function leave() {
  return (
    !auth.user ||
    (!busy.value &&
      (!(dirty.value || blocked.value) || window.confirm('Залишити підзавдання без збереження?')))
  )
}
onBeforeRouteLeave(leave)
onBeforeRouteUpdate(leave)
</script>
<template>
  <AppCard title="Підзавдання" class="subtasks-card">
    <template #action>
      <AppButton
        v-if="!readonly"
        variant="primary"
        :disabled="
          !!busy || blocked || disabled || children.loading.value || !!children.error.value
        "
        @click="open(null)"
      >
        Додати підзавдання
      </AppButton>
    </template>
    <p class="helper">
      Відмічайте виконані кроки. Коли все готово, завершіть саме завдання окремо.
    </p>
    <div class="subtask-progress">
      <LoadingState v-if="progress.loading.value" />
      <ErrorState
        v-else-if="progress.error.value"
        :error="progress.error.value"
        retry
        @retry="progress.reload"
      />
      <template v-else-if="progress.data.value">
        <p class="inline">
          <strong>
            Виконано {{ progress.data.value.data.completed_subtasks }} із
            {{ progress.data.value.data.total_subtasks }}
          </strong>
          <span v-if="progress.data.value.data.progress_percent !== null" class="badge success">
            {{ progress.data.value.data.progress_percent }}%
          </span>
          <span v-else class="helper">Прогрес ще не визначено</span>
        </p>
        <progress
          v-if="progress.data.value.data.progress_percent !== null"
          :value="progress.data.value.data.progress_percent"
          max="100"
          aria-label="Прогрес підзавдань"
        >
          {{ progress.data.value.data.progress_percent }}%
        </progress>
      </template>
    </div>
    <p v-if="busy" class="helper" role="status">Зберігаємо зміни підзавдань…</p>
    <p v-if="success" class="success-notice" role="status">{{ success }}</p>
    <FormNotice v-if="editor === undefined && !deleting" :error="error" />
    <div v-if="blocked" class="planning-warning" role="alert">
      <p>Перед наступною зміною перевірте стан сервера. Автоматичного повтору не було.</p>
      <AppButton :disabled="!!busy" @click="refresh">Перевірити актуальні підзавдання</AppButton>
      <AppButton v-if="checked" @click="reviewed">Завершити звірку</AppButton>
    </div>
    <div class="task-effort-summary">
      <p>
        Основне завдання:
        {{ task.estimated_minutes === null ? 'Без оцінки' : `${task.estimated_minutes} хв` }}
      </p>
      <p>
        {{ unestimated ? 'Розподілено за оціненими підзавданнями' : 'Розподілено на підзавдання' }}:
        {{ allocated }} хв
      </p>
      <p v-if="task.estimated_minutes !== null">
        Залишилося: {{ task.estimated_minutes - allocated }} хв
      </p>
    </div>
    <p
      v-if="
        task.status !== 'completed' &&
        progress.data.value?.data.total_subtasks &&
        progress.data.value.data.completed_subtasks === progress.data.value.data.total_subtasks
      "
      class="scope-notice"
    >
      Усі підзавдання виконано. Можете завершити основне завдання
    </p>
    <LoadingState v-if="children.loading.value" />
    <ErrorState
      v-else-if="children.error.value"
      :error="children.error.value"
      retry
      @retry="refresh"
    />
    <EmptyState
      v-else-if="!children.data.value?.data.length"
      title="Підзавдань поки немає"
      description="Розділіть завдання на невеликі кроки."
    />
    <ol v-else class="subtask-list">
      <li v-for="(child, index) in children.data.value.data" :key="child.id" class="subtask-row">
        <div>
          <p class="helper">Крок {{ child.position }}</p>
          <h3>
            <label class="checkbox-field subtask-check">
              <input
                type="checkbox"
                :checked="child.status === 'completed'"
                :disabled="!!busy || blocked || disabled || readonly || !!completing"
                :aria-label="`Виконано: ${child.title}`"
                @change="requestToggle(child, $event)"
              />
              <strong>{{ child.title }}</strong>
              <span v-if="busy === `toggle:${child.id}`" class="helper" role="status">
                Зберігаємо…
              </span>
            </label>
          </h3>
          <span class="badge" :class="child.status === 'completed' ? 'success' : ''">
            {{ child.status === 'completed' ? 'Виконано' : 'До виконання' }}
          </span>
          <p v-if="child.description" class="subtask-description">{{ child.description }}</p>
          <div
            v-if="isOverdue(child.effective_deadline_at ?? child.deadline_at, child.status)"
            class="planning-warning"
          >
            <p>Дедлайн цього кроку минув. Звичайний план не розміщує роботу після дедлайну.</p>
            <AppButton
              v-if="!readonly"
              :disabled="!!busy || blocked || disabled"
              @click="open(child.id)"
            >
              Переглянути дедлайн підзавдання
            </AppButton>
            <p class="helper">
              Якщо строк успадкований, перегляньте дедлайн основного завдання у формі вище.
            </p>
          </div>
          <p v-if="child.completed_at" class="helper">
            Виконано {{ dateTime(child.completed_at, timezone) }}
          </p>
        </div>
        <div v-if="!readonly" class="actions subtask-actions">
          <details class="subtask-menu">
            <summary>
              Керувати кроком
              <span class="sr-only">«{{ child.title }}»</span>
            </summary>
            <div class="actions">
              <RouterLink
                :to="{ path: '/reminders/new', query: { task_id: task.id, subtask_id: child.id } }"
                class="text-link"
              >
                Нагадування для підзавдання
              </RouterLink>
              <AppButton
                :disabled="!!busy || blocked || disabled || index === 0"
                :aria-label="`Перемістити вгору: ${child.title}`"
                @click="move(index, -1)"
              >
                ↑
              </AppButton>
              <AppButton
                :disabled="
                  !!busy || blocked || disabled || index === children.data.value.data.length - 1
                "
                :aria-label="`Перемістити вниз: ${child.title}`"
                @click="move(index, 1)"
              >
                ↓
              </AppButton>
              <AppButton
                :disabled="!!busy || blocked || disabled || readonly || !!completing"
                :aria-label="`Редагувати підзавдання: ${child.title}`"
                @click="open(child.id)"
              >
                Редагувати
              </AppButton>
              <AppButton
                variant="danger"
                :disabled="!!busy || blocked || disabled || readonly || !!completing"
                :aria-label="`Видалити підзавдання: ${child.title}`"
                @click="confirmDelete(child)"
              >
                Видалити
              </AppButton>
            </div>
          </details>
        </div>
      </li>
    </ol>
  </AppCard>
  <WorkCompletionDialog
    v-if="completing && !readonly"
    :task-id="task.id"
    :subtask-id="completing.id"
    :title="completing.title"
    :timezone="timezone"
    @close="completedWork"
    @completed="completedWork"
  />
  <AppModal
    v-if="editor !== undefined && !readonly"
    :title="editor === null ? 'Нове підзавдання' : 'Редагувати підзавдання'"
    :busy="!!busy"
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
      <div v-if="blocked" class="planning-warning">
        <p>Перевірте список на сервері перед наступною дією. Чернетка залишається у формі.</p>
        <AppButton :disabled="!!busy" @click="refresh">Перевірити актуальні підзавдання</AppButton>
        <p v-for="child in children.data.value?.data" :key="child.id" class="helper">
          {{ child.title }} · {{ child.estimated_minutes ?? 'Без оцінки' }}
        </p>
        <AppButton v-if="checked" @click="reviewed">Завершити звірку</AppButton>
      </div>
      <SubtaskForm
        :key="editor ?? 'new'"
        :subtask="detail.data.value ?? undefined"
        :parent-deadline="task.deadline_at"
        :remaining-minutes="remaining"
        :blocked="blocked || disabled"
        :timezone="timezone"
        :errors="fieldErrors(error)"
        :busy="!!busy"
        @submit="save"
        @close="close"
        @dirty="dirty = $event"
      />
    </template>
  </AppModal>
  <ConfirmDialog
    v-if="deleting"
    title="Видалити підзавдання?"
    :busy="!!busy"
    :error="error"
    @close="deleting = null"
    @confirm="remove"
  >
    <p>
      «{{ deleting.title }}» буде видалено. Майбутні заплановані сесії буде скасовано, а час
      звільниться. Пов’язані заплановані нагадування також буде скасовано.
    </p>
  </ConfirmDialog>
</template>
