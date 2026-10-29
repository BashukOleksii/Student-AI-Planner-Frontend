<script setup lang="ts">
import type { PublicObject } from '@/types/ai'
import { fieldLabel, isPublicObject } from '@/utils/ai'
import AiFields from './AiFields.vue'
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
  <template v-if="isPublicObject(preview.review)">
    <section
      v-for="(value, key) in preview.review"
      :key="key"
      class="ai-review-section"
      :class="{
        'ai-material-effect': ['released_session_ids', 'warnings', 'summary'].includes(String(key)),
      }"
    >
      <h3>{{ fieldLabel(String(key)) }}</h3>
      <AiFields :value="value" :field="String(key)" :timezone="timezone" />
    </section>
  </template>
  <AiFields v-else :value="preview.review ?? null" :timezone="timezone" />
  <AiFields
    v-if="
      Object.keys(preview).some(
        (key) =>
          !['review', 'action', 'confirmation_required', 'effects', 'required_consent'].includes(
            key,
          ),
      )
    "
    :value="
      Object.fromEntries(
        Object.entries(preview).filter(
          ([key]) =>
            !['review', 'action', 'confirmation_required', 'effects', 'required_consent'].includes(
              key,
            ),
        ),
      )
    "
    :timezone="timezone"
  />
</template>
