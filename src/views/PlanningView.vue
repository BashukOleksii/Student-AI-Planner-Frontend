<script setup lang="ts">
import PlanningNav from '@/components/planning/PlanningNav.vue'
import AppCard from '@/components/ui/AppCard.vue'
</script>
<template>
  <header class="page-heading">
    <div>
      <p class="eyebrow">ВАШ ЧАС ДЛЯ НАВЧАННЯ</p>
      <h1>Планування навчання</h1>
      <p class="muted">Від доступності до підтвердженого плану та обліку виконання.</p>
    </div>
  </header>
  <PlanningNav />
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
        <RouterLink to="/planning/replanning" class="button secondary">
          Адаптивне перепланування
        </RouterLink>
        <RouterLink to="/ai" class="button secondary">Обговорити з AI</RouterLink>
      </div>
    </AppCard>
  </div>
</template>
