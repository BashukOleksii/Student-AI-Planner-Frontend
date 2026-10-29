<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import type { Subtask, SubtaskInput, FieldErrors } from '@/types/api'
import { toLocalInput, toUtc, dateTime } from '@/utils/dates'
import FormField from '@/components/ui/FormField.vue'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{
  subtask?: Subtask
  parentDeadline: string | null
  timezone: string
  errors: FieldErrors
  busy: boolean
}>()
const emit = defineEmits<{ submit: [input: SubtaskInput]; close: []; dirty: [value: boolean] }>()
const nameInput = ref<HTMLInputElement>()
onMounted(() => nameInput.value?.focus())
const initial = {
  title: props.subtask?.title ?? '',
  description: props.subtask?.description ?? '',
  estimate: props.subtask?.estimated_minutes?.toString() ?? '',
  deadline: toLocalInput(props.subtask?.deadline_at ?? null, props.timezone),
}
const form = reactive({ ...initial })
const localErrors = ref<FieldErrors>({})
const errors = computed(() => ({ ...props.errors, ...localErrors.value }))
watch(
  () => JSON.stringify(form) !== JSON.stringify(initial),
  (value) => emit('dirty', value),
)
function submit() {
  if (props.busy) return
  localErrors.value = {}
  if (!form.title.trim()) localErrors.value.title = ['Укажіть назву підзавдання.']
  if (new TextEncoder().encode(form.description).length > 65535)
    localErrors.value.description = ['Опис перевищує 65535 байтів.']
  let deadline: string | null = null
  try {
    deadline =
      props.subtask && form.deadline === initial.deadline
        ? props.subtask.deadline_at
        : toUtc(form.deadline, props.timezone)
  } catch (e) {
    localErrors.value.deadline_at = [e instanceof Error ? e.message : 'Перевірте дату.']
  }
  if (Object.keys(localErrors.value).length) return
  emit('submit', {
    title: form.title.trim(),
    description: form.description || null,
    estimated_minutes: form.estimate ? Number(form.estimate) : null,
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
        <FormField
          id="subtask-estimate"
          label="Тривалість підзавдання, хв"
          :errors="errors.estimated_minutes"
          v-slot="f"
        >
          <input
            :id="f.id"
            v-model="form.estimate"
            type="number"
            min="1"
            max="65535"
            step="1"
            :aria-invalid="f.invalid"
            :aria-describedby="f.describedby"
          />
        </FormField>
        <FormField
          id="subtask-deadline"
          label="Дедлайн підзавдання"
          :errors="errors.deadline_at"
          :hint="`Часовий пояс: ${timezone}. Дедлайн завдання: ${dateTime(parentDeadline, timezone)}. Сервер перевіряє межу.`"
          v-slot="f"
        >
          <input
            :id="f.id"
            v-model="form.deadline"
            type="datetime-local"
            step="1"
            min="1000-01-01T00:00"
            max="9999-12-31T23:59:59"
            :aria-invalid="f.invalid"
            :aria-describedby="f.describedby"
          />
        </FormField>
        <div class="actions">
          <AppButton variant="primary" type="submit" :busy="busy">
            {{ subtask ? 'Зберегти підзавдання' : 'Створити підзавдання' }}
          </AppButton>
          <AppButton :disabled="busy" @click="emit('close')">Скасувати</AppButton>
        </div>
      </div>
    </fieldset>
  </form>
</template>
