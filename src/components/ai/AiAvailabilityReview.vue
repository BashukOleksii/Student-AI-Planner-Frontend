<script setup lang="ts">
import { computed } from 'vue'
import type { AvailabilityPreview, AvailabilityReceipt, AvailabilitySnapshot } from '@/types/ai'
import { weekdays } from '@/utils/planning'
const props = defineProps<{
  preview?: AvailabilityPreview
  receipt?: AvailabilityReceipt
  historical?: boolean
}>()
const fields = [
  { key: 'day_of_week', label: 'День тижня' },
  { key: 'starts_at', label: 'Початок' },
  { key: 'ends_at', label: 'Завершення' },
] as const
const material = computed(() => props.receipt ?? props.preview)
const columns = computed(() =>
  props.receipt
    ? [
        {
          label: props.receipt.deleted_window ? 'Видалений інтервал' : 'Збережений інтервал',
          snapshot: props.receipt.window ?? props.receipt.deleted_window,
          after: false,
        },
      ]
    : [
        { label: 'До зміни', snapshot: props.preview?.before, after: false },
        { label: 'Після підтвердження', snapshot: props.preview?.after, after: true },
      ],
)
function changed(key: keyof AvailabilitySnapshot) {
  return (
    !!props.preview?.before &&
    !!props.preview.after &&
    props.preview.before[key] !== props.preview.after[key]
  )
}
function value(snapshot: AvailabilitySnapshot, key: keyof AvailabilitySnapshot) {
  if (key === 'id')
    return snapshot.id === null ? 'ID буде призначено після збереження' : `№${snapshot.id}`
  if (key === 'day_of_week') return weekdays[snapshot.day_of_week - 1]
  return snapshot[key]
}
</script>
<template>
  <section
    v-if="material"
    class="ai-availability-review"
    :aria-label="receipt ? 'Результат зміни доступності' : 'Огляд змін доступності'"
  >
    <details class="tool-metadata">
      <summary>Дані операції</summary>
      <p class="helper">
        Тип дії:
        <code>{{ material.type }}</code>
      </p>
    </details>
    <p class="helper">
      Збережений часовий пояс: {{ material.timezone }}. Це щотижневий місцевий час, а не
      UTC-моменти.
    </p>
    <p v-if="preview && historical" class="helper">
      Історичний огляд пропозиції. Фактичний результат визначає стан дії та квитанція виконання
      нижче.
    </p>
    <p v-else-if="preview" class="ai-review-notice">
      Огляд потребує явного підтвердження. Нижче наведено запропоновані стани; цей огляд не є
      квитанцією виконання.
    </p>
    <p v-if="receipt" class="helper">
      ID виконаної дії: {{ receipt.action_id }}. Значення збережено в історичній квитанції.
    </p>
    <div class="ai-compare">
      <section v-for="column in columns" :key="column.label" class="ai-review-section">
        <h3>{{ column.label }}</h3>
        <p v-if="!column.snapshot" class="helper">
          {{
            column.after
              ? 'Інтервал буде видалено; нового стану запису не буде.'
              : 'Новий запис ще не створено.'
          }}
        </p>
        <dl v-else class="ai-fields">
          <div
            v-for="field in fields"
            :key="field.key"
            :class="{ 'ai-field-changed': column.after && changed(field.key) }"
          >
            <dt>
              {{ field.label }}
              <strong v-if="column.after && preview?.before && preview.after">
                · {{ changed(field.key) ? 'Змінено' : 'Без змін' }}
              </strong>
            </dt>
            <dd>{{ value(column.snapshot, field.key) }}</dd>
          </div>
        </dl>
      </section>
    </div>
    <details class="tool-metadata">
      <summary>Ідентифікатори інтервалів</summary>
      <p v-for="column in columns" :key="column.label">
        {{ column.label }}:
        {{ column.snapshot?.id ? `№${column.snapshot.id}` : 'Буде призначено після збереження' }}
      </p>
    </details>
    <section class="ai-material-effect ai-review-section">
      <h3>Наслідки, визначені сервером</h3>
      <p v-if="material.effects.removes_availability_window">
        {{ receipt ? 'Видалено' : 'Буде видалено' }} лише один запис конфігурації щотижневої
        доступності №{{ (receipt?.deleted_window ?? preview?.before)?.id }}.
      </p>
      <p v-else>Змінюється конфігурація щотижневої доступності для наступних планувань.</p>
      <p>
        Завдання, заняття й навчальні сесії не видаляються. Нагадування та числові вподобання
        планування не змінюються.
      </p>
      <p>
        Наявні навчальні сесії автоматично не переплановуються. Перепланування — окремий процес з
        власним оглядом і підтвердженням.
      </p>
    </section>
  </section>
</template>
