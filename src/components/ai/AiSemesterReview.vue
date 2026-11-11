<script setup lang="ts">
import { computed } from 'vue'
import type { AiAction } from '@/types/ai'
import { isPublicObject } from '@/utils/ai'
import RecoveryEvidence from '@/components/planning/RecoveryEvidence.vue'
import DetailSection from '@/components/ui/DetailSection.vue'
import SemesterSnapshot from './SemesterSnapshot.vue'
const props = defineProps<{ action: AiAction }>()
const effects = computed(() =>
  isPublicObject(props.action.preview.effects) ? props.action.preview.effects : {},
)
const timezone = computed(() =>
  typeof props.action.preview.timezone === 'string' ? props.action.preview.timezone : 'UTC',
)
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
      Буде збережено окремий розклад на цю дату. Інші заняття цього дня показано нижче.
    </p>
    <p v-if="effects.restores_base_date" class="report-warning">
      Виняток буде видалено: на дату повернуться заняття базового розкладу.
    </p>
    <p v-if="effects.preserves_frozen_dates">
      Раніше збережені зміни на окремі дати залишаться без змін.
    </p>
    <p v-if="effects.may_suppress_imported_slot" class="report-warning">
      Змінений або видалений слот може бути захищено від повторного додавання під час імпорту.
    </p>
    <p>Самостійні навчальні сесії не переносяться. Окремі датовані заняття не змінюються.</p>
    <div class="review-comparison">
      <section>
        <h3>До зміни</h3>
        <SemesterSnapshot :value="action.preview.before ?? null" :timezone="timezone" />
      </section>
      <section>
        <h3>Після підтвердження</h3>
        <SemesterSnapshot :value="action.preview.after ?? null" :timezone="timezone" />
      </section>
    </div>
    <DetailSection title="Повний огляд і наслідки">
      <RecoveryEvidence :value="action.preview" :timezone="timezone" />
    </DetailSection>
  </section>
</template>
