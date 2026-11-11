<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
const route = useRoute()
const more = ref<HTMLDetailsElement>()
watch(
  () => route.fullPath,
  () => {
    if (more.value) more.value.open = false
  },
)
function closeMore() {
  if (more.value) {
    more.value.open = false
    more.value.querySelector('summary')?.focus()
  }
}
const helpUrl = `${import.meta.env.BASE_URL}help/`
function inSection(to: string) {
  return route.path === to || (to !== '/' && route.path.startsWith(`${to}/`))
}
const items = [
  { to: '/', label: 'Огляд', icon: 'dashboard' },
  { to: '/schedule', label: 'Розклад', icon: 'schedule' },
  { to: '/tasks', label: 'Завдання', icon: 'tasks' },
  { to: '/planning', label: 'Мій план', icon: 'schedule' },
  { to: '/ai', label: 'AI-помічник', icon: 'chat' },
  { to: '/statistics', label: 'Прогрес', icon: 'chart' },
]
const secondary = [
  { to: '/reminders', label: 'Нагадування', icon: 'bell' },
  { to: '/inbox', label: 'Вхідні', icon: 'inbox' },

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
    <details ref="more" class="navigation-more" @keydown.esc.stop.prevent="closeMore">
      <summary>Ще</summary>
      <div class="secondary-navigation">
        <RouterLink
          v-for="item in secondary"
          :key="item.to"
          :to="item.to"
          :aria-current="inSection(item.to) ? 'page' : undefined"
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
      </div>
    </details>
  </nav>
</template>
