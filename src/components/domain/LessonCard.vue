<script setup lang="ts">
import type { Lesson, LessonType } from '@/types/api'
import { dateTime, time } from '@/utils/dates'
defineProps<{ lesson: Lesson; timezone: string }>()
const types: Record<LessonType, string> = {
  lecture: 'Лекція',
  practical: 'Практичне',
  laboratory: 'Лабораторна',
  seminar: 'Семінар',
  consultation: 'Консультація',
  exam: 'Іспит',
  other: 'Заняття',
}
</script>
<template>
  <article class="lesson">
    <div class="lesson-time">
      <time :datetime="lesson.starts_at">{{ time(lesson.starts_at, timezone) }}</time>
      <span>{{ time(lesson.ends_at, timezone) }}</span>
    </div>
    <div class="lesson-content">
      <div class="inline">
        <span class="badge">{{ types[lesson.type] }}</span>
        <span v-if="lesson.subject?.code" class="helper">{{ lesson.subject.code }}</span>
      </div>
      <h3>{{ lesson.subject?.name ?? 'Предмет недоступний' }}</h3>
      <p v-if="lesson.teacher || lesson.room" class="helper">
        {{
          [lesson.teacher?.name, lesson.room ? `Ауд. ${lesson.room}` : null]
            .filter(Boolean)
            .join(' · ')
        }}
      </p>
      <p class="helper">До {{ dateTime(lesson.ends_at, timezone) }}</p>
    </div>
  </article>
</template>
