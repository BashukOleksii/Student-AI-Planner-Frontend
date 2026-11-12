<script setup lang="ts">
defineProps<{ missing: boolean }>()
</script>
<template>
  <aside v-if="missing" class="planning-warning" aria-label="Доступність для планування">
    <strong>Для автоматичного планування ще не визначено доступний час</strong>
    <p>
      Виберіть години для самостійного навчання. Заняття за розкладом будуть враховані автоматично.
    </p>
    <RouterLink to="/planning/availability" class="text-link">Налаштувати доступність</RouterLink>
  </aside>
</template>
