<script setup lang="ts">
import { useId } from 'vue'
import type { DateRange } from '@/types/planning'
const model = defineModel<DateRange>({ required: true })
defineProps<{ disabled?: boolean }>()
const id = useId()
</script>
<template>
  <div class="form-grid">
    <div class="field">
      <label :for="`${id}-start`">Початок періоду</label>
      <input
        :id="`${id}-start`"
        v-model="model.start_date"
        type="date"
        min="1000-01-01"
        max="9999-12-31"
        required
        :disabled="disabled"
      />
    </div>
    <div class="field">
      <label :for="`${id}-end`">Кінець періоду</label>
      <input
        :id="`${id}-end`"
        v-model="model.end_date"
        type="date"
        min="1000-01-01"
        max="9999-12-31"
        required
        :disabled="disabled"
      />
    </div>
  </div>
  <p class="helper">До 31 календарного дня включно, у часовому поясі профілю.</p>
</template>
