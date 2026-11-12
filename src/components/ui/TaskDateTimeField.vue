<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { taskDeadlineUtc } from '@/utils/dates'
const props = defineProps<{
  id: string
  label: string
  timezone: string
  errors?: string[]
  hint?: string
  preservedValue?: string
}>()
const model = defineModel<string>({ required: true })
const date = ref('')
const time = ref('')
const dateInput = ref<HTMLInputElement>()
const timeInput = ref<HTMLInputElement>()
const touched = ref(false)
watch(
  model,
  (value) => {
    const parts = value.split(' ')
    date.value = parts[0] ?? ''
    time.value = parts[1] ?? ''
  },
  { immediate: true },
)
function clear() {
  date.value = ''
  time.value = ''
  edit()
}
function edit() {
  touched.value = true
  model.value = date.value || time.value ? `${date.value} ${time.value}` : ''
}
const localError = computed(() => {
  if (!model.value || model.value === props.preservedValue) return ''
  try {
    taskDeadlineUtc(model.value, props.timezone)
    return ''
  } catch (reason) {
    return reason instanceof Error ? reason.message : 'Перевірте дату й час.'
  }
})
watchEffect(() => {
  dateInput.value?.setCustomValidity(localError.value)
  timeInput.value?.setCustomValidity(localError.value)
})
const messages = computed(() => [
  ...(props.errors ?? []),
  ...(touched.value && localError.value ? [localError.value] : []),
])
</script>
<template>
  <fieldset class="task-datetime field">
    <legend>{{ label }}</legend>
    <div class="task-datetime-controls">
      <div>
        <label :for="`${id}-date`" class="helper">Дата · ДД.ММ.РРРР</label>
        <input
          :id="`${id}-date`"
          ref="dateInput"
          v-model="date"
          type="text"
          inputmode="numeric"
          placeholder="ДД.ММ.РРРР"
          maxlength="10"
          pattern="[0-9]{2}\.[0-9]{2}\.[0-9]{4}"
          :required="!!time"
          :aria-invalid="!!messages.length"
          :aria-describedby="`${id}-hint ${id}-errors`"
          @input="edit"
          @invalid="touched = true"
        />
      </div>
      <div>
        <label :for="`${id}-time`" class="helper">Час · ГГ:ХХ</label>
        <input
          :id="`${id}-time`"
          ref="timeInput"
          v-model="time"
          type="text"
          inputmode="numeric"
          placeholder="ГГ:ХХ"
          maxlength="5"
          pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
          :required="!!date"
          :aria-invalid="!!messages.length"
          :aria-describedby="`${id}-hint ${id}-errors`"
          @input="edit"
          @invalid="touched = true"
        />
      </div>
    </div>
    <p :id="`${id}-hint`" class="helper">
      {{ hint ?? `Місцевий час: ${timezone}. Необов’язково.` }}
    </p>
    <div :id="`${id}-errors`">
      <p v-for="message in messages" :key="message" class="field-error">{{ message }}</p>
    </div>
    <button v-if="model" type="button" class="text-link task-clear-deadline" @click="clear">
      Очистити дедлайн
    </button>
  </fieldset>
</template>
