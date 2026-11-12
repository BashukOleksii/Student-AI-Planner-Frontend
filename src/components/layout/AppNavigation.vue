<script setup lang="ts">
import { useNavigationDisclosure } from '@/composables/useNavigationDisclosure'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
defineProps<{ mobile?: boolean }>()
const route = useRoute()
const { disclosure: more, close: closeMore } = useNavigationDisclosure()
const helpUrl = `${import.meta.env.BASE_URL}help/`
const items = [
  { to: '/', label: 'Мій день', icon: 'dashboard' },
  { to: '/schedule', label: 'Розклад', icon: 'schedule' },
  { to: '/tasks', label: 'Завдання', icon: 'tasks' },
  { to: '/planning', label: 'Мій план', icon: 'schedule' },
  { to: '/ai', label: 'AI-помічник', icon: 'chat' },
  { to: '/statistics', label: 'Прогрес', icon: 'chart' },
]
const secondary = [
  { to: '/reminders', label: 'Нагадування', icon: 'bell' },
  { to: '/inbox', label: 'Вхідні', icon: 'inbox' },
  { to: '/academic', label: 'Моє навчання', icon: 'book' },
  { to: '/profile', label: 'Налаштування', icon: 'profile' },
]
const mobileItems = items.filter((item) => !['/statistics', '/planning'].includes(item.to))
const mobileMore = [
  ...items.filter((item) => ['/planning', '/statistics'].includes(item.to)),
  ...secondary,
]
function inSection(to: string) {
  return route.path === to || (to !== '/' && route.path.startsWith(`${to}/`))
}
</script>
<template>
  <nav class="app-navigation" :aria-label="mobile ? 'Мобільна навігація' : 'Основна навігація'">
    <RouterLink
      v-for="item in mobile ? mobileItems : items"
      :key="item.to"
      :to="item.to"
      :class="{ active: inSection(item.to) }"
      :aria-current="inSection(item.to) ? 'page' : undefined"
      active-class=""
      exact-active-class=""
    >
      <AppIcon :name="item.icon" />
      <span>{{ item.label }}</span>
    </RouterLink>
    <template v-if="!mobile">
      <p class="nav-group-label">Особистий простір</p>
      <RouterLink
        v-for="item in secondary"
        :key="item.to"
        :to="item.to"
        :class="{ active: inSection(item.to) }"
        :aria-current="inSection(item.to) ? 'page' : undefined"
      >
        <AppIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </RouterLink>
      <a :href="helpUrl" target="_blank" rel="noopener noreferrer">
        <AppIcon name="help" />
        <span>
          Допомога
          <span class="sr-only">(у новій вкладці)</span>
        </span>
      </a>
    </template>
    <details v-else ref="more" class="navigation-more" @keydown.esc.stop.prevent="closeMore(true)">
      <summary :class="{ active: mobileMore.some((item) => inSection(item.to)) }">
        <AppIcon name="more" />
        <span>Ще</span>
      </summary>
      <div class="secondary-navigation">
        <p class="nav-group-label">Ваш навчальний простір</p>
        <RouterLink
          v-for="item in mobileMore"
          :key="item.to"
          :to="item.to"
          :class="{ active: inSection(item.to) }"
          :aria-current="inSection(item.to) ? 'page' : undefined"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
        <a :href="helpUrl" target="_blank" rel="noopener noreferrer">
          <AppIcon name="help" />
          <span>
            Допомога
            <span class="sr-only">(у новій вкладці)</span>
          </span>
        </a>
      </div>
    </details>
  </nav>
</template>
