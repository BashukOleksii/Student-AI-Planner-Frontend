<script setup lang="ts">
import { computed } from 'vue'
import type { AiMessage, SentAiTurn } from '@/types/ai'
import { aiTimeline, actionEventLabel } from '@/utils/aiTimeline'
import { dateTime } from '@/utils/dates'
import AppButton from '@/components/ui/AppButton.vue'
const props = defineProps<{
  messages: AiMessage[]
  turns?: SentAiTurn[]
  timezone: string
  busy: boolean
}>()
const entries = computed(() => aiTimeline(props.messages, props.turns))
const emit = defineEmits<{ action: [id: string] }>()
</script>
<template>
  <ol class="ai-timeline" aria-label="Історія повідомлень">
    <li
      v-for="{ message, failure } in entries"
      :key="message.id"
      :class="['ai-message', `ai-${message.role}`]"
      :data-message-id="message.id"
    >
      <article>
        <div class="ai-message-heading">
          <strong>{{ message.role === 'user' ? 'Ви' : 'AI-помічник' }}</strong>
          <time v-if="message.created_at" :datetime="message.created_at">
            {{ dateTime(message.created_at, timezone) }}
          </time>
        </div>
        <p v-if="message.content && !message.action_event" class="ai-text">{{ message.content }}</p>
        <p v-if="message.content_truncated" class="helper">
          Сервер скоротив довгий історичний текст.
        </p>
        <p v-if="failure" class="ai-occurrence-failure" role="status">{{ failure }}</p>
        <div v-if="message.action_event" class="ai-event">
          <p>
            <strong>
              {{ actionEventLabel(message.action_event) }}
            </strong>
          </p>
          <AppButton :disabled="busy" @click="emit('action', message.action_event.action_id)">
            Переглянути результат і стан
          </AppButton>
        </div>
      </article>
    </li>
  </ol>
</template>
