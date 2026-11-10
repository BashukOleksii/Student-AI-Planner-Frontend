<script setup lang="ts">
import { useId } from 'vue'
import FormField from '@/components/ui/FormField.vue'
import type { SemesterSchedule } from '@/types/semesterSchedule'
defineProps<{ schedules: SemesterSchedule[] }>()
const selected = defineModel<number | null>({ required: true })
const id = useId()
</script>

<template>
  <FormField :id="id" label="Навчальний період і група">
    <select :id="id" v-model="selected">
      <option :value="null" disabled>Оберіть семестр</option>
      <option v-for="schedule in schedules" :key="schedule.id" :value="schedule.id">
        {{ schedule.academic_period.name }} · {{ schedule.group_name }} ·
        {{ schedule.education_institution.name }} ({{ schedule.academic_period.starts_on }} —
        {{ schedule.academic_period.ends_on }})
      </option>
    </select>
  </FormField>
</template>
