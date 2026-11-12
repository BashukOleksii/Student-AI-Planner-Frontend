<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template>
  <fieldset class="content-form-section">
    <legend>{{ title }}</legend>
    <p v-if="description" class="helper">{{ description }}</p>
    <div class="content-form-fields"><slot /></div>
  </fieldset>
</template>
