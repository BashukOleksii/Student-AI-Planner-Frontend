<script setup lang="ts">
import { localErrorText } from '@/utils/publicText'

import { computed, ref, watchEffect } from 'vue'
import { toUtc } from '@/utils/dates'
import FormField from './FormField.vue'
const props = defineProps<{
  id: string
  label: string
  timezone: string
  errors?: string[]
  hint?: string
  preservedValue?: string
}>()
const model = defineModel<string>({ required: true })
const input = ref<HTMLInputElement>()
const touched = ref(false)
const localError = computed(() => {
  // Preserve the exact saved instant, including during an ambiguous clock change.
  if (!model.value || model.value === props.preservedValue) return ''
  try {
    toUtc(model.value, props.timezone)
    return ''
  } catch (reason) {
    return localErrorText(reason, 'Перевірте дату й час.')
  }
})
watchEffect(() => input.value?.setCustomValidity(localError.value))
const messages = computed(() => [
  ...(props.errors ?? []),
  ...(touched.value && localError.value ? [localError.value] : []),
])
</script>
<template>
  <FormField
    :id="id"
    :label="label"
    :errors="messages"
    :hint="hint ?? `Місцевий час: ${timezone}. Залиште порожнім, щоб прибрати дедлайн.`"
    v-slot="f"
  >
    <input
      :id="f.id"
      ref="input"
      v-model="model"
      type="datetime-local"
      step="1"
      min="1000-01-01T00:00"
      max="9999-12-31T23:59:59"
      :aria-invalid="f.invalid"
      :aria-describedby="f.describedby"
      @input="touched = true"
      @invalid="touched = true"
    />
    <button v-if="model" type="button" class="text-link task-clear-deadline" @click="model = ''">
      Очистити дедлайн
    </button>
  </FormField>
</template>
