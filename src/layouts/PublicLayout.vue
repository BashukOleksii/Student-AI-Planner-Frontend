<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'
import AppIcon from '@/components/ui/AppIcon.vue'
const theme = useThemeStore()
</script>
<template>
  <main class="auth-layout">
    <aside class="auth-story">
      <div class="brand">
        <span class="brand-symbol"><AppIcon name="book" /></span>
        <span>
          Student AI
          <span class="brand-subtitle">PLANNER</span>
        </span>
      </div>
      <div class="auth-story-body">
        <span class="eyebrow">МЕНШЕ ХАОСУ. БІЛЬШЕ ФОКУСУ.</span>
        <h1>
          Навчання,
          <br />
          що має свій ритм.
        </h1>
        <p>Зберіть розклад, завдання та дедлайни в одному спокійному просторі.</p>
        <div class="story-lines" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <small>Ваш особистий навчальний простір</small>
    </aside>
    <section class="auth-form-side">
      <button class="icon-button auth-theme" aria-label="Змінити тему" @click="theme.toggle">
        <AppIcon name="sun" />
      </button>
      <div class="auth-form">
        <div class="mobile-brand">
          <AppIcon name="book" />
          Student AI Planner
        </div>
        <slot />
      </div>
    </section>
  </main>
</template>
