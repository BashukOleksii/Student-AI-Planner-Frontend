<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template>
  <fieldset class="content-form-section">
    <legend>
      <span class="form-section-mark" aria-hidden="true"></span>
      {{ title }}
    </legend>
    <p v-if="description" class="helper">{{ description }}</p>
    <div class="content-form-fields"><slot /></div>
  </fieldset>
</template>
