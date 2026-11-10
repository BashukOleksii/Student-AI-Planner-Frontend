<script setup lang="ts">
import { computed, useId } from 'vue'
import FormField from '@/components/ui/FormField.vue'
import type { AcademicPeriod, EducationInstitution } from '@/types/api'
const props = defineProps<{
  periods: AcademicPeriod[]
  institutions: EducationInstitution[]
  errors?: string[]
  exclude?: number[]
}>()
const selected = defineModel<number | null>({ required: true })
const id = useId()
const eligible = computed(() =>
  props.periods.filter(
    (item) => item.education_institution_id && !props.exclude?.includes(item.id),
  ),
)
</script>
<template>
  <FormField :id="id" label="Навчальний період" :errors="errors">
    <template #default="{ id: field, invalid, describedby }">
      <select
        :id="field"
        v-model="selected"
        required
        :aria-invalid="invalid"
        :aria-describedby="describedby"
      >
        <option :value="null" disabled>Оберіть період</option>
        <option v-for="period in eligible" :key="period.id" :value="period.id">
          {{ period.name }} ·
          {{ institutions.find((item) => item.id === period.education_institution_id)?.name }} ({{
            period.starts_on
          }}
          — {{ period.ends_on }})
        </option>
      </select>
    </template>
  </FormField>
  <p v-if="!eligible.length" class="helper">Немає доступних періодів із прив’язаним закладом.</p>
  <RouterLink to="/academic/periods" class="text-link">Керувати навчальними періодами</RouterLink>
</template>
