<script setup lang="ts">
import type { WeeklyLessonRule } from '@/types/semesterSchedule'
import {
  lessonTypeLabel,
  localMinutes,
  patterns,
  semesterTeacherNames,
} from '@/utils/semesterSchedule'
defineProps<{ rule: WeeklyLessonRule; editTo?: string }>()
</script>
<template>
  <article class="lesson semester-lesson weekly-rule-card">
    <div class="lesson-time">
      <time>{{ localMinutes(rule.starts_at_local) }}</time>
      <time>{{ localMinutes(rule.ends_at_local) }}</time>
    </div>
    <div class="lesson-content">
      <div class="inline">
        <span class="badge">Пара {{ rule.pair_number }}</span>
        <span class="badge">{{ patterns[rule.week_pattern] }}</span>
      </div>
      <h3>{{ rule.subject.name }}</h3>
      <p class="helper">{{ lessonTypeLabel(rule.lesson_type) }}</p>
      <p class="helper">Викладач: {{ semesterTeacherNames(rule) }}</p>
      <p class="helper">Аудиторія: {{ rule.room || 'Не вказано' }}</p>
      <RouterLink v-if="editTo" :to="editTo" class="text-link">Редагувати пару</RouterLink>
    </div>
  </article>
</template>
