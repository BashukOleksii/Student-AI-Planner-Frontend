<script setup lang="ts">
defineProps<{ id: string; label: string; errors?: string[]; hint?: string }>()
</script>
<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <slot
      :id="id"
      :invalid="!!errors?.length"
      :describedby="errors?.length ? `${id}-error` : hint ? `${id}-hint` : undefined"
    />
    <p v-if="hint" :id="`${id}-hint`" class="helper">{{ hint }}</p>
    <p
      v-for="(error, index) in errors"
      :id="index === 0 ? `${id}-error` : undefined"
      :key="index"
      class="field-error"
    >
      {{ error }}
    </p>
  </div>
</template>
