<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import AppButton from './AppButton.vue'
import ErrorState from './ErrorState.vue'
const props = defineProps<{ title: string; busy?: boolean; error?: unknown }>()
const emit = defineEmits<{ confirm: []; close: [] }>()
const dialog = ref<HTMLDialogElement>()
let previous: HTMLElement | null = null
onMounted(() => {
  previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.showModal()
})
onBeforeUnmount(() => {
  dialog.value?.close()
  previous?.focus()
})
watch(
  () => props.busy,
  (value) => {
    if (!value) dialog.value?.querySelector<HTMLButtonElement>('button')?.focus()
  },
)
function cancel(event: Event) {
  event.preventDefault()
  if (!props.busy) emit('close')
}
</script>
<template>
  <dialog
    ref="dialog"
    class="dialog"
    aria-labelledby="dialog-title"
    aria-describedby="dialog-description"
    :aria-busy="busy"
    @cancel="cancel"
  >
    <h2 id="dialog-title">{{ title }}</h2>
    <div id="dialog-description" class="dialog-description"><slot /></div>
    <ErrorState v-if="error" :error="error" />
    <div class="actions">
      <AppButton autofocus :disabled="busy" @click="emit('close')">Скасувати</AppButton>
      <AppButton variant="danger" :busy="busy" @click="emit('confirm')">Видалити</AppButton>
    </div>
  </dialog>
</template>
