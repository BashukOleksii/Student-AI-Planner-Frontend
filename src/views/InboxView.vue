<script setup lang="ts">
import { ref, onScopeDispose, watch } from 'vue'
import { notificationsApi } from '@/api/notifications'
import { useResource } from '@/composables/useResource'
import { useAuthStore } from '@/stores/auth'
import { exactDateTime } from '@/utils/planning'
import TargetLinks from '@/components/reminders/TargetLinks.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const auth = useAuthStore(),
  unread = ref<'true' | 'false'>('false'),
  page = ref(1),
  busy = ref<string | null>(null),
  error = ref<unknown>(null),
  notice = ref('')
const resource = useResource(
  (signal) =>
    notificationsApi.list({ unread_only: unread.value, page: page.value, per_page: 20 }, signal),
  [unread, page],
)
watch(resource.data, (value) => {
  if (value && page.value > value.meta.last_page) page.value = Math.max(1, value.meta.last_page)
})
let active = true
onScopeDispose(() => {
  active = false
})
function filter(value: 'true' | 'false') {
  page.value = 1
  unread.value = value
}
async function read(id: string) {
  if (busy.value) return
  busy.value = id
  error.value = null
  notice.value = ''
  try {
    const response = await notificationsApi.read(id)
    if (!active) return
    if (resource.data.value)
      resource.data.value = {
        ...resource.data.value,
        data: resource.data.value.data.map((item) => (item.id === id ? response.data : item)),
      }
    notice.value = response.data.read_at
      ? `Прочитано за серверним часом: ${exactDateTime(response.data.read_at, auth.user?.timezone ?? 'UTC')}`
      : 'Отримано актуальний стан сповіщення.'
    await resource.reload()
  } catch (e) {
    if (active) {
      error.value = e
      notice.value =
        'Стан прочитання не підтверджено. Оновіть Inbox перед новою дією; автоматичного повтору не було.'
    }
  } finally {
    if (active) busy.value = null
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <h1>Вхідні сповіщення</h1>
      <p class="muted">
        Тут лише записи, вже доставлені сервером у застосунок. Push, email і SMS не надсилаються.
      </p>
    </div>
    <AppButton :disabled="!!busy || resource.loading.value" @click="resource.reload">
      Оновити Inbox
    </AppButton>
  </header>
  <div class="segmented" aria-label="Фільтр сповіщень">
    <button :aria-pressed="unread === 'false'" @click="filter('false')">Усі сповіщення</button>
    <button :aria-pressed="unread === 'true'" @click="filter('true')">Непрочитані</button>
  </div>
  <p v-if="notice" role="status">{{ notice }}</p>
  <FormNotice :error="error" />
  <LoadingState v-if="resource.loading.value" />
  <ErrorState
    v-else-if="resource.error.value"
    :error="resource.error.value"
    retry
    @retry="resource.reload"
  />
  <template v-else-if="resource.data.value">
    <p v-if="unread === 'true'" class="helper">
      Непрочитаних за останнім запитом: {{ resource.data.value.meta.total }}
    </p>
    <EmptyState
      v-if="!resource.data.value.data.length"
      title="Сповіщень за цим фільтром немає"
      description="Нагадування може залишатися запланованим, якщо сервер ще не доставив його. Оновлення Inbox не запускає доставку."
    />
    <AppCard
      v-for="item in resource.data.value.data"
      :key="item.id"
      class="notification-card"
      :class="{ unread: !item.read_at }"
    >
      <header class="section-heading">
        <h2>{{ item.type === 'reminder' ? 'Нагадування' : 'Сповіщення' }}</h2>
        <span class="badge">{{ item.read_at ? 'Прочитане' : 'Непрочитане' }}</span>
      </header>
      <p class="reminder-message">{{ item.message }}</p>
      <p v-if="item.created_at">
        Доставлено у застосунок: {{ exactDateTime(item.created_at, auth.user?.timezone ?? 'UTC') }}
      </p>
      <p v-if="item.trigger_at" class="helper">
        Запланований час: {{ exactDateTime(item.trigger_at, auth.user?.timezone ?? 'UTC') }}
      </p>
      <p v-if="item.read_at" class="helper">
        Прочитано: {{ exactDateTime(item.read_at, auth.user?.timezone ?? 'UTC') }}
      </p>
      <TargetLinks
        :task-id="item.task_id"
        :subtask-id="item.subtask_id"
        :session-id="item.study_session_id"
      />
      <div class="actions">
        <RouterLink
          v-if="item.reminder_id"
          :to="`/reminders/${item.reminder_id}`"
          class="text-link"
        >
          Нагадування №{{ item.reminder_id }}
        </RouterLink>
        <AppButton
          v-if="!item.read_at"
          :busy="busy === item.id"
          :disabled="!!busy"
          @click="read(item.id)"
        >
          Позначити прочитаним
        </AppButton>
      </div>
    </AppCard>
    <PageNavigation
      :current="resource.data.value.meta.current_page"
      :last="resource.data.value.meta.last_page"
      :total="resource.data.value.meta.total"
      :busy="!!busy"
      @page="page = $event"
    />
  </template>
  <RouterLink to="/reminders" class="button secondary">Керувати нагадуваннями</RouterLink>
</template>
