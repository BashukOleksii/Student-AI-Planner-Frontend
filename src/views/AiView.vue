<script setup lang="ts">
import { computed, ref, onScopeDispose } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { aiApi } from '@/api/ai'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { useAiConversation } from '@/composables/useAiConversation'
import { actionLabels, positiveId, statusLabels } from '@/utils/ai'
import { dateTime } from '@/utils/dates'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import AiNotice from '@/components/ai/AiNotice.vue'
import AiTimeline from '@/components/ai/AiTimeline.vue'
import AiComposer from '@/components/ai/AiComposer.vue'
import AiActionReview from '@/components/ai/AiActionReview.vue'
const auth = useAuthStore(),
  route = useRoute(),
  router = useRouter()
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const cursor = ref<string | null>(null)
const conversations = useResource((signal) => aiApi.conversations(cursor.value, signal), [cursor])
const creating = ref(false),
  createError = ref<unknown>(null)
const createController = new AbortController()
onScopeDispose(() => createController.abort())
const conversationId = positiveId(Number(route.params.id)) ? Number(route.params.id) : null
function refreshConversations() {
  if (cursor.value) cursor.value = null
  else void conversations.reload()
}
const chat =
  conversationId && auth.user
    ? useAiConversation(
        conversationId,
        auth.user.id,
        () => timezone.value,
        refreshConversations,
        () => auth.csrfFailure,
      )
    : null
