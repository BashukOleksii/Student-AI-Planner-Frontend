<script setup lang="ts">
import { computed, reactive, useId, useTemplateRef, watchEffect } from 'vue'
import FormField from '@/components/ui/FormField.vue'
import type { LessonType } from '@/types/api'
import type { FieldErrors } from '@/types/api'
import type {
  LessonDefinitionInput,
  SemesterSubject,
  SemesterTeacher,
} from '@/types/semesterSchedule'
import {
  localMinutes,
  localSeconds,
  localTimeError,
  pairLabel,
  validPairNumber,
} from '@/utils/semesterSchedule'
const lessonTypes: { value: LessonType; label: string }[] = [
  { value: 'lecture', label: 'Лекція' },
  { value: 'laboratory', label: 'Лабораторна' },
  { value: 'practical', label: 'Практична' },
  { value: 'seminar', label: 'Семінар' },
  { value: 'consultation', label: 'Консультація' },
  { value: 'exam', label: 'Іспит' },
  { value: 'other', label: 'Інше' },
]
const props = defineProps<{
  subjects: SemesterSubject[]
  teachers: SemesterTeacher[]
  errors: FieldErrors
  prefix?: string
}>()
const lesson = defineModel<LessonDefinitionInput>({ required: true })
const id = useId()
type TimeField = 'starts_at_local' | 'ends_at_local'
const pairInput = useTemplateRef<HTMLInputElement>('pairInput')
const timeInputs = useTemplateRef<HTMLInputElement[]>('timeInputs')
const touched = reactive({ pair_number: false, starts_at_local: false, ends_at_local: false })
const pairError = computed(() =>
  validPairNumber(lesson.value.pair_number)
    ? undefined
    : 'Номер пари має бути цілим числом від 1 до 255.',
)
const pairHint = computed(() => {
  if (!validPairNumber(lesson.value.pair_number)) return 'Оберіть цілий номер від 1 до 255.'
  const generated = pairLabel(lesson.value.pair_number)
  const historical =
    lesson.value.pair_label !== generated
      ? ` Збережене позначення: ${lesson.value.pair_label ?? 'не вказано'}. Воно зміниться лише зі зміною номера пари.`
      : ''
  return `Автоматичне позначення: ${generated}.${historical}`
})
const timeErrors = computed(() => {
  const start = localTimeError(lesson.value.starts_at_local)
  let end = localTimeError(lesson.value.ends_at_local)
  if (!start && !end && lesson.value.ends_at_local <= lesson.value.starts_at_local)
    end = 'Кінець пари має бути пізніше початку.'
  return { starts_at_local: start, ends_at_local: end }
})
watchEffect(() => {
  pairInput.value?.setCustomValidity(pairError.value ?? '')
  for (const input of timeInputs.value ?? []) {
    const field = input.dataset.timeField
    if (field === 'starts_at_local' || field === 'ends_at_local')
      input.setCustomValidity(timeErrors.value[field] ?? '')
  }
})
function editPair(event: Event) {
  const number = Number((event.target as HTMLInputElement).value)
  const changed = number !== lesson.value.pair_number
  lesson.value = {
    ...lesson.value,
    pair_number: number,
    ...(changed && validPairNumber(number) ? { pair_label: pairLabel(number) } : {}),
  }
  touched.pair_number = true
}
function editTime(field: TimeField, event: Event) {
  const input = event.target as HTMLInputElement
  let value = input.value
  // Help numeric mobile keyboards at the end of input; leave deletion/caret edits alone.
  if (
    !(event as InputEvent).inputType?.startsWith('delete') &&
    input.selectionStart === value.length &&
    /^\d{3,4}$/.test(value)
  )
    value = `${value.slice(0, 2)}:${value.slice(2)}`
  edit(field, localSeconds(value))
  touched[field] = true
}
function timeFieldErrors(field: TimeField) {
  return [
    ...(errors(field) ?? []),
    ...(touched[field] && timeErrors.value[field] ? [timeErrors.value[field]] : []),
  ]
}
function errors(field: keyof LessonDefinitionInput) {
  return props.errors[(props.prefix ?? '') + field]
}
function edit<K extends keyof LessonDefinitionInput>(field: K, value: LessonDefinitionInput[K]) {
  lesson.value = { ...lesson.value, [field]: value }
}
const teacherErrors = computed(() =>
  Object.entries(props.errors)
    .filter(([field]) => {
      const key = (props.prefix ?? '') + 'teacher_ids'
      return (
        field === key ||
        field.startsWith(key + '.') ||
        field === (props.prefix ?? '') + 'teacher_id'
      )
    })
    .flatMap(([, messages]) => messages),
)
</script>
<template>
  <div class="semester-form-grid">
    <FormField
      :id="`${id}-pair`"
      label="Номер пари"
      :hint="pairHint"
      :errors="[
        ...(errors('pair_number') ?? []),
        ...(errors('pair_label') ?? []),
        ...(touched.pair_number && pairError ? [pairError] : []),
      ]"
    >
      <template #default="{ id: field, invalid, describedby }">
        <input
          :id="field"
          ref="pairInput"
          :value="lesson.pair_number || ''"
          @input="editPair"
          @invalid="touched.pair_number = true"
          type="number"
          inputmode="numeric"
          min="1"
          max="255"
          step="1"
          required
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
      :errors="timeFieldErrors(item.field)"
      hint="24-годинний формат, наприклад 08:30."
    >
      <template #default="{ id: field, invalid, describedby }">
        <input
          :id="field"
          ref="timeInputs"
          :data-time-field="item.field"
          :value="localMinutes(lesson[item.field])"
          @input="editTime(item.field, $event)"
          @invalid="touched[item.field] = true"
          type="text"
          inputmode="numeric"
          placeholder="ГГ:ХХ"
          maxlength="5"
          pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
          autocomplete="off"
          required
          :aria-invalid="invalid"
          :aria-describedby="describedby"
        />
      </template>
    </FormField>
    <FormField :id="`${id}-lesson-type`" label="Тип заняття" :errors="errors('lesson_type')">
      <template #default="{ id: field, invalid, describedby }">
        <select
          :id="field"
          :value="lesson.lesson_type ?? ''"
          :aria-invalid="invalid"
          :aria-describedby="describedby"
          @change="
            edit(
              'lesson_type',
              (($event.target as HTMLSelectElement).value || null) as LessonType | null,
            )
          "
        >
          <option value="">Не визначено</option>
          <option v-for="type in lessonTypes" :key="type.value" :value="type.value">
            {{ type.label }}
          </option>
        </select>
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
    <FormField
      :id="`${id}-teacher`"
      label="Викладач"
      :errors="teacherErrors"
      hint="Для кожної пари потрібен один викладач."
    >
      <template #default="{ id: field, invalid, describedby }">
        <select
          :id="field"
          :value="lesson.teacher_id || ''"
          @change="edit('teacher_id', Number(($event.target as HTMLSelectElement).value))"
          required
          :aria-invalid="invalid"
          :aria-describedby="describedby"
        >
          <option value="" disabled>Оберіть викладача</option>
          <option
            v-if="lesson.teacher_id && !teachers.some((item) => item.id === lesson.teacher_id)"
            :value="lesson.teacher_id"
            disabled
          >
            Недоступний викладач №{{ lesson.teacher_id }} — оберіть іншого
          </option>
          <option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">
            {{ teacher.name }}
          </option>
        </select>
        <p v-if="!teachers.length" class="helper">
          <RouterLink to="/academic/teachers" class="text-link">Створіть викладача</RouterLink>
          , щоб зберегти пару.
        </p>
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
