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
      <h3>
        <RouterLink
          v-if="lesson.source_type === 'legacy_lesson' && lesson.lesson_id"
          :to="`/schedule/lessons/${lesson.lesson_id}`"
        >
          {{ lesson.subject?.name ?? 'Заняття' }}
        </RouterLink>
        <template v-else>{{ lesson.subject?.name ?? 'Заняття' }}</template>
      </h3>
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
      <div class="inline">
        <span v-if="lesson.source_type === 'legacy_lesson'" class="badge">Окреме заняття</span>
        <template v-else>
          <span v-if="lesson.source === 'working_saturday'" class="badge">Робоча субота</span>
          <span v-if="lesson.change_kind === 'modified'" class="badge">Змінено на цю дату</span>
          <span v-else-if="lesson.change_kind === 'added'" class="badge">Додано на цю дату</span>
        </template>
      </div>
      <div
        v-if="lesson.source_type === 'semester_occurrence' && showSemesterActions"
        class="actions"
      >
        <template v-if="lesson.semester_schedule_id">
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
