<script setup lang="ts">
import WorkLink from './WorkLink.vue'
import { dateTime } from '@/utils/dates'
import type { RecoveryDiagnostics } from '@/types/planning'
import {
  exactDateTime,
  duration,
  planningReasonLabel,
  lifecycleActionLabel,
} from '@/utils/planning'
defineProps<{ diagnostics: RecoveryDiagnostics; timezone: string }>()
</script>
<template>
  <div class="recovery-history">
    <h3>Діагностика невиконаної роботи</h3>
    <p class="helper">Історія вибраної роботи за всі дати, незалежно від періоду нового плану.</p>
    <dl class="report-values">
      <div>
        <dt>Придатних до відновлення одиниць роботи</dt>
        <dd>{{ diagnostics.summary.eligible_work_count }}</dd>
      </div>
      <div>
        <dt>Явно пропущених сесій</dt>
        <dd>{{ diagnostics.summary.missed_session_count }}</dd>
      </div>
      <div>
        <dt>Минулих запланованих сесій</dt>
        <dd>{{ diagnostics.summary.past_planned_session_count }}</dd>
      </div>
    </dl>
    <p
      v-if="diagnostics.summary.requires_lifecycle_decision"
      role="status"
      class="planning-warning"
    >
      Потрібне ваше рішення щодо минулих запланованих сесій. Відкрийте їх і виберіть дозволену дію.
      Це попередження не забороняє підтвердження запропонованого нового плану.
    </p>
    <section
      v-for="group in [
        { key: 'missed', title: 'Пропущені сесії', sessions: diagnostics.missed_sessions },
        {
          key: 'planned',
          title: 'Минулі заплановані сесії',
          sessions: diagnostics.past_planned_sessions,
        },
      ]"
      :key="group.key"
      :aria-labelledby="`recovery-${group.key}-heading`"
    >
      <h3 :id="`recovery-${group.key}-heading`">{{ group.title }}</h3>
      <p class="helper">
        {{
          group.key === 'missed'
            ? 'Історичні записи пропусків зберігаються без змін.'
            : 'Ці сесії досі заплановані. Дозволені дії та їхні умови перевіряє сервер на сторінці сесії.'
        }}
      </p>
      <p v-if="!group.sessions.length" class="helper">Сесій цієї групи не знайдено.</p>
      <article
        v-for="session in group.sessions"
        :key="session.study_session_id"
        class="session-card"
      >
        <h4>
          <RouterLink :to="`/planning/sessions/${session.study_session_id}`">
            Навчання · {{ dateTime(session.starts_at, timezone) }}
          </RouterLink>
        </h4>
        <p>
          {{ exactDateTime(session.starts_at, timezone) }} —
          {{ exactDateTime(session.ends_at, timezone) }} · {{ duration(session.duration_seconds) }}
        </p>
        <p>
          <WorkLink :task-id="session.task_id" :subtask-id="session.subtask_id" />
          <template v-if="session.subtask_id !== null">
            ·
            <RouterLink :to="`/tasks/${session.task_id}`">Переглянути навчальний крок</RouterLink>
          </template>
        </p>
        <ul v-if="session.work_reason_codes.length">
          <li v-for="(code, index) in session.work_reason_codes" :key="index">
            {{ planningReasonLabel(code) }}
          </li>
        </ul>
        <p
          v-if="group.key === 'planned' && session.allowed_lifecycle_actions.length"
          class="helper"
        >
          Дозволені дії:
          {{ session.allowed_lifecycle_actions.map(lifecycleActionLabel).join('; ') }}. Перейдіть до
          сесії, щоб прийняти рішення.
        </p>
      </article>
    </section>
  </div>
</template>
