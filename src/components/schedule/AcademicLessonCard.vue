<script setup lang="ts">
import type { AcademicLesson } from '@/types/academicCalendar'
import { time } from '@/utils/dates'
defineProps<{ lesson: AcademicLesson; timezone: string }>()
</script>
<template>
  <article class="academic-lesson">
    <p class="lesson-clock">
      {{ time(lesson.starts_at, timezone) }} — {{ time(lesson.ends_at, timezone) }}
    </p>
    <h3>{{ lesson.subject?.name ?? 'Заняття' }}</h3>
    <p class="helper">
      {{
        [lesson.teacher?.name, lesson.room ? `Ауд. ${lesson.room}` : null]
          .filter(Boolean)
          .join(' · ')
      }}
    </p>
    <p
      v-if="lesson.source === 'replacement' || lesson.source === 'working_saturday'"
      class="helper"
    >
      {{ lesson.source === 'replacement' ? 'Заміна на дату' : 'Робоча субота' }}
    </p>
    <div class="actions">
      <RouterLink
        v-if="lesson.source_type === 'legacy_lesson' && lesson.lesson_id"
        :to="`/schedule/lessons/${lesson.lesson_id}`"
      >
        Переглянути заняття
      </RouterLink>
      <template v-else-if="lesson.semester_schedule_id">
        <RouterLink
          :to="`/schedule/semesters/${lesson.semester_schedule_id}/dates/${lesson.occurs_on}`"
        >
          Змінити окрему дату
        </RouterLink>
        <RouterLink
          v-if="lesson.weekly_lesson_rule_id"
          :to="`/schedule/semesters/${lesson.semester_schedule_id}/rules/${lesson.weekly_lesson_rule_id}`"
        >
          Щотижневе правило
        </RouterLink>
      </template>
    </div>
  </article>
</template>
