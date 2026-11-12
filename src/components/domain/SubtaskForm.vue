<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import type { SubtaskInput, FieldErrors } from '@/types/api'
import { taskDeadlineInput, taskDeadlineUtc, dateTime } from '@/utils/dates'
import { taskMinutes } from '@/utils/tasks'
import TaskDateTimeField from '@/components/ui/TaskDateTimeField.vue'
import TaskMinutesField from '@/components/ui/TaskMinutesField.vue'
import FormField from '@/components/ui/FormField.vue'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{
  subtask?: SubtaskInput
  remainingMinutes?: number | null
  draftMode?: boolean
  parentDeadline: string | null
  timezone: string
  errors: FieldErrors
  busy: boolean
  blocked?: boolean
}>()
const emit = defineEmits<{ submit: [input: SubtaskInput]; close: []; dirty: [value: boolean] }>()
const nameInput = ref<HTMLInputElement>()
onMounted(() => nameInput.value?.focus())
const initial = {
  title: props.subtask?.title ?? '',
  description: props.subtask?.description ?? '',
  estimate: props.subtask?.estimated_minutes?.toString() ?? '',
  deadline: taskDeadlineInput(props.subtask?.deadline_at ?? null, props.timezone),
}
const form = reactive({ ...initial })
const budgetError = computed(() => {
  try {
    const minutes = taskMinutes(form.estimate)
    return minutes !== null && props.remainingMinutes != null && minutes > props.remainingMinutes
      ? `Ліміт перевищено на ${minutes - props.remainingMinutes} хв. Доступно: ${Math.max(0, props.remainingMinutes)} хв.`
      : ''
  } catch {
    return ''
  }
})
const localErrors = ref<FieldErrors>({})
const errors = computed(() => ({ ...props.errors, ...localErrors.value }))
watch(
  () => JSON.stringify(form) !== JSON.stringify(initial),
  (value) => emit('dirty', value),
)
function submit() {
  if (props.busy || props.blocked) return
  localErrors.value = {}
  if (!form.title.trim()) localErrors.value.title = ['Укажіть назву підзавдання.']
  if (new TextEncoder().encode(form.description).length > 65535)
    localErrors.value.description = ['Опис задовгий. Скоротіть текст.']
  let deadline: string | null = null
  try {
    deadline =
      props.subtask && form.deadline === initial.deadline
        ? props.subtask.deadline_at
        : taskDeadlineUtc(form.deadline, props.timezone)
  } catch (e) {
    localErrors.value.deadline_at = [e instanceof Error ? e.message : 'Перевірте дату.']
  }
  let minutes: number | null = null
  try {
    minutes = taskMinutes(form.estimate)
  } catch (reason) {
    localErrors.value.estimated_minutes = [
      reason instanceof Error ? reason.message : 'Перевірте хвилини.',
    ]
  }
  if (budgetError.value) localErrors.value.estimated_minutes = [budgetError.value]
  if (deadline && props.parentDeadline && Date.parse(deadline) > Date.parse(props.parentDeadline))
    localErrors.value.deadline_at = ['Дедлайн підзавдання не може бути пізніше дедлайну завдання.']
  if (Object.keys(localErrors.value).length) return
  emit('submit', {
    title: form.title.trim(),
    description: form.description || null,
    estimated_minutes: minutes,
    deadline_at: deadline,
  })
}
</script>
<template>
  <form class="stack" @submit.prevent="submit">
    <fieldset :disabled="busy">
      <div class="stack">
        <FormField id="subtask-title" label="Назва підзавдання" :errors="errors.title" v-slot="f">
          <input
            ref="nameInput"
            :id="f.id"
            v-model="form.title"
            required
            maxlength="255"
            autofocus
            :aria-invalid="f.invalid"
            :aria-describedby="f.describedby"
          />
        </FormField>
        <TaskDateTimeField
          id="subtask-deadline"
          v-model="form.deadline"
          label="Дедлайн підзавдання"
          :timezone="timezone"
          :errors="errors.deadline_at"
          :preserved-value="initial.deadline"
          :hint="
            parentDeadline
              ? `Не пізніше дедлайну завдання: ${dateTime(parentDeadline, timezone)}. Час: ${timezone}.`
              : undefined
          "
        />
        <FormField
          id="subtask-description"
          label="Опис підзавдання"
          :errors="errors.description"
          v-slot="f"
        >
          <textarea
            :id="f.id"
            v-model="form.description"
            rows="3"
            :aria-invalid="f.invalid"
            :aria-describedby="f.describedby"
          ></textarea>
        </FormField>
        <TaskMinutesField
          id="subtask-estimate"
          v-model="form.estimate"
          label="Тривалість підзавдання, хв"
          :errors="errors.estimated_minutes"
          :budget-error="budgetError"
        />

        <div class="actions">
          <AppButton variant="primary" type="submit" :busy="busy" :disabled="blocked">
            {{
              draftMode
                ? 'Зберегти в чернетці'
                : subtask
                  ? 'Зберегти підзавдання'
                  : 'Створити підзавдання'
            }}
          </AppButton>
          <AppButton :disabled="busy" @click="emit('close')">Скасувати</AppButton>
        </div>
      </div>
    </fieldset>
  </form>
</template>
