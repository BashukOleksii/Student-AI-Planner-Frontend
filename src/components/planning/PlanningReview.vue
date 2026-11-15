<script setup lang="ts">
import StudyProposal from './StudyProposal.vue'
import type {
  StudyPlan,
  ReplanningReview,
  ReplanningResult,
  PersistedPlan,
  ReschedulingResult,
} from '@/types/planning'

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
