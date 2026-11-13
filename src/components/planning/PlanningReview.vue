<script setup lang="ts">
import StudyProposal from './StudyProposal.vue'
import type {
  StudyPlan,
  ReplanningReview,
  ReplanningResult,
  PersistedPlan,
  ReschedulingResult,
} from '@/types/planning'
// These public review shapes contain no protected token. Tokens stay in the view's transient state.
defineProps<{
  review: StudyPlan | ReplanningReview | ReplanningResult | PersistedPlan | ReschedulingResult
  timezone: string
  replanning?: boolean
  explainReasons?: boolean
}>()
</script>
<template>
  <div class="planning-review">
    <StudyProposal :review="review" :timezone="timezone" :replanning="replanning" />
  </div>
</template>