const busy = computed(() => creating.value || !!chat?.sending.value || !!chat?.decisionBusy.value)
const retryBlocked = computed(
  () =>
    auth.csrfFailure ||
    busy.value ||
    (chat?.sendError.value instanceof ApiError &&
      chat.sendError.value.code === 'idempotency_conflict'),
)
onBeforeRouteLeave(
  () =>
    !auth.user ||
    !chat?.draft.value ||
    !!chat.intent.value ||
    window.confirm('Залишити розмову без надсилання чернетки?'),
)
async function create() {
  if (busy.value || auth.csrfFailure) return
  creating.value = true
  createError.value = null
  try {
    const result = await aiApi.create(createController.signal)
    if (!createController.signal.aborted) await router.push(`/ai/conversations/${result.data.id}`)
  } catch (error) {
    if (!createController.signal.aborted) createError.value = error
  } finally {
    if (!createController.signal.aborted) creating.value = false
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <p class="eyebrow">ВАШ НАВЧАЛЬНИЙ ПРОСТІР</p>
      <h1>AI-помічник</h1>
      <p class="muted">Запитуйте про навчання. Перевіряйте пропозиції перед змінами.</p>
    </div>
    <AppButton
      variant="primary"
      :busy="creating"
      :disabled="busy || auth.csrfFailure"
      @click="create"
    >
      Нова розмова
    </AppButton>
  </header>
  <AiNotice :error="createError" />
  <p v-if="createError" class="helper">
    Якщо відповідь перервалася, спочатку оновіть список: розмову могло бути створено.
  </p>
  <div class="ai-workspace">
    <AppCard title="Розмови" class="ai-conversations">
      <AppButton :disabled="conversations.loading.value || creating" @click="conversations.reload">
        Оновити список
      </AppButton>
      <LoadingState v-if="conversations.loading.value" />
      <template v-else-if="conversations.error.value">
        <AiNotice :error="conversations.error.value" />
        <AppButton @click="conversations.reload">Повторити завантаження розмов</AppButton>
      </template>
      <EmptyState
        v-else-if="!conversations.data.value?.data.length"
        title="Розмов поки немає"
        description="Створіть розмову, щоб поставити перше запитання."
      />
      <template v-else>
        <nav aria-label="Розмови з AI" class="ai-conversation-list">
          <RouterLink
            v-for="conversation in conversations.data.value?.data"
            :key="conversation.id"
            :to="`/ai/conversations/${conversation.id}`"
            :aria-current="conversationId === conversation.id ? 'page' : undefined"
          >
            <strong>Розмова #{{ conversation.id }}</strong>
            <span class="helper">
              {{
                conversation.updated_at
                  ? dateTime(conversation.updated_at, timezone)
                  : 'Дата невідома'
              }}
            </span>
          </RouterLink>
        </nav>
        <footer
          v-if="conversations.data.value && conversations.data.value.meta.last_page > 1"
          class="pagination"
        >
          <AppButton
            :disabled="!conversations.data.value.links.prev"
            @click="cursor = conversations.data.value.links.prev"
          >
            Попередні розмови
          </AppButton>
          <span class="helper">
            {{ conversations.data.value.meta.current_page }} /
            {{ conversations.data.value.meta.last_page }}
          </span>
          <AppButton
            :disabled="!conversations.data.value.links.next"
            @click="cursor = conversations.data.value.links.next"
          >
            Наступні розмови
          </AppButton>
        </footer>
      </template>
    </AppCard>
    <div class="ai-chat-column">
      <AppCard v-if="!chat">
        <EmptyState
          :title="route.params.id ? 'Розмова недоступна' : 'Почніть із запитання'"
          description="Створіть нову розмову або оберіть збережену зі списку."
        />
      </AppCard>
      <LoadingState v-else-if="chat.conversation.loading.value" />
      <template v-else-if="chat.conversation.error.value">
        <AiNotice :error="chat.conversation.error.value" />
        <AppButton @click="chat.conversation.reload">Перевірити доступ до розмови</AppButton>
      </template>
      <template v-else-if="chat.conversation.data.value">
        <AppCard :title="`Розмова #${conversationId}`" class="ai-chat">
          <p class="helper">
            Історія зберігається сервером. AI може помилятися; лише окрема кнопка підтверджує
            запропоновані зміни.
          </p>
          <div class="actions">
            <AppButton :disabled="chat.historyLoading.value" @click="chat.history(false)">
              Оновити історію
            </AppButton>
            <AppButton
              v-if="chat.messagePage.value?.links.prev"
              :disabled="chat.historyLoading.value"
              @click="chat.history(true)"
            >
              Завантажити старіші повідомлення
            </AppButton>
          </div>
          <LoadingState v-if="chat.historyLoading.value" />
          <AiNotice :error="chat.historyError.value" />
          <EmptyState
            v-if="
              !chat.historyLoading.value && !chat.historyError.value && !chat.messages.value.length
            "
            title="У цій розмові ще немає повідомлень"
            description="Поставте запитання нижче."
          />
          <AiTimeline
            :messages="chat.messages.value"
            :timezone="timezone"
            :busy="chat.decisionBusy.value"
            @action="chat.selectAction"
          />
          <div class="sr-only" role="status" aria-live="polite">{{ chat.sentNotice.value }}</div>
          <div v-if="chat.intent.value" class="ai-pending-intent" :aria-busy="chat.sending.value">
            <h3>
              {{
                chat.sending.value
                  ? 'Очікуємо завершення запиту'
                  : 'Є незавершений або непідтверджений запит'
              }}
            </h3>
            <p class="ai-text">{{ chat.intent.value.content }}</p>
            <p class="helper">
              Переривання відповіді не означає, що сервер не зберіг результат. Повторення
              використовує той самий текст і ключ. Якщо результат не збережено, повторний AI-запит
              може мати вартість.
            </p>
            <p v-if="chat.sending.value" role="status">
              Сервер обробляє запит. Повідомлення й результати інструментів з’являться після
              завершення.
            </p>
            <div v-else class="actions">
              <AppButton :disabled="retryBlocked" @click="chat.send(true)">
                Повторити цей запит
              </AppButton>
              <AppButton :disabled="busy" @click="chat.editAsNew">
                Редагувати як новий запит
              </AppButton>
              <AppButton :disabled="busy" @click="chat.forgetIntent">
                Видалити локальну копію
              </AppButton>
            </div>
          </div>
          <AiNotice :error="chat.sendError.value" />
          <p
            v-if="chat.selected.value?.status === 'pending'"
            class="ai-review-notice"
            role="status"
          >
            Є пропозиція, що потребує вашого рішення.
            <a href="#ai-current-action">Перейти до повного огляду й підтвердження</a>
          </p>
          <AiComposer
            v-if="!chat.intent.value"
            v-model="chat.draft.value"
            :disabled="busy || auth.csrfFailure"
            :sending="chat.sending.value"
            @send="chat.send(false)"
          />
          <p class="helper ai-storage-note">
            Лише незавершений запит (текст і ключ) зберігається в цій вкладці для відновлення до
            завершення або вашого рішення. Історія та облікові дані тут не зберігаються. «Видалити
            локальну копію» або вихід очищає копію.
          </p>
          <p v-if="!chat.storageAvailable.value" class="field-error">
            Сховище вкладки недоступне. Не перезавантажуйте сторінку, поки результат запиту
            невідомий.
          </p>
        </AppCard>
        <AppCard title="Пропозиції та результати" class="ai-actions">
          <AppButton
            :disabled="chat.actionsLoading.value || chat.decisionBusy.value"
            @click="chat.loadActions(false)"
          >
            Оновити дії
          </AppButton>
          <LoadingState v-if="chat.actionsLoading.value" />
          <AiNotice :error="chat.actionsError.value" />
          <p
            v-if="
              !chat.actionsLoading.value && !chat.actionsError.value && !chat.actions.value.length
            "
            class="helper"
          >
            Пропозицій ще немає. Відповіді на запитання не потребують підтвердження.
          </p>
          <ul class="ai-action-list">
            <li v-for="action in chat.actions.value" :key="action.id">
              <div>
                <strong>{{ actionLabels[action.type] ?? action.type }}</strong>
                <p class="helper">
                  {{ statusLabels[action.status] }} · {{ dateTime(action.created_at, timezone) }}
                </p>
              </div>
              <AppButton
                :disabled="chat.decisionBusy.value"
                :aria-pressed="chat.selectedId.value === action.id"
                @click="chat.selectAction(action.id)"
              >
                Переглянути пропозицію
              </AppButton>
            </li>
          </ul>
          <AppButton
            v-if="chat.actionsNext.value"
            :disabled="chat.actionsLoading.value || chat.decisionBusy.value"
            @click="chat.loadActions(true)"
          >
            Старіші дії
          </AppButton>
        </AppCard>
        <LoadingState v-if="chat.reviewLoading.value" />
        <template v-if="chat.reviewError.value">
          <AiNotice :error="chat.reviewError.value" />
          <AppButton :disabled="chat.decisionBusy.value" @click="chat.recoverDecision">
            Перевірити поточний стан дії
          </AppButton>
        </template>
        <AiActionReview
          v-if="chat.selected.value"
          id="ai-current-action"
          tabindex="-1"
          :action="chat.selected.value"
          :timezone="timezone"
          :consent="chat.consent.value"
          :busy="chat.decisionBusy.value"
          :blocked="chat.sending.value || auth.csrfFailure || chat.reviewLoading.value"
          :needs-proposal="chat.needsProposal.value"
          :uncertain="chat.uncertainDecision.value"
          :error="chat.decisionError.value"
          :notice="chat.decisionNotice.value"
          :domain-error="chat.domainError.value"
          :domain-busy="chat.domainBusy.value"
          @consent="
            (field, checked) => {
              if (chat) chat.consent.value[field] = checked
            }
          "
          @decision="chat.decide"
          @refresh-domains="chat.refreshDomains"
          @recover="chat.recoverDecision"
        />
      </template>
    </div>
  </div>
</template>
