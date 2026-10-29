<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template>
  <div class="state empty">
    <span class="empty-mark" aria-hidden="true">✓</span>
    <h3>{{ title }}</h3>
    <p v-if="description" class="muted">{{ description }}</p>
    <slot />
  </div>
</template>
