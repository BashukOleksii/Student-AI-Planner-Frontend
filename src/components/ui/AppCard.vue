<script setup lang="ts">
defineProps<{ title?: string }>()
</script>
<template>
  <section class="card">
    <div v-if="title || $slots.action" class="section-heading">
      <h2 v-if="title">{{ title }}</h2>
      <slot name="action" />
    </div>
    <slot />
  </section>
</template>
