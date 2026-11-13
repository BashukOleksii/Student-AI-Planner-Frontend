<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useWorkCompletion } from '@/composables/useWorkCompletion'
import AppButton from '@/components/ui/AppButton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const props = defineProps<{ taskId: number; subtaskId?: number | null; title: string }>()
const emit = defineEmits<{ close: []; completed: [] }>()
const flow = useWorkCompletion(props.taskId, props.subtaskId ?? null, () => emit('completed'))
const panel = ref<HTMLElement>()
let trigger: HTMLElement | null = null
onMounted(() => {
  trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  panel.value?.focus()
})
onBeforeUnmount(() => {
  void nextTick(() => {
    if (trigger?.isConnected) trigger.focus()
  })
})
</script>
<template>
  <div
    ref="panel"
    class="completion-prompt"
    role="region"
    :aria-label="`Завершення: ${title}`"
    tabindex="-1"
    :aria-busy="flow.busy.value"
  >
    <LoadingState v-if="flow.work.loading.value" />
    <ErrorState
      v-if="flow.work.error.value"
      :error="flow.work.error.value"
      retry
      @retry="flow.refresh"
    />
    <p
      v-if="flow.work.data.value && flow.work.data.value.review.future_sessions_count > 0"
      class="completion-consequence"
      role="status"
    >
      Майбутні заплановані сесії буде скасовано, а час у плані звільниться.
      <span class="helper">Сесій: {{ flow.work.data.value.review.future_sessions_count }}.</span>
    </p>
    <p v-if="flow.localError.value" class="field-error" role="alert">{{ flow.localError.value }}</p>
    <FormNotice :error="flow.error.value" />
    <p v-if="flow.blocked.value" class="helper" role="status">
      Перевірте поточний стан перед наступною дією. Запит не повторювався.
    </p>
    <AppButton
      v-if="flow.blocked.value || flow.error.value"
      :disabled="flow.busy.value"
      @click="flow.refresh"
    >
      Отримати новий огляд
    </AppButton>
    <form class="actions" @submit.prevent="flow.submit">
      <AppButton
        type="submit"
        variant="primary"
        :busy="flow.busy.value"
        :disabled="!flow.ready.value"
      >
        Підтвердити завершення
      </AppButton>
      <AppButton :disabled="flow.busy.value" @click="emit('close')">Назад</AppButton>
    </form>
  </div>
</template>
<style scoped>
.completion-prompt {
  display: grid;
  gap: 10px;
  flex-basis: 100%;
  min-width: 0;
  margin-top: 8px;
  padding: 12px;
  background: var(--subtle);
  border-radius: var(--radius-sm);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.completion-prompt .actions {
  justify-content: flex-start;
  gap: 8px;
}
.completion-consequence {
  color: var(--warning);
}
.completion-prompt .button {
  font-size: 12px;
  padding: 8px 12px;
}
</style>
