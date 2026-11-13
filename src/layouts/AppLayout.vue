<script setup lang="ts">
import { ref, onScopeDispose } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { usePlanningAttentionStore } from '@/stores/planningAttention'
import PlanningAttentionIndicator from '@/components/planning/PlanningAttentionIndicator.vue'
import AppNavigation from '@/components/layout/AppNavigation.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppButton from '@/components/ui/AppButton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
const auth = useAuthStore()
const attention = usePlanningAttentionStore()
attention.start()
onScopeDispose(() => attention.stop())
const theme = useThemeStore()
const router = useRouter()
const route = useRoute()
const busy = ref(false)
const error = ref<unknown>(null)
async function logout() {
  busy.value = true
  error.value = null
  try {
    await auth.logout()
    await router.replace('/login')
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">До основного вмісту</a>
    <aside class="sidebar">
      <RouterLink to="/" class="brand">
        <span class="brand-symbol"><AppIcon name="book" /></span>
        <span>
          Student AI
          <span class="brand-subtitle">PLANNER</span>
        </span>
      </RouterLink>
      <p class="nav-caption">Навчання під вашим контролем</p>
      <AppNavigation />
      <div class="sidebar-footer">
        <RouterLink to="/profile" class="user-chip">
          <span class="avatar">{{ auth.user?.name.slice(0, 1).toLocaleUpperCase('uk-UA') }}</span>
          <div>
            <strong>{{ auth.user?.name }}</strong>
            <small>Особистий простір</small>
          </div>
        </RouterLink>
        <AppButton :busy="busy" @click="logout">Вийти з облікового запису</AppButton>
        <ErrorState v-if="error" :error="error" />
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <RouterLink to="/" class="mobile-brand">
          <AppIcon name="book" />
          Student AI Planner
        </RouterLink>
        <span class="desktop-label">
          <span class="header-location">Мій простір /</span>
          {{ route.meta.title ?? 'Ваш навчальний простір' }}
        </span>
        <div class="inline header-tools">
          <RouterLink to="/tasks/new" class="button secondary header-create">
            <AppIcon name="plus" />
            Створити завдання
          </RouterLink>
          <PlanningAttentionIndicator />
          <RouterLink to="/inbox" class="icon-button" aria-label="Вхідні сповіщення">
            <AppIcon name="bell" />
          </RouterLink>
          <RouterLink to="/profile" class="avatar" aria-label="Відкрити профіль">
            {{ auth.user?.name.slice(0, 1).toLocaleUpperCase('uk-UA') }}
          </RouterLink>
          <button
            class="icon-button"
            :aria-label="theme.theme === 'light' ? 'Увімкнути темну тему' : 'Увімкнути світлу тему'"
            @click="theme.toggle"
          >
            <AppIcon :name="theme.theme === 'light' ? 'moon' : 'sun'" />
          </button>
        </div>
      </header>
      <main id="main-content" class="main-content" tabindex="-1"><slot /></main>
      <div class="mobile-nav"><AppNavigation mobile /></div>
    </div>
  </div>
</template>
