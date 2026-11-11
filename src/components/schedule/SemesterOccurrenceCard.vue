<script setup lang="ts">
import type { SemesterOccurrence, WeekPattern } from '@/types/semesterSchedule'
import { patterns, semesterTeacherNames } from '@/utils/semesterSchedule'
import { time } from '@/utils/dates'
defineProps<{
  occurrence: SemesterOccurrence
  timezone: string
  scheduleId: number
  pattern?: WeekPattern
}>()
</script>

<template>
  <article class="lesson semester-lesson">
    <div class="lesson-time">
      <time :datetime="occurrence.starts_at">{{ time(occurrence.starts_at, timezone) }}</time>
      <time :datetime="occurrence.ends_at">{{ time(occurrence.ends_at, timezone) }}</time>
    </div>
    <div class="lesson-content">
      <div class="inline">
        <span class="badge">
          Пара {{ occurrence.pair_number }}
          <template v-if="occurrence.pair_label">· {{ occurrence.pair_label }}</template>
        </span>
        <span v-if="occurrence.source === 'working_saturday'" class="badge">Робоча субота</span>
        <span v-else-if="occurrence.source === 'replacement'" class="badge">Заміна на дату</span>
        <span v-else-if="pattern" class="badge">{{ patterns[pattern] }}</span>
      </div>
      <h3>{{ occurrence.subject.name }}</h3>
      <p class="helper">Викладачі: {{ semesterTeacherNames(occurrence) }}</p>
      <p class="helper">Аудиторія: {{ occurrence.room ?? 'Не вказано' }}</p>
      <div class="semester-lesson-actions">
        <RouterLink
          v-if="occurrence.source === 'base' && occurrence.weekly_lesson_rule_id"
          :to="`/schedule/semesters/${scheduleId}/rules/${occurrence.weekly_lesson_rule_id}`"
          class="text-link"
        >
          Змінити пару на весь семестр
        </RouterLink>
        <RouterLink
          :to="`/schedule/semesters/${scheduleId}/dates/${occurrence.occurs_on}`"
          class="text-link"
        >
          {{
            occurrence.source === 'base' ? 'Замінити пару тільки на цю дату' : 'Редагувати цей день'
          }}
        </RouterLink>
      </div>
    </div>
  </article>
</template>
