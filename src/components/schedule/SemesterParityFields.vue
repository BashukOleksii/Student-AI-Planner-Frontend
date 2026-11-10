<script setup lang="ts">
import { useId } from 'vue'
import FormField from '@/components/ui/FormField.vue'
import type { FieldErrors } from '@/types/api'
import type { Parity } from '@/types/semesterSchedule'
import { patterns } from '@/utils/semesterSchedule'
defineProps<{ errors: FieldErrors }>()
const anchor = defineModel<string>('anchor', { required: true })
const parity = defineModel<Parity | ''>('parity', { required: true })
const id = useId()
</script>
<template>
  <FormField
    :id="`${id}-anchor`"
    label="Понеділок відліку"
    :errors="errors.parity_anchor_on"
    hint="Вкажіть понеділок тижня, парність якого вам відома."
  >
    <template #default="{ id: field, invalid, describedby }">
      <input
        :id="field"
        v-model="anchor"
        type="date"
        min="0001-01-01"
        max="9999-12-31"
        required
        :aria-invalid="invalid"
        :aria-describedby="describedby"
      />
    </template>
  </FormField>
  <FormField :id="`${id}-parity`" label="Парність тижня відліку" :errors="errors.first_week_parity">
    <template #default="{ id: field, invalid, describedby }">
      <select
        :id="field"
        v-model="parity"
        required
        :aria-invalid="invalid"
        :aria-describedby="describedby"
      >
        <option value="" disabled>Оберіть парність</option>
        <option value="numerator">{{ patterns.numerator }}</option>
        <option value="denominator">{{ patterns.denominator }}</option>
      </select>
    </template>
  </FormField>
</template>
