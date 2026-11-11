<script setup lang="ts">
import type { AiAction } from '@/types/ai'
import RecoveryEvidence from '@/components/planning/RecoveryEvidence.vue'
defineProps<{ action: AiAction }>()
</script>
<template>
  <section class="ai-review-section">
    <h3>
      {{
        action.type.includes('_occurrence_')
          ? 'Одне заняття на окрему дату'
          : action.type.includes('_rule_')
            ? 'Щотижневе правило'
            : action.type.endsWith('settings_update')
              ? 'Налаштування семестру'
              : 'Увесь день'
      }}
    </h3>
    <p v-if="action.type.includes('_occurrence_')">
      Огляд показує повний збережений день, включно з іншими заняттями.
    </p>
    <p
      v-if="
        action.preview.effects &&
        typeof action.preview.effects === 'object' &&
        !Array.isArray(action.preview.effects) &&
        action.preview.effects.restores_base_date
      "
    >
      Виняток буде видалено. На дату повернуться заняття базового розкладу.
    </p>
    <h3>До зміни</h3>
    <RecoveryEvidence
      :value="action.preview.before ?? null"
      :timezone="String(action.preview.timezone)"
    />
    <h3>Після підтвердження</h3>
    <RecoveryEvidence
      :value="action.preview.after ?? null"
      :timezone="String(action.preview.timezone)"
    />
    <h3>Повні наслідки</h3>
    <RecoveryEvidence :value="action.preview.effects ?? null" />
  </section>
</template>
