<script setup lang="ts">
import type { PublicObject } from '@/types/ai'
import { isPublicObject } from '@/utils/ai'
import StudyProposal from '@/components/planning/StudyProposal.vue'
defineProps<{ preview: PublicObject; type: string; timezone: string }>()
</script>
<template>
  <p v-if="type === 'propose_session_reschedule'" class="ai-review-notice">
    Це попередня перевірка тривалості й стану. Здійсненність інтервалу ще не гарантована: сервер
    перевірить обмеження під час підтвердження. Початкову сесію буде замінено, її заплановані
    нагадування — скасовано без копіювання.
  </p>
  <p v-else-if="type === 'propose_adaptive_replanning'" class="ai-review-notice">
    Перевірте кожну початкову сесію, заміну та неперенесену тривалість. Для джерел без нового місця
    підтвердження може означати скасування. Заплановані нагадування джерел не копіюються.
  </p>
  <StudyProposal
    v-if="isPublicObject(preview.review)"
    :review="preview.review"
    :timezone="timezone"
  />
</template>
