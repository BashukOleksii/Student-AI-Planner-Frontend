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
                  ? 'Результат перевірки'
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
        <details v-if="message.tool_calls.length" class="tool-metadata">
          <summary>Технічні деталі перевірок</summary>
          <ul class="ai-tools">
            <li v-for="call in message.tool_calls" :key="call.call_id">
              {{ toolLabels[call.name] ?? 'Перевірка даних' }}
              <details class="tool-metadata">
                <summary>Дані запиту</summary>
                <span class="helper">{{ call.call_id }}</span>
              </details>
            </li>
          </ul>
        </details>
        <p v-if="message.tool_calls_truncated" class="helper">
          Сервер скоротив список історичних викликів.
        </p>
        <component
          :is="message.tool_result?.ok ? 'details' : 'div'"
          v-if="message.tool_result"
          class="ai-tool-result"
          :class="message.tool_result.ok ? 'success' : 'danger'"
        >
          <summary v-if="message.tool_result.ok">Дані перевірено</summary>
          <strong>{{ toolLabels[message.tool_result.name] ?? 'Перевірка даних' }}</strong>
          <p>
            {{
              message.tool_result.ok
                ? 'Дані перевірено. Подробиці — у відповіді помічника.'
                : 'Не вдалося отримати результат перевірки.'
            }}
          </p>
          <details v-if="message.tool_result.error_code" class="tool-metadata">
            <summary>Технічні деталі</summary>
            <p class="helper">Код: {{ message.tool_result.error_code }}</p>
          </details>
          <details v-if="message.tool_result.call_id" class="tool-metadata">
            <summary>Дані перевірки</summary>
            <p class="helper">
              {{ message.tool_result.call_id }}
            </p>
          </details>
          <p class="helper">Перевірка даних не застосовує запропоновані зміни.</p>
        </component>
        <p v-else-if="message.role === 'tool'" class="helper">
          Деталі цієї перевірки більше недоступні.
        </p>
        <div v-if="message.action_event" class="ai-event">
          <p>
            <strong>
              {{
                message.action_event.status === 'failed'
                  ? 'Спроба підтвердження не вдалася; це не кінцевий стан пропозиції.'
                  : message.action_event.status === 'executed'
                    ? 'Зміни успішно застосовано.'
                    : message.action_event.status === 'rejected'
                      ? 'Пропозицію відхилено.'
                      : 'Строк пропозиції минув.'
              }}
            </strong>
          </p>
          <details v-if="message.action_event.error_code" class="tool-metadata">
            <summary>Технічні деталі</summary>
            <p class="helper">Код: {{ message.action_event.error_code }}</p>
          </details>
          <AppButton :disabled="busy" @click="emit('action', message.action_event.action_id)">
            Переглянути результат і стан
          </AppButton>
        </div>
      </article>
    </li>
  </ol>
</template>
