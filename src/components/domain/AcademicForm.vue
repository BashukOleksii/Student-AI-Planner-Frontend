<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { Temporal } from '@js-temporal/polyfill'
import type {
  AcademicDraft,
  AcademicKind,
  AcademicRecord,
  EducationInstitution,
  FieldErrors,
} from '@/types/api'
import FormField from '@/components/ui/FormField.vue'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{
  kind: AcademicKind
  record?: AcademicRecord
  institutions: EducationInstitution[]
  errors: FieldErrors
  busy: boolean
}>()
const emit = defineEmits<{ submit: [draft: AcademicDraft]; close: []; dirty: [value: boolean] }>()
const nameInput = ref<HTMLInputElement>()
onMounted(() => nameInput.value?.focus())
const original = props.record
const initial = {
  name: original?.name ?? '',
  institution:
    original && 'education_institution_id' in original
      ? String(
          original.education_institution_id ??
            (props.institutions.length === 1 ? props.institutions[0]!.id : ''),
        )
      : props.institutions.length === 1
        ? String(props.institutions[0]!.id)
        : '',
  starts_on: original && 'starts_on' in original ? original.starts_on : '',
  ends_on: original && 'ends_on' in original ? original.ends_on : '',
  code: original && 'code' in original ? (original.code ?? '') : '',
  noCode: !(original && 'code' in original && original.code !== null),
  color: original && 'color' in original ? (original.color ?? '') : '',
}
const form = reactive({ ...initial })
const palette = [
  { value: '', name: 'Без кольору' },
  { value: '#2E5947', name: 'Зелений' },
  { value: '#2563EB', name: 'Синій' },
  { value: '#7C3AED', name: 'Фіолетовий' },
  { value: '#DB2777', name: 'Рожевий' },
  { value: '#DC2626', name: 'Червоний' },
  { value: '#D97706', name: 'Помаранчевий' },
  { value: '#0D9488', name: 'Бірюзовий' },
]
const colorOptions = computed(() =>
  palette.some((c) => c.value.toLowerCase() === form.color.toLowerCase()) || !form.color
    ? palette
    : [...palette, { value: form.color, name: `Поточний колір (${form.color})` }],
)
const localErrors = ref<FieldErrors>({})
const errors = computed(() => ({ ...props.errors, ...localErrors.value }))
watch(
  () => JSON.stringify(form) !== JSON.stringify(initial),
  (value) => emit('dirty', value),
)
const missingInstitution =
  original &&
  'education_institution_id' in original &&
  original.education_institution_id !== null &&
  !props.institutions.some((i) => i.id === original.education_institution_id)
    ? original.education_institution_id
    : null
