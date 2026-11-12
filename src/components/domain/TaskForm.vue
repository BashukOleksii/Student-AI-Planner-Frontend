<script setup lang="ts">
import FormSection from '@/components/ui/FormSection.vue'
import { computed, reactive, ref, watch } from 'vue'
import type { Task, TaskInput, Subject, FieldErrors, Priority } from '@/types/api'
import { taskDeadlineInput, taskDeadlineUtc } from '@/utils/dates'
import { taskMinutes } from '@/utils/tasks'
import TaskDateTimeField from '@/components/ui/TaskDateTimeField.vue'
import TaskMinutesField from '@/components/ui/TaskMinutesField.vue'
import FormField from '@/components/ui/FormField.vue'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{
  task?: Task
  initialInput?: TaskInput
  allocatedMinutes?: number
  subjects: Subject[]
  timezone: string
  errors: FieldErrors
  busy: boolean
  blocked?: boolean
}>()
const emit = defineEmits<{
  submit: [value: TaskInput]
  dirty: [value: boolean]
  context: [value: { estimate: string; deadline: string }]
}>()
const source = props.task ?? props.initialInput
const initial = {
  title: source?.title ?? '',
  description: source?.description ?? '',
  subject_id: source?.subject_id ? String(source.subject_id) : '',
  priority: String(source?.priority ?? 2),
  estimated_minutes: source?.estimated_minutes?.toString() ?? '',
  deadline: taskDeadlineInput(source?.deadline_at ?? null, props.timezone),
}
const form = reactive({ ...initial })
const budgetError = computed(() => {
  try {
    const minutes = taskMinutes(form.estimated_minutes)
    return minutes !== null && minutes < (props.allocatedMinutes ?? 0)
      ? `Ліміт перевищено на ${(props.allocatedMinutes ?? 0) - minutes} хв. Збільште оцінку основного завдання або зменште оцінки підзавдань.`
      : ''
  } catch {
    return ''
  }
})
watch(
  () => [form.estimated_minutes, form.deadline],
  () => emit('context', { estimate: form.estimated_minutes, deadline: form.deadline }),
  { immediate: true },
)
const localError = ref('')
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial))
watch(dirty, (value) => emit('dirty', value))
function submit() {
  if (props.busy || props.blocked) return
  localError.value = ''
  try {
    if (!form.title.trim()) {
      localError.value = 'Укажіть назву завдання.'
      return
    }
    if (new TextEncoder().encode(form.description).length > 65535) {
      localError.value = 'Опис задовгий. Скоротіть текст.'
      return
    }
    if (budgetError.value) {
      localError.value = budgetError.value
      return
    }
    const deadline =
      form.deadline === initial.deadline && props.task
        ? props.task.deadline_at
        : taskDeadlineUtc(form.deadline, props.timezone)
    const input: TaskInput = {
      title: form.title.trim(),
      description: form.description || null,
      subject_id: form.subject_id ? Number(form.subject_id) : null,
      priority: Number(form.priority) as Priority,
      estimated_minutes: taskMinutes(form.estimated_minutes),
      deadline_at: deadline,
    }
    // Only changed fields are sent for PATCH by the owning view.
    emit('submit', input)
  } catch (e) {
    localError.value = e instanceof Error ? e.message : 'Перевірте дату.'
  }
}
</script>
<template>
  <form class="stack" @submit.prevent="submit">
    <fieldset :disabled="busy || blocked">
      <div class="stack">
        <p v-if="localError" class="field-error" role="alert">{{ localError }}</p>
        <FormField id="task-title" label="Назва завдання *" :errors="errors.title" v-slot="f">
          <input
            :id="f.id"
            v-model="form.title"
            required
            maxlength="255"
            :aria-invalid="f.invalid"
            :aria-describedby="f.describedby"
            placeholder="Що потрібно зробити?"
          />
        </FormField>
        <fieldset class="form-grid">
          <legend>Дедлайн, предмет і пріоритет</legend>
          <TaskDateTimeField
            id="task-deadline"
            v-model="form.deadline"
            label="Дедлайн"
            :timezone="timezone"
            :errors="errors.deadline_at"
            :preserved-value="initial.deadline"
          />
          <FormField id="task-subject" label="Предмет" :errors="errors.subject_id" v-slot="f">
            <select
              :id="f.id"
              v-model="form.subject_id"
              :aria-invalid="f.invalid"
              :aria-describedby="f.describedby"
            >
              <option value="">Без предмета</option>
              <option
                v-if="task?.subject_id && !subjects.some((s) => s.id === task?.subject_id)"
                :value="String(task.subject_id)"
              >
                Поточний предмет недоступний
              </option>
              <option v-for="subject in subjects" :key="subject.id" :value="String(subject.id)">
                {{ subject.name }}
              </option>
            </select>
          </FormField>
          <FormField id="task-priority" label="Пріоритет" :errors="errors.priority" v-slot="f">
            <select
              :id="f.id"
              v-model="form.priority"
              :aria-invalid="f.invalid"
              :aria-describedby="f.describedby"
            >
              <option value="1">Низький</option>
              <option value="2">Звичайний</option>
              <option value="3">Високий</option>
            </select>
          </FormField>
        </fieldset>
        <FormSection
          title="Деталі роботи"
          description="Опис допоможе почати, а оцінка часу — знайти місце в навчальному плані."
        >
          <FormField id="task-description" label="Опис" :errors="errors.description" v-slot="f">
            <textarea
              :id="f.id"
              v-model="form.description"
              rows="4"
              :aria-invalid="f.invalid"
              :aria-describedby="f.describedby"
              placeholder="Деталі, які допоможуть почати"
            ></textarea>
          </FormField>
          <TaskMinutesField
            id="task-estimate"
            v-model="form.estimated_minutes"
            label="Орієнтовна тривалість, хв"
            :errors="errors.estimated_minutes"
            :budget-error="budgetError"
          />
        </FormSection>
        <div class="actions">
          <AppButton variant="primary" type="submit" :busy="busy">
            {{ task ? 'Зберегти зміни' : 'Створити завдання' }}
          </AppButton>
          <RouterLink to="/tasks" class="button secondary">Скасувати</RouterLink>
        </div>
      </div>
    </fieldset>
  </form>
</template>
