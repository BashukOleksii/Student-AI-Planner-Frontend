<script setup lang="ts">
import { ref } from 'vue'
import { remindersApi } from '@/api/reminders'
import { useResource } from '@/composables/useResource'
import { useAuthStore } from '@/stores/auth'
import { toUtc } from '@/utils/dates'
import { reminderStatuses, validReminderRange } from '@/utils/reminders'
import type { ReminderFilters } from '@/types/reminders'
import type { Reminder } from '@/types/api'
import ReminderCard from '@/components/reminders/ReminderCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const auth = useAuthStore(),
  status = ref<Reminder['status'] | ''>(''),
  from = ref(''),
  to = ref(''),
  localError = ref(''),
  page = ref(1),
  filters = ref<ReminderFilters>({})
const resource = useResource(
  (signal) => remindersApi.list({ ...filters.value, page: page.value, per_page: 20 }, signal),
  [filters, page],
)
function apply() {
  localError.value = ''
  try {
    const trigger_from = toUtc(from.value, auth.user?.timezone ?? 'UTC'),
      trigger_to = toUtc(to.value, auth.user?.timezone ?? 'UTC')
    validReminderRange(trigger_from, trigger_to)
    page.value = 1
    filters.value = {
      ...(status.value ? { status: status.value } : {}),
      ...(trigger_from && trigger_to ? { trigger_from, trigger_to } : {}),
    }
  } catch (e) {
    localError.value = e instanceof Error ? e.message : ''
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <h1>Нагадування</h1>
      <p class="muted">Доставку виконує сервер. Настання часу у браузері не означає надсилання.</p>
    </div>
    <RouterLink to="/reminders/new" class="button primary">Нове нагадування</RouterLink>
  </header>
  <AppCard>
    <form class="stack" @submit.prevent="apply">
      <div class="form-grid">
        <div class="field">
          <label for="reminder-status">Статус нагадувань</label>
          <select id="reminder-status" v-model="status">
            <option value="">Усі стани</option>
            <option v-for="(label, key) in reminderStatuses" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label for="trigger-from">Спрацювання від</label>
          <input id="trigger-from" v-model="from" type="datetime-local" step="1" />
        </div>
        <div class="field">
          <label for="trigger-to">Спрацювання до</label>
          <input id="trigger-to" v-model="to" type="datetime-local" step="1" />
        </div>
      </div>
      <p class="helper">
        Обидві часові межі або жодної, до 366 діб. Пояс {{ auth.user?.timezone }}.
      </p>
      <p v-if="localError" role="alert" class="field-error">{{ localError }}</p>
      <div class="actions">
        <AppButton type="submit">Застосувати фільтри</AppButton>
        <AppButton :disabled="resource.loading.value" @click="resource.reload">
          Оновити нагадування
        </AppButton>
        <RouterLink to="/inbox" class="text-link">Вхідні сповіщення →</RouterLink>
      </div>
    </form>
  </AppCard>
  <LoadingState v-if="resource.loading.value" />
  <FormNotice v-else-if="resource.error.value" :error="resource.error.value" />
  <AppButton v-if="resource.error.value" @click="resource.reload">Повторити читання</AppButton>
  <template v-if="resource.data.value">
    <EmptyState
      v-if="!resource.data.value.data.length"
      title="Нагадувань за цими фільтрами немає"
    />
    <AppCard v-for="reminder in resource.data.value.data" :key="reminder.id">
      <ReminderCard :reminder="reminder" :timezone="auth.user?.timezone ?? 'UTC'" />
    </AppCard>
    <PageNavigation
      :current="resource.data.value.meta.current_page"
      :last="resource.data.value.meta.last_page"
      :total="resource.data.value.meta.total"
      :busy="resource.loading.value"
      @page="page = $event"
    />
  </template>
  <p class="helper">
    Скасовані нагадування не відновлюються автоматично після повторного відкриття завдання. Історія
    надісланих і скасованих записів зберігається.
  </p>
</template>