function submit() {
  if (props.busy) return
  localErrors.value = {}
  if (!form.name.trim()) localErrors.value.name = ['Укажіть назву або ім’я.']
  if (props.kind === 'periods') {
    for (const field of ['starts_on', 'ends_on'] as const) {
      try {
        if (Temporal.PlainDate.from(form[field]).toString() !== form[field]) throw new Error()
      } catch {
        localErrors.value[field] = ['Укажіть дійсну календарну дату у форматі РРРР-ММ-ДД.']
      }
    }
    if (!Object.keys(localErrors.value).length && form.starts_on > form.ends_on)
      localErrors.value.ends_on = ['Кінець періоду має бути не раніше початку.']
  }
  if (props.kind === 'subjects' && form.color && !/^#[0-9a-fA-F]{6}$/.test(form.color))
    localErrors.value.color = ['Використайте формат #RRGGBB.']
  if (Object.keys(localErrors.value).length) return
  const name = form.name.trim()
  const education_institution_id = form.institution ? Number(form.institution) : null
  switch (props.kind) {
    case 'institutions':
      emit('submit', { kind: 'institutions', value: { name } })
      break
    case 'periods':
      emit('submit', {
        kind: 'periods',
        value: { name, education_institution_id, starts_on: form.starts_on, ends_on: form.ends_on },
      })
      break
    case 'subjects':
      emit('submit', {
        kind: 'subjects',
        value: {
          name,
          education_institution_id,
          code: form.noCode ? null : form.code,
          color: form.color || null,
        },
      })
      break
    case 'teachers':
      emit('submit', { kind: 'teachers', value: { name, education_institution_id } })
      break
  }
}
</script>
<template>
  <form class="stack" @submit.prevent="submit">
    <fieldset :disabled="busy">
      <div class="stack">
        <FormField
          id="academic-name"
          :label="kind === 'teachers' ? 'Ім’я викладача' : 'Назва'"
          :errors="errors.name"
          v-slot="f"
        >
          <input
            ref="nameInput"
            :id="f.id"
            v-model="form.name"
            required
            maxlength="255"
            autofocus
            :aria-invalid="f.invalid"
            :aria-describedby="f.describedby"
          />
        </FormField>
        <FormField
          v-if="kind !== 'institutions' && (institutions.length !== 1 || missingInstitution)"
          id="academic-institution"
          label="Навчальний заклад"
          :errors="errors.education_institution_id"
          v-slot="f"
        >
          <select
            :id="f.id"
            v-model="form.institution"
            :aria-invalid="f.invalid"
            :aria-describedby="f.describedby"
          >
            <option value="">Без закладу</option>
            <option v-if="missingInstitution" :value="String(missingInstitution)">
              Попередній заклад недоступний
            </option>
            <option
              v-for="institution in institutions"
              :key="institution.id"
              :value="String(institution.id)"
            >
              {{ institution.name }}
            </option>
          </select>
        </FormField>
        <p
          v-if="kind !== 'institutions' && institutions.length === 1 && !missingInstitution"
          class="helper"
        >
          Навчальний заклад: {{ institutions[0]?.name }}
        </p>
        <p
          v-for="message in institutions.length === 1 && !missingInstitution
            ? errors.education_institution_id
            : []"
          :key="message"
          class="field-error"
        >
          {{ message }}
        </p>
        <div v-if="kind === 'periods'" class="form-grid">
          <FormField
            id="period-start"
            label="Початок періоду"
            :errors="errors.starts_on"
            v-slot="f"
          >
            <input
              :id="f.id"
              v-model="form.starts_on"
              type="date"
              required
              :aria-invalid="f.invalid"
              :aria-describedby="f.describedby"
            />
          </FormField>
          <FormField id="period-end" label="Кінець періоду" :errors="errors.ends_on" v-slot="f">
            <input
              :id="f.id"
              v-model="form.ends_on"
              type="date"
              required
              :aria-invalid="f.invalid"
              :aria-describedby="f.describedby"
            />
          </FormField>
        </div>
        <template v-if="kind === 'subjects'">
          <label class="checkbox-field">
            <input v-model="form.noCode" type="checkbox" />
            Код не вказано
          </label>
          <FormField
            v-if="!form.noCode"
            id="subject-code"
            label="Код предмета"
            hint="До 50 символів. Порожній код дозволено."
            :errors="errors.code"
            v-slot="f"
          >
            <input
              :id="f.id"
              v-model="form.code"
              maxlength="50"
              :aria-invalid="f.invalid"
              :aria-describedby="f.describedby"
            />
          </FormField>
          <fieldset
            class="stack"
            :aria-describedby="errors.color?.length ? 'subject-color-error' : undefined"
          >
            <legend>Колір предмета</legend>
            <div class="color-palette">
              <label v-for="option in colorOptions" :key="option.value" class="color-option">
                <input
                  type="radio"
                  name="subject-color"
                  :value="option.value"
                  :checked="form.color.toLowerCase() === option.value.toLowerCase()"
                  @change="form.color = option.value"
                />
                <span
                  v-if="option.value"
                  class="color-dot"
                  :style="{ backgroundColor: option.value }"
                  aria-hidden="true"
                ></span>
                {{ option.name }}
              </label>
            </div>
            <p v-if="errors.color?.length" id="subject-color-error" class="field-error">
              {{ errors.color.join(' ') }}
            </p>
          </fieldset>
        </template>
        <p v-if="kind === 'teachers'" class="helper">Викладачі можуть мати однакові імена.</p>
        <div class="actions">
          <AppButton variant="primary" type="submit" :busy="busy">
            {{ record ? 'Зберегти зміни' : 'Створити' }}
          </AppButton>
          <AppButton :disabled="busy" @click="emit('close')">Скасувати</AppButton>
        </div>
      </div>
    </fieldset>
  </form>
</template>

<style scoped>
.color-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.color-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.color-option:has(input:checked) {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
