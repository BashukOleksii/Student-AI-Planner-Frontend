<script setup lang="ts">
import { computed } from 'vue'

const model = defineModel<string>({ required: true })
// Keep persisted IANA identifiers verbatim, including aliases absent from Intl's list.
const supported =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
const zones = computed(() =>
  [...new Set(['Europe/Kyiv', 'UTC', model.value, ...supported])].filter(Boolean),
)
</script>

<template>
  <select v-model="model" required>
    <option v-for="zone in zones" :key="zone" :value="zone">
      {{ zone === 'Europe/Kyiv' ? 'Україна — Київ' : zone }}
    </option>
  </select>
</template>
