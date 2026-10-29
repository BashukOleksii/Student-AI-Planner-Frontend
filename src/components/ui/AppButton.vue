<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'danger'
    busy?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { variant: 'secondary', type: 'button' },
)
</script>
<template>
  <button
    :type="type"
    class="button"
    :class="variant"
    :disabled="busy || disabled"
    :aria-busy="busy || undefined"
  >
    <span v-if="busy" class="spinner" aria-hidden="true"></span>
    <slot />
  </button>
</template>
