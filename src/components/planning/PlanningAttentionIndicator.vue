<script setup lang="ts">
import { computed } from 'vue'
import { usePlanningAttentionStore } from '@/stores/planningAttention'
import AppIcon from '@/components/ui/AppIcon.vue'
const attention = usePlanningAttentionStore()
const labels = {
  decision_required: 'Укажіть результат минулих навчальних сесій',
  replan: 'Навчальний план потребує перепланування',
  warning: 'Перегляньте обмеження навчального плану',
  create_plan: 'Є робота, для якої можна створити план',
}
const label = computed(() => {
  if (attention.display === 'error') return 'Не вдалося перевірити актуальність плану'
  if (attention.display === 'checking')
    return attention.status?.check_state === 'not_checked'
      ? 'Актуальність плану ще не перевірено'
      : 'Перевіряємо план'
  if (attention.status?.review_refresh_required)
    return 'Попередня пропозиція застаріла. Оновіть огляд плану'
  return labels[attention.status?.most_important_kind ?? 'create_plan']
})
</script>
<template>
  <RouterLink
    v-if="attention.display !== 'clear'"
    :to="{
      path: '/planning/suggestions',
      query: attention.status?.review_refresh_required ? { status: 'all' } : undefined,
    }"
    class="icon-button planning-attention"
    :class="`planning-attention--${attention.display}`"
    :aria-label="label"
    :title="label"
    :aria-busy="attention.display === 'checking'"
  >
    <AppIcon
      :name="
        attention.display === 'checking'
          ? 'schedule'
          : attention.display === 'information'
            ? 'book'
            : 'help'
      "
    />
    <span
      v-if="attention.display === 'attention'"
      class="planning-attention-count"
      aria-hidden="true"
    >
      {{ attention.status?.attention_count }}
    </span>
    <span class="sr-only">{{ label }}</span>
  </RouterLink>
</template>
