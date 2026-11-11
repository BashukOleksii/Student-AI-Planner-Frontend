<script setup lang="ts">
import { computed } from 'vue'
import type { ImportCatalog, ImportCatalogItem } from '@/types/semesterSchedule'
import AppCard from '@/components/ui/AppCard.vue'
const props = defineProps<{ catalog: ImportCatalog<ImportCatalogItem> }>()
const sections = computed(() => [
  {
    label: 'Наявні предмети, що використовуються повторно',
    items: props.catalog.subjects.filter((item) => item.resolution === 'reuse'),
  },
  {
    label: 'Нові предмети, що будуть створені',
    items: props.catalog.subjects.filter((item) => item.resolution === 'create'),
  },
  {
    label: 'Наявні викладачі, що використовуються повторно',
    items: props.catalog.teachers.filter((item) => item.resolution === 'reuse'),
  },
  {
    label: 'Нові викладачі, що будуть створені',
    items: props.catalog.teachers.filter((item) => item.resolution === 'create'),
  },
  {
    label: 'Записи, що потребують виправлення',
    items: [...props.catalog.subjects, ...props.catalog.teachers].filter(
      (item) => item.resolution === 'invalid',
    ),
  },
])
</script>
<template>
  <AppCard title="Предмети та викладачі імпорту">
    <p class="helper">
      Нові коректні записи буде створено автоматично після підтвердження всього імпорту.
    </p>
    <section v-for="section in sections" :key="section.label">
      <h3>{{ section.label }} · {{ section.items.length }}</h3>
      <ul v-if="section.items.length">
        <li v-for="(item, index) in section.items" :key="index">
          {{ item.name }}
          <template v-if="item.id !== null">· №{{ item.id }}</template>
          <ul v-if="item.errors.length" class="field-error">
            <li v-for="(message, errorIndex) in item.errors" :key="errorIndex">{{ message }}</li>
          </ul>
        </li>
      </ul>
      <p v-else class="helper">Немає.</p>
    </section>
  </AppCard>
</template>
