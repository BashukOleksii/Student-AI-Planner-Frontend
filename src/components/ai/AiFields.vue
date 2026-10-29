<script setup lang="ts">
import type { PublicValue } from '@/types/ai'
import { displayValue, fieldLabel } from '@/utils/ai'
defineProps<{ value: PublicValue; timezone: string; field?: string }>()
</script>
<template>
  <ol v-if="Array.isArray(value) && value.length" class="ai-value-list">
    <li v-for="(item, index) in value" :key="index">
      <AiFields :value="item" :timezone="timezone" :field="field" />
    </li>
  </ol>
  <p v-else-if="Array.isArray(value)" class="helper">Немає елементів.</p>
  <dl v-else-if="value !== null && typeof value === 'object'" class="ai-fields">
    <div v-for="(item, key) in value" :key="key">
      <dt>{{ fieldLabel(String(key)) }}</dt>
      <dd><AiFields :value="item" :timezone="timezone" :field="String(key)" /></dd>
    </div>
  </dl>
  <span v-else class="ai-text">{{ displayValue(value, field ?? '', timezone) }}</span>
</template>
