<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ title: string; attention?: boolean; initiallyOpen?: boolean }>()
const expanded = ref(!!props.initiallyOpen || !!props.attention)
watch(
  () => props.attention,
  (value) => {
    if (value) expanded.value = true
  },
)
</script>
<template>
  <details
    class="detail-section"
    :open="expanded"
    @toggle="expanded = ($event.target as HTMLDetailsElement).open"
  >
    <summary>
      {{ title }}
      <span v-if="attention" class="field-error">· Потребує уваги</span>
    </summary>
    <div class="detail-content"><slot /></div>
  </details>
</template>
