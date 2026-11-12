<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount, useId } from 'vue'
import type { Task, TaskLifecycleAction } from '@/types/api'
import { dateTime, isOverdue } from '@/utils/dates'
import { taskStatusLabels } from '@/utils/tasks'
import AppButton from '@/components/ui/AppButton.vue'
defineProps<{ task: Task; timezone: string; busy?: boolean; actions?: boolean; subject?: string }>()
const emit = defineEmits<{ lifecycle: [action: TaskLifecycleAction]; remove: [] }>()
const popupId = useId()
const popup = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const expanded = ref(false)
const position = ref({ left: '12px', top: '12px', width: '300px' })
function close(restore = false) {
  popup.value?.hidePopover()
  expanded.value = false
  if (restore) trigger.value?.focus()
}
async function open() {
  if (expanded.value) {
    close(true)
    return
  }
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect || !popup.value) return
  const width = Math.min(320, window.innerWidth - 24)
  position.value = {
    left: `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`,
    top: '12px',
    width: `${width}px`,
  }
  popup.value.showPopover()
  expanded.value = true
  await nextTick()
  const height = popup.value.getBoundingClientRect().height
  position.value.top = `${Math.max(12, Math.min(rect.bottom + 8 + height <= window.innerHeight - 12 ? rect.bottom + 8 : rect.top - height - 8, window.innerHeight - height - 12))}px`
  popup.value.querySelector<HTMLElement>('button:not(:disabled), a')?.focus()
}
function dismiss(event: Event) {
  if (event.target instanceof Node && popup.value?.contains(event.target)) return
  close()
}
function focusOut() {
  requestAnimationFrame(() => {
    if (
      expanded.value &&
      !popup.value?.contains(document.activeElement) &&
      document.activeElement !== trigger.value
    )
      close()
  })
}
onMounted(() => {
  window.addEventListener('resize', dismiss)
  window.addEventListener('scroll', dismiss, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', dismiss)
  window.removeEventListener('scroll', dismiss, true)
})
function chooseMiss() {
  close(true)
  emit('lifecycle', 'miss')
}
function chooseRemove() {
  close(true)
  emit('remove')
}
const priorities = { 1: 'Низький', 2: 'Звичайний', 3: 'Високий' }
</script>
<template>
  <article
    class="task-row"
    :class="[`task-${task.status}`, { 'task-overdue': isOverdue(task.deadline_at, task.status) }]"
  >
    <div class="task-main">
      <h3>
        <RouterLink :to="`/tasks/${task.id}`">{{ task.title }}</RouterLink>
      </h3>
      <p class="task-deadline" :class="{ 'field-error': isOverdue(task.deadline_at, task.status) }">
        {{ task.deadline_at ? `До ${dateTime(task.deadline_at, timezone)}` : 'Без дедлайну' }}
      </p>
      <div class="inline">
        <span
          class="badge"
          :class="{ success: task.status === 'completed', warning: task.status === 'missed' }"
        >
          {{ taskStatusLabels[task.status] }}
        </span>
        <span class="badge" :class="task.priority === 3 ? 'warning' : ''">
          {{ priorities[task.priority] }} пріоритет
        </span>
        <span v-if="isOverdue(task.deadline_at, task.status)" class="badge danger">
          Прострочено
        </span>
      </div>

      <p class="helper">
        <span v-if="subject">{{ subject }}</span>
      </p>
    </div>
    <div v-if="actions" class="task-actions">
      <AppButton
        v-if="task.status !== 'completed'"
        :disabled="busy"
        @click="$emit('lifecycle', 'complete')"
      >
        Завершити
      </AppButton>
      <AppButton
        v-if="task.status !== 'pending'"
        :disabled="busy"
        @click="$emit('lifecycle', 'reopen')"
      >
        Повернути до виконання
      </AppButton>
      <RouterLink
        v-if="task.status === 'missed'"
        :to="{ path: '/planning/recovery', query: { task_id: task.id } }"
        class="button secondary"
      >
        Відновити роботу
      </RouterLink>

      <button
        ref="trigger"
        type="button"
        class="button secondary"
        :aria-expanded="expanded"
        :aria-controls="popupId"
        aria-haspopup="true"
        :disabled="busy"
        @click="open"
      >
        Інші дії
        <span class="sr-only">із завданням «{{ task.title }}»</span>
      </button>
      <div
        :id="popupId"
        ref="popup"
        popover="auto"
        class="task-action-popover"
        :style="position"
        role="group"
        :aria-label="`Дії із завданням ${task.title}`"
        @toggle="expanded = ($event as ToggleEvent).newState === 'open'"
        @keydown.esc.prevent="close(true)"
        @focusout="focusOut"
      >
        <AppButton v-if="task.status === 'pending'" :disabled="busy" @click="chooseMiss">
          Позначити невиконаним
        </AppButton>
        <RouterLink :to="`/tasks/${task.id}`" class="button secondary" @click="close()">
          Редагувати
        </RouterLink>
        <AppButton variant="danger" :disabled="busy" @click="chooseRemove">Видалити</AppButton>
      </div>
    </div>
  </article>
</template>
