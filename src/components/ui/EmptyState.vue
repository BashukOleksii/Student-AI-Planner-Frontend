<script setup lang="ts">
import AppIcon from './AppIcon.vue'
defineProps<{ title: string; description?: string; compact?: boolean }>()
</script>
<template>
  <div class="state empty" :class="{ compact }">
    <span v-if="!compact" class="empty-mark" aria-hidden="true"><AppIcon name="book" /></span>
    <h3>{{ title }}</h3>
    <p v-if="description" class="muted">{{ description }}</p>
    <slot />
  </div>
</template>
