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
      ? String(original.education_institution_id ?? '')
      : '',
  starts_on: original && 'starts_on' in original ? original.starts_on : '',
  ends_on: original && 'ends_on' in original ? original.ends_on : '',
  code: original && 'code' in original ? (original.code ?? '') : '',
  noCode: !(original && 'code' in original && original.code !== null),
  color: original && 'color' in original ? (original.color ?? '') : '',
}
const form = reactive({ ...initial })
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
          v-if="kind !== 'institutions'"
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
              Поточний заклад #{{ missingInstitution }}
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
          <FormField
            id="subject-color"
            label="Колір предмета"
            hint="#RRGGBB, наприклад #2E5947. Порожнє поле прибирає колір."
            :errors="errors.color"
            v-slot="f"
          >
            <input
              :id="f.id"
              v-model="form.color"
              pattern="#[0-9a-fA-F]{6}"
              maxlength="7"
              placeholder="#2E5947"
              :aria-invalid="f.invalid"
              :aria-describedby="f.describedby"
            />
          </FormField>
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
