<script setup lang="ts">
import { trapDialogTab } from '@/utils/dialog'
import { onMounted, onBeforeUnmount, ref, useId } from 'vue'
const props = defineProps<{ title: string; busy?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const titleId = useId()
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
    class="dialog form-dialog"
    :aria-labelledby="titleId"
    :aria-busy="busy"
    @cancel="cancel"
  >
    <header class="section-heading">
      <h2 :id="titleId">{{ title }}</h2>
      <button
        class="icon-button"
        type="button"
        aria-label="Закрити діалог"
        :disabled="busy"
        @click="emit('close')"
      >
        ×
      </button>
    </header>
    <slot />
  </dialog>
</template>
