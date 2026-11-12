<script setup lang="ts">
import type { AcademicLesson } from '@/types/academicCalendar'
import { lessonTypes } from '@/utils/lessons'
import { time } from '@/utils/dates'
withDefaults(
  defineProps<{ lesson: AcademicLesson; timezone: string; showSemesterActions?: boolean }>(),
  { showSemesterActions: true },
)
</script>
<template>
  <article class="academic-lesson">
    <p class="lesson-clock">
      {{ time(lesson.starts_at, timezone) }} — {{ time(lesson.ends_at, timezone) }}
    </p>
    <div class="academic-lesson-body">
      <h3>{{ lesson.subject?.name ?? 'Заняття' }}</h3>
      <p v-if="lesson.type || lesson.pair_number" class="helper">
        <template v-if="lesson.pair_number">Пара {{ lesson.pair_number }} ·</template>
        {{ lesson.type ? lessonTypes[lesson.type] : 'Тип не вказано' }}
      </p>
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
      <div v-if="lesson.source_type === 'legacy_lesson' || showSemesterActions" class="actions">
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
            Змінити на весь семестр
          </RouterLink>
        </template>
      </div>
    </div>
  </article>
</template>
