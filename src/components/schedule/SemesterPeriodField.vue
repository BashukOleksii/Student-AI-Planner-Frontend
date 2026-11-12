<script setup lang="ts">
import { watch } from 'vue'
import { useAcademicContext } from '@/composables/useAcademicContext'
import type { AcademicPeriod, EducationInstitution } from '@/types/api'
const props = defineProps<{
  periods: AcademicPeriod[]
  institutions: EducationInstitution[]
  errors?: string[]
  exclude?: number[]
}>()
const selected = defineModel<number | null>({ required: true })
const context = useAcademicContext(
  () => props.periods,
  () => props.institutions,
)
watch(
  () => [context.period.value?.id, props.exclude] as const,
  () => {
    const id = context.period.value?.id
    selected.value = id && !props.exclude?.includes(id) ? id : null
  },
  { immediate: true, deep: true },
)
</script>
<template>
  <div class="stack">
    <div v-if="context.issue.value" class="schedule-warning" role="alert">
      {{ context.issue.value }}
    </div>
    <div v-else-if="context.period.value">
      <p>
        <strong>{{ context.period.value.name }}</strong>
        · {{ context.institution.value?.name }}
      </p>
      <p class="helper">
        {{ context.period.value.starts_on }} — {{ context.period.value.ends_on }}
      </p>
      <p v-if="exclude?.includes(context.period.value.id)" class="schedule-warning">
        Для актуального періоду вже є семестровий розклад. Відкрийте його через календар.
      </p>
    </div>
    <p v-for="message in errors" :key="message" class="field-error" role="alert">{{ message }}</p>
    <RouterLink to="/academic/periods" class="text-link">Налаштувати навчальний період</RouterLink>
    <RouterLink v-if="!context.institution.value" to="/academic/institutions" class="text-link">
      Налаштувати навчальний заклад
    </RouterLink>
  </div>
</template>
