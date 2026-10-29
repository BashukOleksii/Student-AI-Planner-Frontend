<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import type { AcademicPeriod, Subject, Teacher, FieldErrors, LessonType } from '@/types/api'
import type { LessonDetail, LessonInput } from '@/types/lessons'
import { toLocalInput, toUtc } from '@/utils/dates'
import { lessonTypes } from '@/utils/lessons'
import FormField from '@/components/ui/FormField.vue'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{
  lesson?: LessonDetail
  subjects: Subject[]
  teachers: Teacher[]
  periods: AcademicPeriod[]
  timezone: string
  errors: FieldErrors
  busy: boolean
  blocked?: boolean
  submitLabel: string
}>()
const emit = defineEmits<{ submit: [value: LessonInput]; dirty: [value: boolean] }>()
const initial = {
  subject_id: props.lesson?.subject_id?.toString() ?? '',
  teacher_id: props.lesson?.teacher_id?.toString() ?? '',
  academic_period_id: props.lesson?.academic_period_id?.toString() ?? '',
  type: props.lesson?.type ?? ('lecture' as LessonType),
  room: props.lesson?.room ?? '',
  starts_at: toLocalInput(props.lesson?.starts_at ?? null, props.timezone),
  ends_at: toLocalInput(props.lesson?.ends_at ?? null, props.timezone),
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
    const starts_at =
      props.lesson && form.starts_at === initial.starts_at
        ? props.lesson.starts_at
        : toUtc(form.starts_at, props.timezone)
    const ends_at =
      props.lesson && form.ends_at === initial.ends_at
        ? props.lesson.ends_at
        : toUtc(form.ends_at, props.timezone)
    if (!starts_at || !ends_at || starts_at >= ends_at)
      throw new Error('Вкажіть початок і пізніше завершення заняття.')
    emit('submit', {
      subject_id: Number(form.subject_id),
      teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
      academic_period_id: form.academic_period_id ? Number(form.academic_period_id) : null,
      type: form.type,
      room: form.room || null,
      starts_at,
      ends_at,
    })
  } catch (e) {
    localError.value = e instanceof Error ? e.message : 'Перевірте час заняття.'
  }
}
</script>
<template>
  <form class="stack" @submit.prevent="submit">
    <p class="helper">
      Дата й час у поясі {{ timezone }}. Неіснуючий або повторюваний місцевий час потрібно змінити.
    </p>
    <p v-if="localError" class="field-error" role="alert">{{ localError }}</p>
    <fieldset :disabled="busy || blocked" class="schedule-fieldset">
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
              Поточний предмет №{{ lesson.subject_id }}
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
            <option v-for="(label, key) in lessonTypes" :key="key" :value="key">{{ label }}</option>
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
              Поточний викладач №{{ lesson.teacher_id }}
            </option>
            <option v-for="t in teachers" :key="t.id" :value="String(t.id)">
              {{ t.name }} · №{{ t.id }}
            </option>
          </select>
        </FormField>
        <FormField
          id="lesson-period"
          v-slot="a"
          label="Навчальний період заняття"
          :errors="errors.academic_period_id"
        >
          <select
            :id="a.id"
            v-model="form.academic_period_id"
            :aria-invalid="a.invalid"
            :aria-describedby="a.describedby"
          >
            <option value="">Без періоду</option>
            <option
              v-if="
                lesson?.academic_period_id &&
                !periods.some((p) => p.id === lesson?.academic_period_id)
              "
              :value="String(lesson.academic_period_id)"
            >
              Поточний період №{{ lesson.academic_period_id }}
            </option>
            <option v-for="p in periods" :key="p.id" :value="String(p.id)">
              {{ p.name }} · {{ p.starts_on }} — {{ p.ends_on }}
            </option>
          </select>
        </FormField>
        <FormField
          id="lesson-start"
          v-slot="a"
          label="Початок заняття *"
          :errors="errors.starts_at"
        >
          <input
            :id="a.id"
            v-model="form.starts_at"
            type="datetime-local"
            min="1000-01-01T00:00"
            max="9999-12-31T23:59:59"
            step="1"
            required
            :aria-invalid="a.invalid"
            :aria-describedby="a.describedby"
          />
        </FormField>
        <FormField id="lesson-end" v-slot="a" label="Завершення заняття *" :errors="errors.ends_at">
          <input
            :id="a.id"
            v-model="form.ends_at"
            type="datetime-local"
            min="1000-01-01T00:00"
            max="9999-12-31T23:59:59"
            step="1"
            required
            :aria-invalid="a.invalid"
            :aria-describedby="a.describedby"
          />
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
    </fieldset>
    <AppButton type="submit" variant="primary" :busy="busy" :disabled="blocked">
      {{ submitLabel }}
    </AppButton>
  </form>
</template>
