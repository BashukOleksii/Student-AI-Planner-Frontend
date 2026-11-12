<script setup lang="ts">
defineProps<{ title: string; description?: string; compact?: boolean }>()
</script>
<template>
  <div class="state empty" :class="{ compact }">
    <span v-if="!compact" class="empty-mark" aria-hidden="true">✓</span>
    <h3>{{ title }}</h3>
    <p v-if="description" class="muted">{{ description }}</p>
    <slot />
  </div>
</template>
