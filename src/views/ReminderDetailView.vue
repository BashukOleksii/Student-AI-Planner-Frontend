<script setup lang="ts">
import { ref, onScopeDispose } from 'vue'
import { useRoute } from 'vue-router'
import { remindersApi } from '@/api/reminders'
import { ApiError } from '@/api/client'
import { useResource } from '@/composables/useResource'
import { useAuthStore } from '@/stores/auth'
import ReminderCard from '@/components/reminders/ReminderCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const id = Number(useRoute().params.id),
  auth = useAuthStore(),
  resource = useResource((signal) => remindersApi.get(id, signal)),
  busy = ref(false),
  confirming = ref(false),
  error = ref<unknown>(null),
  notice = ref('')
let active = true
onScopeDispose(() => {
  active = false
})
async function cancel() {
  if (busy.value || resource.data.value?.data.status !== 'scheduled') return
  busy.value = true
  error.value = null
  try {
    const response = await remindersApi.cancel(id)
    if (active) {
      resource.data.value = response
      confirming.value = false
      notice.value = 'Нагадування скасовано.'
    }
  } catch (e) {
    if (active) {
      error.value = e
      if (e instanceof ApiError && [0, 409, 500, 502, 503].includes(e.status)) {
        confirming.value = false
        notice.value =
          'Перевірте актуальний стан після конфлікту або невідомого результату. Виконано лише запит читання; автоматичного повтору скасування не було.'
        await resource.reload()
      }
    }
  } finally {
    if (active) busy.value = false
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <RouterLink to="/reminders" class="text-link">← Усі нагадування</RouterLink>
      <h1>Нагадування №{{ id }}</h1>
    </div>
    <AppButton :disabled="busy || resource.loading.value" @click="resource.reload">
      Оновити стан
    </AppButton>
  </header>
  <LoadingState v-if="resource.loading.value" />
  <ErrorState
    v-else-if="resource.error.value"
    :error="resource.error.value"
    retry
    @retry="resource.reload"
  />
  <AppCard v-else-if="resource.data.value">
    <ReminderCard :reminder="resource.data.value.data" :timezone="auth.user?.timezone ?? 'UTC'" />
    <div v-if="resource.data.value.data.status === 'scheduled'" class="actions">
      <RouterLink :to="`/reminders/${id}/edit`" class="button secondary">
        Редагувати нагадування
      </RouterLink>
      <AppButton variant="danger" :disabled="busy" @click="confirming = true">
        Скасувати нагадування
      </AppButton>
    </div>
    <p v-else>
      Це історичний запис. Редагування, повторне відкриття та видалення не підтримуються.
    </p>
    <RouterLink to="/inbox" class="text-link">Відкрити Inbox →</RouterLink>
  </AppCard>
  <p v-if="notice" role="status">{{ notice }}</p>
  <FormNotice :error="error" />
  <p class="helper">
    Відносний час та залежні скасування синхронізує сервер. Скасоване нагадування не відновлюється
    при відкритті завдання знову.
  </p>
  <AppModal
    v-if="confirming"
    title="Скасувати нагадування?"
    :busy="busy"
    @close="confirming = false"
  >
    <p>
      Заплановане нагадування стане скасованим. Історія збережеться; це не видалення та не
      відкликання вже надісланого сповіщення.
    </p>
    <FormNotice :error="error" />
    <div class="actions">
      <AppButton :disabled="busy" @click="confirming = false">Залишити нагадування</AppButton>
      <AppButton variant="danger" :busy="busy" @click="cancel">Підтвердити скасування</AppButton>
    </div>
  </AppModal>
</template>
