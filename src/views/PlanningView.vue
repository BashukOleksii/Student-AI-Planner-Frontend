<script setup lang="ts">
import PlanningNav from '@/components/planning/PlanningNav.vue'
import AppCard from '@/components/ui/AppCard.vue'
</script>
<template>
  <header class="page-heading">
    <div>
      <p class="eyebrow">ВАШ ЧАС ДЛЯ НАВЧАННЯ</p>
      <h1>Мій план</h1>
      <p class="muted">Заплануйте роботу та відзначайте свій поступ.</p>
    </div>
  </header>
  <PlanningNav />
  <div class="actions">
    <RouterLink to="/planning/suggestions" class="button secondary">
      Переглянути пропозиції відновлення
    </RouterLink>
    <RouterLink to="/planning/sessions" class="button primary">Мої навчальні сесії</RouterLink>
  </div>
  <div class="form-grid">
    <AppCard title="1. Налаштуйте свій ритм">
      <p>
        Вкажіть обмеження й щотижневі інтервали. Порожні вподобання не створюють неявних лімітів.
      </p>
      <div class="actions">
        <RouterLink to="/planning/preferences" class="button secondary">Вподобання</RouterLink>
        <RouterLink to="/planning/availability" class="button secondary">Доступність</RouterLink>
      </div>
    </AppCard>
    <AppCard title="2. Перевірте час і створіть план">
      <p>Вільний інтервал не гарантує здійсненності плану. Остаточні обмеження перевіряє сервер.</p>
      <div class="actions">
        <RouterLink to="/planning/free-time" class="button secondary">Вільний час</RouterLink>
        <RouterLink to="/planning/workload" class="button secondary">
          Аналіз навантаження
        </RouterLink>
        <RouterLink to="/planning/preview" class="button primary">
          Переглянути новий план
        </RouterLink>
      </div>
    </AppCard>
    <AppCard title="3. Працюйте із сесіями">
      <p>Записуйте виконання, явно позначайте пропуски або переносіть майбутні сесії.</p>
      <RouterLink to="/planning/sessions" class="button secondary">Навчальні сесії</RouterLink>
    </AppCard>
    <AppCard title="4. Адаптуйте план">
      <p>Перевірте зміни, неперенесену тривалість і наслідки скасування перед підтвердженням.</p>
      <div class="actions">
        <RouterLink to="/planning/recovery" class="button secondary">Відновлення роботи</RouterLink>
        <RouterLink to="/planning/replanning" class="button secondary">
          Адаптивне перепланування
        </RouterLink>
        <RouterLink to="/ai" class="button secondary">Обговорити з AI</RouterLink>
      </div>
    </AppCard>
  </div>
</template>
