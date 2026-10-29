<script setup lang="ts">
import { ref } from 'vue'
import type { FieldErrors, Reminder } from '@/types/api'
import type { ReminderTarget, ReminderInput, ReminderPatch } from '@/types/reminders'
import { toLocalInput, toUtc } from '@/utils/dates'
import {
  signedOffset,
  meaningfulReminder,
  targetAnchor,
  targetFields,
  anchorLabels,
} from '@/utils/reminders'
import FormField from '@/components/ui/FormField.vue'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{
  reminder?: Reminder
  target: ReminderTarget | null
  timezone: string
  errors: FieldErrors
  busy: boolean
  blocked?: boolean
}>()
const emit = defineEmits<{ create: [ReminderInput]; update: [ReminderPatch] }>()
const mode = ref<'absolute' | 'relative'>(props.reminder?.anchor ? 'relative' : 'absolute'),
  message = ref(props.reminder?.message ?? ''),
  trigger = ref(toLocalInput(props.reminder?.trigger_at ?? null, props.timezone)),
  offset = ref(String(props.reminder?.offset_minutes ?? -15)),
  localError = ref('')
const initial = { message: message.value, trigger: trigger.value, offset: offset.value }
function submit() {
  if (props.busy || props.blocked) return
  localError.value = ''
  try {
    if ([...message.value].length > 500)
      throw new Error('Повідомлення має містити не більше 500 символів.')
    const general = props.reminder
      ? !props.reminder.task_id && !props.reminder.subtask_id && !props.reminder.study_session_id
      : !props.target
    if (general && !meaningfulReminder(message.value))
      throw new Error('Для загального нагадування потрібне змістовне повідомлення.')
    if (props.reminder) {
      const patch: ReminderPatch = {}
      if (message.value !== initial.message) patch.message = message.value || null
      if (props.reminder.anchor) {
        if (offset.value !== initial.offset) patch.offset_minutes = signedOffset(offset.value)
      } else if (trigger.value !== initial.trigger) {
        const value = toUtc(trigger.value, props.timezone)
        if (!value) throw new Error('Оберіть дату й час.')
        patch.trigger_at = value
      }
      if (!Object.keys(patch).length)
        throw new Error('Змініть повідомлення або час перед збереженням.')
      emit('update', patch)
    } else if (mode.value === 'relative') {
      if (!props.target) throw new Error('Відносне нагадування потребує однієї цілі.')
      emit('create', {
        ...targetFields(props.target),
        message: message.value || null,
        anchor: targetAnchor(props.target),
        offset_minutes: signedOffset(offset.value),
      })
    } else {
      const value = toUtc(trigger.value, props.timezone)
      if (!value) throw new Error('Оберіть дату й час.')
      emit('create', {
        ...targetFields(props.target),
        message: message.value || null,
        trigger_at: value,
      })
    }
  } catch (e) {
    localError.value = e instanceof Error ? e.message : 'Перевірте форму.'
  }
}
</script>
<template>
  <form class="stack" @submit.prevent="submit">
    <fieldset :disabled="busy || blocked" class="report-fieldset">
      <div class="stack">
        <FormField v-if="!reminder" id="reminder-mode" v-slot="a" label="Режим нагадування">
          <select :id="a.id" v-model="mode">
            <option value="absolute">Абсолютна дата й час</option>
            <option value="relative" :disabled="!target">Відносно роботи або сесії</option>
          </select>
        </FormField>
        <p v-else class="helper">
          Ціль, режим і прив’язку змінити не можна. Для іншого режиму скасуйте нагадування й
          створіть нове.
        </p>
        <FormField
          id="reminder-message"
          v-slot="a"
          label="Повідомлення нагадування"
          :errors="errors.message"
          hint="До 500 символів. Для загального нагадування потрібен змістовний текст."
        >
          <textarea
            :id="a.id"
            v-model="message"
            rows="3"
            :aria-invalid="a.invalid"
            :aria-describedby="a.describedby"
          ></textarea>
        </FormField>
        <FormField
          v-if="mode === 'absolute'"
          id="reminder-trigger"
          v-slot="a"
          label="Час нагадування"
          :errors="errors.trigger_at"
          :hint="`Майбутній місцевий час у поясі ${timezone}. Дійсність перевіряє сервер.`"
        >
          <input
            :id="a.id"
            v-model="trigger"
            type="datetime-local"
            min="1000-01-01T00:00"
            max="9999-12-31T23:59:59"
            step="1"
            required
            :aria-invalid="a.invalid"
            :aria-describedby="a.describedby"
          />
        </FormField>
        <template v-else>
          <p>
            Прив’язка:
            {{
              reminder?.anchor
                ? anchorLabels[reminder.anchor]
                : target
                  ? anchorLabels[targetAnchor(target)]
                  : 'Оберіть ціль'
            }}. Час спрацювання визначає сервер за збереженим значенням.
          </p>
          <FormField
            id="reminder-offset"
            v-slot="a"
            label="Зміщення, хвилини"
            :errors="errors.offset_minutes"
            hint="Від -32768 до 32767: від’ємне — до прив’язки, нуль — у її час, додатне — після."
          >
            <input
              :id="a.id"
              v-model="offset"
              type="number"
              min="-32768"
              max="32767"
              step="1"
              required
              :aria-invalid="a.invalid"
              :aria-describedby="a.describedby"
            />
          </FormField>
        </template>
      </div>
    </fieldset>
    <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
    <AppButton type="submit" variant="primary" :busy="busy" :disabled="blocked">
      {{ reminder ? 'Зберегти нагадування' : 'Створити нагадування' }}
    </AppButton>
  </form>
</template>
