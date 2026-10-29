<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Task, TaskInput, Subject, FieldErrors, Priority } from '@/types/api'
import { toLocalInput, toUtc } from '@/utils/dates'
import FormField from '@/components/ui/FormField.vue'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{
  task?: Task
  subjects: Subject[]
  timezone: string
  errors: FieldErrors
  busy: boolean
}>()
const emit = defineEmits<{ submit: [value: TaskInput]; dirty: [value: boolean] }>()
const initial = {
  title: props.task?.title ?? '',
  description: props.task?.description ?? '',
  subject_id: props.task?.subject_id ? String(props.task.subject_id) : '',
  priority: String(props.task?.priority ?? 2),
  estimated_minutes: props.task?.estimated_minutes?.toString() ?? '',
  deadline: toLocalInput(props.task?.deadline_at ?? null, props.timezone),
}
const form = reactive({ ...initial })
const localError = ref('')
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial))
watch(dirty, (value) => emit('dirty', value))
function submit() {
  localError.value = ''
  try {
    if (!form.title.trim()) {
      localError.value = 'Укажіть назву завдання.'
      return
    }
    if (new TextEncoder().encode(form.description).length > 65535) {
      localError.value = 'Опис перевищує 65535 байтів. Скоротіть текст.'
      return
    }
    const deadline =
      form.deadline === initial.deadline && props.task
        ? props.task.deadline_at
        : toUtc(form.deadline, props.timezone)
    const input: TaskInput = {
      title: form.title.trim(),
      description: form.description || null,
      subject_id: form.subject_id ? Number(form.subject_id) : null,
      priority: Number(form.priority) as Priority,
      estimated_minutes: form.estimated_minutes ? Number(form.estimated_minutes) : null,
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
    <fieldset :disabled="busy">
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
        <div class="form-grid">
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
                Поточний предмет #{{ task.subject_id }}
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
          <FormField
            id="task-estimate"
            label="Орієнтовна тривалість, хв"
            :errors="errors.estimated_minutes"
            v-slot="f"
          >
            <input
              :id="f.id"
              v-model="form.estimated_minutes"
              type="number"
              min="1"
              max="65535"
              step="1"
              :aria-invalid="f.invalid"
              :aria-describedby="f.describedby"
              placeholder="Необов’язково"
            />
          </FormField>
          <FormField
            id="task-deadline"
            label="Дедлайн"
            :errors="errors.deadline_at"
            :hint="`Місцевий час: ${timezone}. Залиште порожнім, щоб прибрати дедлайн.`"
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
        </div>
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
