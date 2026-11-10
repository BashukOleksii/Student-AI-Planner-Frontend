<script setup lang="ts">
import { useId } from 'vue'
import FormField from '@/components/ui/FormField.vue'
import type { FieldErrors } from '@/types/api'
import type {
  LessonDefinitionInput,
  SemesterSubject,
  SemesterTeacher,
} from '@/types/semesterSchedule'
import { localSeconds } from '@/utils/semesterSchedule'
const props = defineProps<{
  subjects: SemesterSubject[]
  teachers: SemesterTeacher[]
  errors: FieldErrors
  prefix?: string
}>()
const lesson = defineModel<LessonDefinitionInput>({ required: true })
const id = useId()
function errors(field: keyof LessonDefinitionInput) {
  return props.errors[(props.prefix ?? '') + field]
}
function edit<K extends keyof LessonDefinitionInput>(field: K, value: LessonDefinitionInput[K]) {
  lesson.value = { ...lesson.value, [field]: value }
}
</script>
<template>
  <div class="semester-form-grid">
    <FormField :id="`${id}-pair`" label="Номер пари" :errors="errors('pair_number')">
      <template #default="{ id: field, invalid, describedby }">
        <input
          :id="field"
          :value="lesson.pair_number || ''"
          @input="edit('pair_number', Number(($event.target as HTMLInputElement).value))"
          type="number"
          min="1"
          max="255"
          required
          :aria-invalid="invalid"
          :aria-describedby="describedby"
        />
      </template>
    </FormField>
    <FormField
      :id="`${id}-label`"
      label="Позначення пари"
      :errors="errors('pair_label')"
      hint="Наприклад, 1-2. Необов’язково."
    >
      <template #default="{ id: field, invalid, describedby }">
        <input
          :id="field"
          :value="lesson.pair_label"
          @input="edit('pair_label', ($event.target as HTMLInputElement).value || null)"
          maxlength="32"
          :aria-invalid="invalid"
          :aria-describedby="describedby"
        />
      </template>
    </FormField>
    <FormField
      v-for="item in [
        { field: 'starts_at_local', label: 'Початок' },
        { field: 'ends_at_local', label: 'Кінець' },
      ] as const"
      :key="item.field"
      :id="`${id}-${item.field}`"
      :label="item.label"
      :errors="errors(item.field)"
    >
      <template #default="{ id: field, invalid, describedby }">
        <input
          :id="field"
          :value="lesson[item.field]"
          @input="edit(item.field, localSeconds(($event.target as HTMLInputElement).value))"
          type="time"
          step="1"
          required
          :aria-invalid="invalid"
          :aria-describedby="describedby"
        />
      </template>
    </FormField>
    <FormField :id="`${id}-subject`" label="Предмет" :errors="errors('subject_id')">
      <template #default="{ id: field, invalid, describedby }">
        <select
          :id="field"
          :value="lesson.subject_id || ''"
          @change="edit('subject_id', Number(($event.target as HTMLSelectElement).value))"
          required
          :aria-invalid="invalid"
          :aria-describedby="describedby"
        >
          <option value="" disabled>Оберіть предмет</option>
          <option
            v-if="
              lesson.subject_id && !subjects.some((subject) => subject.id === lesson.subject_id)
            "
            :value="lesson.subject_id"
          >
            Недоступний предмет №{{ lesson.subject_id }}
          </option>
          <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
            {{ subject.name }}{{ subject.code ? ` · ${subject.code}` : '' }}
          </option>
        </select>
      </template>
    </FormField>
    <FormField :id="`${id}-teacher`" label="Викладач" :errors="errors('teacher_id')">
      <template #default="{ id: field, invalid, describedby }">
        <select
          :id="field"
          :value="lesson.teacher_id ?? ''"
          @change="edit('teacher_id', Number(($event.target as HTMLSelectElement).value) || null)"
          :aria-invalid="invalid"
          :aria-describedby="describedby"
        >
          <option value="">Без викладача</option>
          <option
            v-if="
              lesson.teacher_id && !teachers.some((teacher) => teacher.id === lesson.teacher_id)
            "
            :value="lesson.teacher_id"
          >
            Недоступний викладач №{{ lesson.teacher_id }}
          </option>
          <option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">
            {{ teacher.name }} · №{{ teacher.id }}
          </option>
        </select>
      </template>
    </FormField>
    <FormField :id="`${id}-room`" label="Аудиторія" :errors="errors('room')">
      <template #default="{ id: field, invalid, describedby }">
        <input
          :id="field"
          :value="lesson.room"
          @input="edit('room', ($event.target as HTMLInputElement).value || null)"
          maxlength="100"
          :aria-invalid="invalid"
          :aria-describedby="describedby"
        />
      </template>
    </FormField>
  </div>
</template>
