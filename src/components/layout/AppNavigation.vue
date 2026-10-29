<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue'
const items = [
  { to: '/', label: 'Огляд', icon: 'dashboard' },
  { to: '/schedule', label: 'Розклад', icon: 'schedule' },
  { to: '/tasks', label: 'Завдання', icon: 'tasks' },
  { to: '/profile', label: 'Налаштування', icon: 'profile' },
]
</script>
<template>
  <nav class="app-navigation" aria-label="Основна навігація">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      :exact-active-class="item.to === '/' ? 'active' : ''"
      :active-class="item.to !== '/' ? 'active' : ''"
    >
      <AppIcon :name="item.icon" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>
