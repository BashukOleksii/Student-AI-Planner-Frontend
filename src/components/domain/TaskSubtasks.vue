<script setup lang="ts">
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import type { Task } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { useSubtasks } from '@/composables/useSubtasks'
import { dateTime } from '@/utils/dates'
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
const props = defineProps<{ task: Task; timezone: string }>()
const auth = useAuthStore()
const {
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
function leave() {
  return (
    !auth.user ||
    (!busy.value && (!dirty.value || window.confirm('Залишити підзавдання без збереження?')))
  )
}
onBeforeRouteLeave(leave)
onBeforeRouteUpdate(leave)
</script>
<template>
  <AppCard title="Підзавдання" class="subtasks-card">
    <template #action>
      <AppButton
        variant="primary"
        :disabled="!!busy || children.loading.value || !!children.error.value"
        @click="open(null)"
      >
        Додати підзавдання
      </AppButton>
    </template>
    <p class="helper">
      Статуси завдання та підзавдань незалежні. Навіть 100% підзавдань не завершує завдання
      автоматично.
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
    <div class="actions">
      <AppButton :disabled="!!busy || children.loading.value" @click="refresh">
        Оновити підзавдання
      </AppButton>
    </div>
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
          <p class="helper">Позиція {{ child.position }}</p>
          <h3>{{ child.title }}</h3>
          <span class="badge" :class="child.status === 'completed' ? 'success' : ''">
            {{ child.status === 'completed' ? 'Виконано' : 'До виконання' }}
          </span>
          <p v-if="child.description" class="subtask-description">{{ child.description }}</p>
          <p class="helper">
            {{ dateTime(child.deadline_at, timezone) }}
            <span v-if="child.estimated_minutes">· {{ child.estimated_minutes }} хв</span>
          </p>
          <p v-if="child.completed_at" class="helper">
            Виконано {{ dateTime(child.completed_at, timezone) }}
          </p>
        </div>
        <div class="actions subtask-actions">
          <RouterLink
            :to="{ path: '/reminders/new', query: { task_id: task.id, subtask_id: child.id } }"
            class="text-link"
          >
            Нагадування для підзавдання
          </RouterLink>
          <AppButton
            :disabled="!!busy || index === 0"
            :aria-label="`Перемістити вгору: ${child.title}`"
            @click="move(index, -1)"
          >
            ↑
          </AppButton>
          <AppButton
            :disabled="!!busy || index === children.data.value.data.length - 1"
            :aria-label="`Перемістити вниз: ${child.title}`"
            @click="move(index, 1)"
          >
            ↓
          </AppButton>
          <AppButton
            :disabled="!!busy"
            :busy="busy === `toggle:${child.id}`"
            @click="toggle(child)"
          >
            {{ child.status === 'completed' ? 'Відновити підзавдання' : 'Завершити підзавдання' }}
          </AppButton>
          <AppButton
            :disabled="!!busy"
            :aria-label="`Редагувати підзавдання: ${child.title}`"
            @click="open(child.id)"
          >
            Редагувати
          </AppButton>
          <AppButton
            variant="danger"
            :disabled="!!busy"
            :aria-label="`Видалити підзавдання: ${child.title}`"
            @click="confirmDelete(child)"
          >
            Видалити
          </AppButton>
        </div>
      </li>
    </ol>
  </AppCard>
  <AppModal
    v-if="editor !== undefined"
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
      <SubtaskForm
        :key="editor ?? 'new'"
        :subtask="detail.data.value ?? undefined"
        :parent-deadline="task.deadline_at"
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
      «{{ deleting.title }}» буде видалено. Пов’язані заплановані сесії та нагадування буде
      скасовано сервером.
    </p>
  </ConfirmDialog>
</template>
