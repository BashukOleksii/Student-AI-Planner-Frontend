<script setup lang="ts">
import { computed } from 'vue'
import { isPublicObject } from '@/utils/ai'
import type { PublicObject } from '@/types/ai'
import WorkSnapshot from './WorkSnapshot.vue'
const props = defineProps<{ preview: PublicObject; timezone: string }>()
const after = computed(() =>
  isPublicObject(props.preview.changes)
    ? {
        ...(isPublicObject(props.preview.before) ? props.preview.before : {}),
        ...props.preview.changes,
      }
    : null,
)
</script>
<template>
  <section v-if="preview.parent" class="ai-review-section">
    <h3>Батьківське завдання</h3>
    <WorkSnapshot :value="preview.parent" :timezone="timezone" />
  </section>
  <div class="ai-compare">
    <section class="ai-review-section">
      <h3>До зміни</h3>
      <WorkSnapshot v-if="preview.before" :value="preview.before" :timezone="timezone" />
      <p v-else class="helper">Новий запис ще не створено.</p>
    </section>
    <section class="ai-review-section">
      <h3>Після підтвердження</h3>
      <WorkSnapshot :value="after" :timezone="timezone" />
    </section>
  </div>
</template>
