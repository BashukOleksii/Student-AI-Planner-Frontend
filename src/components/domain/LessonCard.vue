<script setup lang="ts">
import type { Lesson } from '@/types/api'
import { lessonTypes } from '@/utils/lessons'
import { dateTime, time } from '@/utils/dates'
defineProps<{ lesson: Lesson; timezone: string }>()
</script>
<template>
  <article class="lesson">
    <div class="lesson-time">
      <time :datetime="lesson.starts_at">{{ time(lesson.starts_at, timezone) }}</time>
      <span>{{ time(lesson.ends_at, timezone) }}</span>
    </div>
    <div class="lesson-content">
      <div class="inline">
        <span class="badge">{{ lessonTypes[lesson.type] }}</span>
        <span v-if="lesson.subject?.code" class="helper">{{ lesson.subject.code }}</span>
      </div>
      <h3>
        <RouterLink :to="`/schedule/lessons/${lesson.id}`">
          {{ lesson.subject?.name ?? 'Предмет недоступний' }}
        </RouterLink>
      </h3>
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
