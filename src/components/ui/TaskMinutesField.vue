<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { taskMinutes } from '@/utils/tasks'
import FormField from './FormField.vue'
const props = defineProps<{ id: string; label: string; errors?: string[]; budgetError?: string }>()
const model = defineModel<string>({ required: true })
const input = ref<HTMLInputElement>()
const touched = ref(false)
const localError = computed(() => {
  try {
    taskMinutes(model.value)
    return props.budgetError ?? ''
  } catch (reason) {
    return reason instanceof Error ? reason.message : 'Перевірте хвилини.'
  }
})
watchEffect(() => input.value?.setCustomValidity(localError.value))
</script>
<template>
  <FormField
    :id="id"
    :label="label"
    :errors="[...(errors ?? []), ...((touched || budgetError) && localError ? [localError] : [])]"
    v-slot="f"
  >
    <input
      :id="f.id"
      ref="input"
      v-model="model"
      class="task-minutes"
      type="text"
      inputmode="numeric"
      pattern="[0-9]+"
      placeholder="Необов’язково"
      :aria-invalid="f.invalid"
      :aria-describedby="f.describedby"
      @input="touched = true"
      @invalid="touched = true"
    />
  </FormField>
</template>
