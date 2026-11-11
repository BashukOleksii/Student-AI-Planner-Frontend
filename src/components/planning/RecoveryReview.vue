<script setup lang="ts">
import { computed } from 'vue'
import type { PublicObject, PublicValue } from '@/types/ai'
import RecoveryEvidence from './RecoveryEvidence.vue'
import DetailSection from '@/components/ui/DetailSection.vue'
import { isPublicObject } from '@/utils/ai'
const props = defineProps<{ review: PublicObject; kind: string; timezone: string }>()
const explanations: Record<string, string> = {
  create_plan: 'Є невиконана робота, для якої можна виділити час. Перевірте запропоновані сесії.',
  replan:
    'Частина навчальних сесій потребує перенесення. Перевірте початкові сесії, заміни й роботу без нового місця.',
  decision_required:
    'Система не знає результату розпочатих сесій. Спочатку вкажіть, що вдалося виконати.',
  warning:
    'Для безпечного планування бракує даних або доступного часу. Перевірте попередження та оцінки тривалості.',
}
const plan = computed(() => {
  const value =
    props.kind === 'replan' ? props.review.adaptive_replanning : props.review.new_work_plan
  return isPublicObject(value) ? value : null
})
const advice = computed(() =>
  isPublicObject(props.review.workload_advice) ? props.review.workload_advice : null,
)
const sections = computed(() =>
  [
    { title: 'Потрібне ваше рішення', value: props.review.unknown_session_decisions },
    { title: 'Запропоновані навчальні сесії', value: plan.value?.sessions },
    { title: 'Зміни до наявних сесій', value: plan.value?.session_results },
    { title: 'Підсумок розміщення роботи', value: plan.value?.summary },
    { title: 'Нерозміщена робота та причини', value: plan.value?.work_results },
    { title: 'Попередження', value: plan.value?.warnings },
    { title: 'Робота, яку неможливо розмістити', value: plan.value?.excluded_items },
    { title: 'Чому потрібна увага', value: advice.value?.alerts },
    { title: 'Перевищення навантаження', value: advice.value?.persisted_workload_violations },
    { title: 'Потрібна оцінка тривалості', value: props.review.unknown_duration_work },
  ].filter(
    (item): item is { title: string; value: PublicValue } =>
      item.value !== undefined &&
      item.value !== null &&
      (!Array.isArray(item.value) || item.value.length > 0),
  ),
)
</script>
<template>
  <p class="review-introduction">{{ explanations[kind] ?? 'Перевірте зміни перед рішенням.' }}</p>
  <section v-for="section in sections" :key="section.title" class="review-block">
    <h3>{{ section.title }}</h3>
    <RecoveryEvidence :value="section.value" :timezone="timezone" />
  </section>
  <section class="review-block">
    <h3>Що залишиться без змін</h3>
    <p>
      Виконана робота й історія зберігаються. Заняття університету не переносяться. Сесії, позначені
      в огляді як збережені, залишаться на своєму місці.
    </p>
  </section>
  <p v-if="kind === 'replan'" class="report-warning">
    Скасування сесій без нового місця також скасовує їхні заплановані нагадування. Перевірте кожну
    сесію в огляді та надайте окремий дозвіл нижче.
  </p>
  <DetailSection title="Повний огляд і вихідні дані">
    <RecoveryEvidence :value="review" :timezone="timezone" />
  </DetailSection>
</template>
