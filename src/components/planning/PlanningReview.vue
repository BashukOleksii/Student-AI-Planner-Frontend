<script setup lang="ts">
import AiFields from '@/components/ai/AiFields.vue'
import type {
  StudyPlan,
  ReplanningReview,
  ReplanningResult,
  PersistedPlan,
  ReschedulingResult,
} from '@/types/planning'
import { reviewValue } from '@/utils/planning'
import { fieldLabel } from '@/utils/ai'
// These public review shapes contain no protected token. Tokens stay in the view's transient state.
defineProps<{
  review: StudyPlan | ReplanningReview | ReplanningResult | PersistedPlan | ReschedulingResult
  timezone: string
}>()
</script>
<template>
  <div class="planning-review">
    <section
      v-for="(value, key) in review"
      :key="key"
      class="ai-review-section"
      :class="{
        'ai-material-effect': ['warnings', 'summary', 'released_session_ids'].includes(String(key)),
      }"
    >
      <h3>{{ fieldLabel(String(key)) }}</h3>
      <AiFields :value="reviewValue(value)" :field="String(key)" :timezone="timezone" />
    </section>
  </div>
</template>
