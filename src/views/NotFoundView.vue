<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
function back() {
  if (window.history.state?.back) router.back()
  else void router.push('/')
}
</script>
<template>
  <section class="empty-state">
    <p class="eyebrow">404</p>
    <h1>Сторінку не знайдено</h1>
    <p>Перевірте адресу або поверніться до своїх навчальних справ.</p>
    <div class="actions">
      <button class="button secondary" @click="back">Повернутися назад</button>
      <RouterLink to="/" class="button primary">На головну</RouterLink>
    </div>
    <div class="actions">
      <RouterLink to="/schedule">Розклад</RouterLink>
      <RouterLink to="/tasks">Завдання</RouterLink>
    </div>
  </section>
</template>
