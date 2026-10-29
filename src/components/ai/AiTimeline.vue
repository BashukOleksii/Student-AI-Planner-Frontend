<script setup lang="ts">
import type { AiMessage } from '@/types/ai'
import { toolLabels } from '@/utils/ai'
import { dateTime } from '@/utils/dates'
import AppButton from '@/components/ui/AppButton.vue'
defineProps<{ messages: AiMessage[]; timezone: string; busy: boolean }>()
const emit = defineEmits<{ action: [id: string] }>()
</script>
<template>
  <ol class="ai-timeline" aria-label="Історія повідомлень">
    <li v-for="message in messages" :key="message.id" :class="['ai-message', `ai-${message.role}`]">
      <article>
        <div class="ai-message-heading">
          <strong>
            {{
              message.role === 'user'
                ? 'Ви'
                : message.role === 'tool'
                  ? 'Серверний інструмент'
                  : 'AI-помічник'
            }}
          </strong>
          <time v-if="message.created_at" :datetime="message.created_at">
            {{ dateTime(message.created_at, timezone) }}
          </time>
        </div>
        <p v-if="message.content" class="ai-text">{{ message.content }}</p>
        <p v-if="message.content_truncated" class="helper">
          Сервер скоротив довгий історичний текст.
        </p>
        <ul v-if="message.tool_calls.length" class="ai-tools">
          <li v-for="call in message.tool_calls" :key="call.call_id">
            Виклик: {{ toolLabels[call.name] ?? call.name }}
            <span class="helper">· {{ call.call_id }}</span>
          </li>
        </ul>
        <p v-if="message.tool_calls_truncated" class="helper">
          Сервер скоротив список історичних викликів.
        </p>
        <div
          v-if="message.tool_result"
          class="ai-tool-result"
          :class="message.tool_result.ok ? 'success' : 'danger'"
        >
          <strong>{{ toolLabels[message.tool_result.name] ?? message.tool_result.name }}</strong>
          <p>
            {{
              message.tool_result.ok
                ? 'Сервер повідомив про успішне виконання інструмента.'
                : 'Інструмент не виконав запит.'
            }}
          </p>
          <p v-if="message.tool_result.error_code" class="helper">
            Код: {{ message.tool_result.error_code }}
          </p>
          <p v-if="message.tool_result.call_id" class="helper">
            Виклик {{ message.tool_result.call_id }}
          </p>
          <p class="helper">Успішний інструмент не означає виконання запропонованих змін.</p>
        </div>
        <p v-else-if="message.role === 'tool'" class="helper">
          Історичний запис інструмента без доступного публічного результату.
        </p>
        <div v-if="message.action_event" class="ai-event">
          <p>
            <strong>
              {{
                message.action_event.status === 'failed'
                  ? 'Спроба підтвердження не вдалася; це не кінцевий стан пропозиції.'
                  : message.action_event.status === 'executed'
                    ? 'Сервер зафіксував виконання дії.'
                    : message.action_event.status === 'rejected'
                      ? 'Пропозицію відхилено.'
                      : 'Строк пропозиції минув.'
              }}
            </strong>
          </p>
          <p v-if="message.action_event.error_code" class="helper">
            Код: {{ message.action_event.error_code }}
          </p>
          <AppButton :disabled="busy" @click="emit('action', message.action_event.action_id)">
            Переглянути дію та квитанцію
          </AppButton>
        </div>
      </article>
    </li>
  </ol>
</template>
