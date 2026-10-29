<script setup lang="ts">
import type { PublicObject } from '@/types/ai'
import AiFields from './AiFields.vue'
defineProps<{ preview: PublicObject; timezone: string }>()
</script>
<template>
  <section v-if="preview.parent" class="ai-review-section">
    <h3>Батьківське завдання</h3>
    <AiFields :value="preview.parent" :timezone="timezone" />
  </section>
  <div class="ai-compare">
    <section class="ai-review-section">
      <h3>До зміни</h3>
      <AiFields v-if="preview.before" :value="preview.before" :timezone="timezone" />
      <p v-else class="helper">Новий запис ще не створено.</p>
    </section>
    <section class="ai-review-section">
      <h3>Запропоновані значення</h3>
      <AiFields :value="preview.changes ?? null" :timezone="timezone" />
    </section>
  </div>
  <AiFields
    v-if="
      Object.keys(preview).some(
        (key) =>
          !['before', 'parent', 'changes', 'action', 'confirmation_required', 'effects'].includes(
            key,
          ),
      )
    "
    :value="
      Object.fromEntries(
        Object.entries(preview).filter(
          ([key]) =>
            !['before', 'parent', 'changes', 'action', 'confirmation_required', 'effects'].includes(
              key,
            ),
        ),
      )
    "
    :timezone="timezone"
  />
</template>
