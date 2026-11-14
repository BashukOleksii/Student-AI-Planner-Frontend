<script setup lang="ts">
defineProps<{ id: string; label: string; errors?: string[]; hint?: string; hideLabel?: boolean }>()
</script>
<template>
  <div class="field">
    <label :for="id" :class="{ 'visually-hidden': hideLabel }">{{ label }}</label>
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

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
