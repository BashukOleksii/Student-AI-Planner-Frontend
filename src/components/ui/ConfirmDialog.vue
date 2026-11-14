<script setup lang="ts">
import { trapDialogTab } from '@/utils/dialog'
import { onMounted, onBeforeUnmount, ref, watch, useId } from 'vue'
import AppButton from './AppButton.vue'
import FormNotice from './FormNotice.vue'
const props = defineProps<{
  title: string
  busy?: boolean
  error?: unknown
  confirmLabel?: string
}>()
const emit = defineEmits<{ confirm: []; close: [] }>()
const dialog = ref<HTMLDialogElement>()
const titleId = useId()
const descriptionId = useId()
let previous: HTMLElement | null = null
onMounted(() => {
  previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.showModal()
})
onBeforeUnmount(() => {
  dialog.value?.close()
  if (previous?.isConnected) previous.focus()
  else document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true })
})
watch(
  () => props.busy,
  (value) => {
    if (!value) dialog.value?.querySelector<HTMLButtonElement>('button[autofocus]')?.focus()
  },
  { flush: 'post' },
)
function cancel(event: Event) {
  event.preventDefault()
  if (!props.busy) emit('close')
}
</script>
<template>
  <dialog
    ref="dialog"
    tabindex="-1"
    @keydown="trapDialogTab($event, dialog)"
    class="dialog"
    :aria-labelledby="titleId"
    :aria-describedby="descriptionId"
    :aria-busy="busy"
    @cancel="cancel"
  >
    <header class="section-heading dialog-heading">
      <h2 :id="titleId">{{ title }}</h2>
      <button
        type="button"
        class="icon-button"
        aria-label="Закрити діалог"
        :disabled="busy"
        @click="emit('close')"
      >
        ×
      </button>
    </header>
    <div :id="descriptionId" class="dialog-description"><slot /></div>
    <FormNotice :error="error" />
    <div class="actions">
      <AppButton autofocus :disabled="busy" @click="emit('close')">Скасувати</AppButton>
      <AppButton variant="danger" :busy="busy" @click="emit('confirm')">
        {{ confirmLabel ?? 'Видалити' }}
      </AppButton>
    </div>
  </dialog>
</template>
