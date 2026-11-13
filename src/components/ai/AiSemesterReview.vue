<script setup lang="ts">
import { computed } from 'vue'
import type { AiAction } from '@/types/ai'
import {
  semesterOccurrenceAddition,
  savedSemesterOccurrence,
  semesterReviewSupported,
} from '@/utils/aiSemester'
import { calendarLabel, time } from '@/utils/dates'
import { isPublicObject } from '@/utils/ai'
import SemesterSnapshot from './SemesterSnapshot.vue'
const props = defineProps<{ action: AiAction; saved?: boolean }>()
const effects = computed(() =>
  isPublicObject(props.action.preview.effects) ? props.action.preview.effects : {},
)
const timezone = computed(() =>
  typeof props.action.preview.timezone === 'string' ? props.action.preview.timezone : 'UTC',
)
const addition = computed(() => {
  if (
    props.action.type === 'propose_semester_occurrence_create' &&
    !semesterReviewSupported(props.action)
  )
    return null
  return props.saved
    ? savedSemesterOccurrence(props.action)
    : semesterOccurrenceAddition(
        props.action.preview.before,
        props.action.preview.after,
        timezone.value,
      )
})
</script>
<template>
  <section
    v-if="action.type === 'propose_semester_occurrence_create'"
    class="ai-review-section ai-semester-occurrence-create"
  >
    <template v-if="addition">
      <p>
        {{ calendarLabel(addition.date) }}, {{ addition.date.slice(0, 4) }} · Пара №{{
          addition.lesson.pair_number
        }}
      </p>
      <h3>{{ isPublicObject(addition.lesson.subject) ? addition.lesson.subject.name : '' }}</h3>
      <p>
        {{ time(String(addition.lesson.starts_at), timezone) }} —
        {{ time(String(addition.lesson.ends_at), timezone) }} · {{ timezone }}
      </p>
      <p>
        {{ isPublicObject(addition.lesson.teacher) ? addition.lesson.teacher.name : '' }}
        <span v-if="addition.lesson.room">· Ауд. {{ addition.lesson.room }}</span>
      </p>
      <p v-if="!saved" class="helper">Зміна лише на цю дату. Інші пари залишаться без змін</p>
    </template>
    <p v-else role="alert" class="field-error">
      {{
        saved
          ? 'Не вдалося перевірити збережений результат. Перевір стан дії перед новою зміною.'
          : 'Не вдалося перевірити огляд нової пари. Потрібен новий огляд.'
      }}
    </p>
  </section>
  <section v-else class="ai-review-section">
    <h3>
      {{
        action.type.includes('_occurrence_')
          ? 'Одне заняття на окрему дату'
          : action.type.includes('_rule_')
            ? 'Щотижневе правило'
            : action.type.endsWith('settings_update')
              ? 'Налаштування семестру'
              : 'Увесь день'
      }}
    </h3>
    <p v-if="action.type.includes('_occurrence_')">
      Буде збережено окремий розклад на цю дату. Інші заняття цього дня показано нижче.
    </p>
    <p v-if="effects.restores_base_date" class="report-warning">
      Виняток буде видалено: на дату повернуться заняття базового розкладу.
    </p>
    <p v-if="effects.preserves_frozen_dates">
      Раніше збережені зміни на окремі дати залишаться без змін.
    </p>
    <p v-if="effects.may_suppress_imported_slot" class="report-warning">
      Змінений або видалений слот може бути захищено від повторного додавання під час імпорту.
    </p>
    <p>Самостійні навчальні сесії не переносяться. Окремі датовані заняття не змінюються.</p>
    <div class="review-comparison">
      <section>
        <h3>До зміни</h3>
        <SemesterSnapshot :value="action.preview.before ?? null" :timezone="timezone" />
      </section>
      <section>
        <h3>Після підтвердження</h3>
        <SemesterSnapshot :value="action.preview.after ?? null" :timezone="timezone" />
      </section>
    </div>
  </section>
</template>
