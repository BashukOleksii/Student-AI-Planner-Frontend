<script setup lang="ts">
import { localErrorText } from '@/utils/publicText'

import { reactive, ref, computed, watch } from 'vue'
import type { Subject, Teacher, FieldErrors, LessonType } from '@/types/api'
import type { LessonDetail, LessonInput } from '@/types/lessons'
import { toLocalInput, toUtc, calendarLabel, localDate, today } from '@/utils/dates'
import { lessonTypes } from '@/utils/lessons'
import FormSection from '@/components/ui/FormSection.vue'
import FormField from '@/components/ui/FormField.vue'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{
  lesson?: LessonDetail
  subjects: Subject[]
  teachers: Teacher[]
  date?: string
  activePeriodId?: number | null
  timezone: string
  errors: FieldErrors
  busy: boolean
  blocked?: boolean
  submitLabel: string
}>()
const emit = defineEmits<{ submit: [value: LessonInput]; dirty: [value: boolean]; cancel: [] }>()
const date = computed(() =>
  props.lesson
    ? localDate(props.lesson.starts_at, props.timezone)
    : (props.date ?? today(props.timezone)),
)
const initial = {
  subject_id: props.lesson?.subject_id?.toString() ?? '',
  teacher_id: props.lesson?.teacher_id?.toString() ?? '',
  type: props.lesson?.type ?? ('lecture' as LessonType),
  room: props.lesson?.room ?? '',
  starts_at: toLocalInput(props.lesson?.starts_at ?? null, props.timezone).slice(11, 16),
  ends_at: toLocalInput(props.lesson?.ends_at ?? null, props.timezone).slice(11, 16),
}
const form = reactive({ ...initial }),
  localError = ref('')
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial))
watch(dirty, (value) => emit('dirty', value))
function submit() {
  if (props.busy || props.blocked) return
  localError.value = ''
  try {
    if (!form.subject_id)
      throw new Error('Оберіть предмет. Його можна створити в академічному просторі.')
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.starts_at) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.ends_at) ||
      form.ends_at <= form.starts_at
    )
      throw new Error(
        'Укажіть час у форматі ГГ:ХХ. Кінець має бути пізніше початку в межах цього дня.',
      )
    if (!props.lesson && !props.activePeriodId)
      throw new Error('Спочатку налаштуйте актуальний навчальний період.')
    const starts_at =
      props.lesson && form.starts_at === initial.starts_at
        ? props.lesson.starts_at
        : toUtc(`${date.value}T${form.starts_at}:00`, props.timezone)
    const ends_at =
      props.lesson && form.ends_at === initial.ends_at
        ? props.lesson.ends_at
        : toUtc(`${date.value}T${form.ends_at}:00`, props.timezone)
    if (!starts_at || !ends_at || starts_at >= ends_at)
      throw new Error('Вкажіть початок і пізніше завершення заняття.')
    emit('submit', {
      subject_id: Number(form.subject_id),
      teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
      academic_period_id: props.lesson
        ? props.lesson.academic_period_id
        : (props.activePeriodId ?? null),
      type: form.type,
      room: form.room || null,
      starts_at,
      ends_at,
    })
  } catch (e) {
    localError.value = localErrorText(e, 'Перевірте час заняття.')
  }
}
</script>
<template>
  <form class="stack" @submit.prevent="submit">
    <div class="lesson-form-date">
      <h2>{{ calendarLabel(date) }}</h2>
      <p class="helper">
        Час у поясі {{ timezone }}. Заняття починається й закінчується цього дня.
      </p>
    </div>
    <p v-if="localError" class="field-error" role="alert">{{ localError }}</p>
    <fieldset :disabled="busy || blocked" class="schedule-fieldset">
      <FormSection title="Предмет і місце">
        <div class="form-grid">
          <FormField
            id="lesson-subject"
            v-slot="a"
            label="Предмет заняття *"
            :errors="errors.subject_id"
          >
            <select
              :id="a.id"
              v-model="form.subject_id"
              required
              :aria-invalid="a.invalid"
              :aria-describedby="a.describedby"
            >
              <option value="" disabled>Оберіть предмет</option>
              <option
                v-if="lesson?.subject_id && !subjects.some((s) => s.id === lesson?.subject_id)"
                :value="String(lesson.subject_id)"
              >
                Поточний предмет недоступний
              </option>
              <option v-for="s in subjects" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
            </select>
          </FormField>
          <FormField id="lesson-type" v-slot="a" label="Тип заняття *" :errors="errors.type">
            <select
              :id="a.id"
              v-model="form.type"
              required
              :aria-invalid="a.invalid"
              :aria-describedby="a.describedby"
            >
              <option v-for="(label, key) in lessonTypes" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
          </FormField>
          <FormField
            id="lesson-teacher"
            v-slot="a"
            label="Викладач заняття"
            :errors="errors.teacher_id"
          >
            <select
              :id="a.id"
              v-model="form.teacher_id"
              :aria-invalid="a.invalid"
              :aria-describedby="a.describedby"
            >
              <option value="">Без викладача</option>
              <option
                v-if="lesson?.teacher_id && !teachers.some((t) => t.id === lesson?.teacher_id)"
                :value="String(lesson.teacher_id)"
              >
                Поточний викладач недоступний
              </option>
              <option v-for="t in teachers" :key="t.id" :value="String(t.id)">
                {{ t.name }}
              </option>
            </select>
          </FormField>
          <FormField id="lesson-room" v-slot="a" label="Аудиторія заняття" :errors="errors.room">
            <input
              :id="a.id"
              v-model="form.room"
              maxlength="100"
              :aria-invalid="a.invalid"
              :aria-describedby="a.describedby"
            />
          </FormField>
        </div>
      </FormSection>
      <FormSection title="Час проведення">
        <div class="form-grid">
          <FormField
            id="lesson-start"
            v-slot="a"
            label="Початок"
            hint="Наприклад, 08:30"
            :errors="errors.starts_at"
          >
            <input
              :id="a.id"
              v-model="form.starts_at"
              type="time"
              step="60"
              required
              :aria-invalid="a.invalid"
              :aria-describedby="a.describedby"
            />
          </FormField>
          <FormField
            id="lesson-end"
            v-slot="a"
            label="Кінець"
            hint="Наприклад, 10:00"
            :errors="errors.ends_at"
          >
            <input
              :id="a.id"
              v-model="form.ends_at"
              type="time"
              step="60"
              required
              :aria-invalid="a.invalid"
              :aria-describedby="a.describedby"
            />
          </FormField>
        </div>
      </FormSection>
    </fieldset>
    <div class="actions">
      <AppButton type="submit" variant="primary" :busy="busy" :disabled="blocked">
        {{ submitLabel }}
      </AppButton>
      <AppButton :disabled="busy" @click="emit('cancel')">Скасувати</AppButton>
    </div>
  </form>
</template>
