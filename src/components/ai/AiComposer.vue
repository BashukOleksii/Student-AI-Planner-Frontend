<script setup lang="ts">
import { computed } from 'vue'
import { validMessage } from '@/utils/ai'
import AppButton from '@/components/ui/AppButton.vue'
const content = defineModel<string>({ required: true })
const props = defineProps<{ disabled: boolean; sending: boolean }>()
const emit = defineEmits<{ send: [] }>()
const count = computed(() => Array.from(content.value).length)
function submit() {
  if (!props.disabled && !props.sending && validMessage(content.value)) emit('send')
}
function shortcut(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}
</script>
<template>
  <form class="ai-composer" @submit.prevent="submit">
    <div v-if="!content" class="composer-suggestions" aria-label="Приклади запитів">
      <button
        v-for="prompt in [
          'Які завдання мають найближчі дедлайни?',
          'Знайди час для підготовки до іспиту.',
          'Допоможи розкласти завдання на кроки.',
        ]"
        :key="prompt"
        type="button"
        :disabled="disabled || sending"
        @click="content = prompt"
      >
        {{ prompt }}
      </button>
    </div>
    <label for="ai-content">Повідомлення помічнику</label>
    <textarea
      id="ai-content"
      v-model="content"
      rows="3"
      :disabled="disabled || sending"
      :aria-invalid="count > 4000"
      aria-describedby="ai-composer-hint"
      placeholder="Наприклад: які завдання варто розглянути цього тижня?"
      @keydown="shortcut"
    ></textarea>
    <div class="inline ai-composer-footer">
      <p id="ai-composer-hint" class="helper">
        {{ count }} / 4000 символів · Ctrl/⌘ + Enter — надіслати; Enter — новий рядок.
      </p>
      <AppButton
        type="submit"
        variant="primary"
        :busy="sending"
        :disabled="disabled || !validMessage(content)"
      >
        Надіслати повідомлення
      </AppButton>
    </div>
  </form>
</template>
