<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
const route = useRoute()
const helpUrl = `${import.meta.env.BASE_URL}help/`
function inSection(to: string) {
  return route.path === to || (to !== '/' && route.path.startsWith(`${to}/`))
}
const items = [
  { to: '/', label: 'Огляд', icon: 'dashboard' },
  { to: '/schedule', label: 'Розклад', icon: 'schedule' },
  { to: '/tasks', label: 'Завдання', icon: 'tasks' },
  { to: '/planning', label: 'Планування', icon: 'schedule' },
  { to: '/ai', label: 'AI-помічник', icon: 'chat' },
  { to: '/reminders', label: 'Нагадування', icon: 'bell' },
  { to: '/inbox', label: 'Вхідні', icon: 'inbox' },
  { to: '/statistics', label: 'Статистика', icon: 'chart' },
  { to: '/academic', label: 'Навчання', icon: 'book' },
  { to: '/profile', label: 'Налаштування', icon: 'profile' },
]
</script>
<template>
  <nav class="app-navigation" aria-label="Основна навігація">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      :class="{ active: inSection(item.to) }"
      :aria-current="inSection(item.to) ? 'page' : undefined"
      :exact-active-class="item.to === '/' ? 'active' : ''"
      :active-class="item.to !== '/' ? 'active' : ''"
    >
      <AppIcon :name="item.icon" />
      <span>{{ item.label }}</span>
    </RouterLink>
    <a :href="helpUrl" target="_blank" rel="noopener noreferrer">
      <AppIcon name="book" />
      <span>
        Допомога
        <span class="sr-only">(у новій вкладці)</span>
      </span>
    </a>
  </nav>
</template>
