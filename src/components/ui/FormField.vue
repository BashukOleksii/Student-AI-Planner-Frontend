<script setup lang="ts">
defineProps<{ id: string; label: string; errors?: string[]; hint?: string }>()
</script>
<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <slot
      :id="id"
      :invalid="!!errors?.length"
      :describedby="
        [hint ? `${id}-hint` : '', ...(errors ?? []).map((_, index) => `${id}-error-${index}`)]
          .filter(Boolean)
          .join(' ') || undefined
      "
    />
    <p v-if="hint" :id="`${id}-hint`" class="helper">{{ hint }}</p>
    <p
      v-for="(error, index) in errors"
      :id="`${id}-error-${index}`"
      :key="index"
      class="field-error"
    >
      {{ error }}
    </p>
  </div>
</template>
