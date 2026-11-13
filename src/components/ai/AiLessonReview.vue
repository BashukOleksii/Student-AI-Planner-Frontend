<script setup lang="ts">
import { computed } from 'vue'
import type { LessonPreview, LessonSnapshot } from '@/types/ai'
import { samePublicValue } from '@/utils/aiLesson'
import { lessonTypes, lessonStatuses } from '@/utils/lessons'
import { exactDateTime } from '@/utils/planning'
const props = defineProps<{ preview: LessonPreview; timezone: string }>()
const fields = [
  { key: 'subject', label: 'Предмет' },
  { key: 'teacher', label: 'Викладач' },
  { key: 'academic_period', label: 'Навчальний період' },
  { key: 'type', label: 'Тип заняття' },
  { key: 'room', label: 'Аудиторія' },
  { key: 'starts_at', label: 'Початок' },
  { key: 'ends_at', label: 'Завершення' },
  { key: 'status', label: 'Стан' },
] as const
const columns = computed(() => [
  {
    label: props.preview.type === 'propose_lesson_replacement' ? 'Початкове заняття' : 'До зміни',
    snapshot: props.preview.before,
    after: false,
  },
  {
    label:
      props.preview.type === 'propose_lesson_replacement'
        ? 'Запропонована заміна'
        : 'Після підтвердження',
    snapshot: props.preview.after,
    after: true,
  },
])
function changed(key: keyof LessonSnapshot) {
  return (
    !!props.preview.before && !samePublicValue(props.preview.before[key], props.preview.after[key])
  )
}
function value(snapshot: LessonSnapshot, key: (typeof fields)[number]['key']) {
  const value = snapshot[key]
  if (value === null) return 'Не вказано'
  if (typeof value === 'object') return value.name
  if (key === 'type') return lessonTypes[snapshot.type]
  if (key === 'status') return lessonStatuses[snapshot.status]
  if (key === 'starts_at' || key === 'ends_at') return exactDateTime(String(value), props.timezone)
  return String(value)
}
</script>
<template>
  <section class="ai-lesson-review" aria-label="Огляд змін заняття">
    <p class="helper">Місцевий час: {{ timezone }}. Змінені поля позначено в огляді.</p>
    <p v-if="preview.type === 'propose_lesson_create'" class="ai-review-notice">
      Це огляд нового заняття. Сам перегляд не створює запис; сервер збереже його лише після явного
      підтвердження.
    </p>
    <p v-else-if="preview.type === 'propose_lesson_cancel'" class="ai-review-notice">
      Заняття стане скасованим. Історія збережеться; це не остаточне видалення. Скасування заміни не
      відновлює початкове заняття.
    </p>
    <p v-else-if="preview.type === 'propose_lesson_update'" class="ai-review-notice">
      Показано повні стани до й після зміни. Незмінені поля збережуться; «Не вказано» у зміненому
      полі означає його очищення.
    </p>
    <div class="ai-compare">
      <section v-for="column in columns" :key="column.label" class="ai-review-section">
        <h3>{{ column.label }}</h3>
        <p v-if="!column.snapshot" class="helper">Новий запис ще не створено.</p>
        <dl v-else class="ai-fields">
          <div
            v-for="field in fields"
            :key="field.key"
            :class="{ 'ai-field-changed': column.after && changed(field.key) }"
          >
            <dt>
              {{ field.label }}
              <strong v-if="column.after && changed(field.key)">· Змінено</strong>
            </dt>
            <dd>
              {{ value(column.snapshot, field.key) }}
            </dd>
          </div>
        </dl>
      </section>
    </div>
    <section class="ai-material-effect ai-review-section">
      <h3>Що зміниться після підтвердження</h3>
      <p v-if="preview.effects.original_becomes_replaced">
        Початкове заняття стане «Замінене». Активною буде наведена заміна.
        <template v-if="preview.after.id !== null">
          Буде використано раніше збережене заняття-заміну.
        </template>
        <template v-else>Нове заняття-заміну буде створено після підтвердження.</template>
      </p>
      <p>Початкове заняття не відновлюється. Ідентичність імпорту зберігається.</p>
      <p>
        Навчальні сесії автоматично не переплановуються. Перевірте їх окремо після зміни розкладу.
      </p>
    </section>
  </section>
</template>
