<script setup lang="ts">
import { ref } from 'vue'
import { planningApi } from '@/api/planning'
import { fieldErrors } from '@/api/client'
import { useResource } from '@/composables/useResource'
import { weekdays, canonicalWallTime } from '@/utils/planning'
import { useAuthStore } from '@/stores/auth'
import type { AvailabilityWindow, AvailabilityInput } from '@/types/planning'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
const auth = useAuthStore(),
  resource = useResource((signal) => planningApi.availability(signal))
const editing = ref<number | null>(null),
  open = ref(false),
  deleting = ref<AvailabilityWindow | null>(null)
const day = ref(1),
  start = ref('09:00:00'),
  end = ref('10:00:00'),
  busy = ref(false),
  error = ref<unknown>(null),
  localError = ref(''),
  success = ref('')
function edit(window?: AvailabilityWindow) {
  editing.value = window?.id ?? null
  day.value = window?.day_of_week ?? 1
  start.value = window?.starts_at ?? '09:00:00'
  end.value = window?.ends_at ?? '10:00:00'
  error.value = null
  localError.value = ''
  open.value = true
}
async function save() {
  if (busy.value) return
  error.value = null
  localError.value = ''
  success.value = ''
  let body: AvailabilityInput
  try {
    body = {
      day_of_week: Number(day.value),
      starts_at: canonicalWallTime(start.value),
      ends_at: canonicalWallTime(end.value, true),
    }
    if (body.ends_at <= body.starts_at)
      throw new Error(
        'Кінець має бути пізніше початку. Нічний інтервал потрібно додати окремими вікнами для двох днів.',
      )
  } catch (e) {
    localError.value = e instanceof Error ? e.message : ''
    return
  }
  busy.value = true
  try {
    if (editing.value !== null) await planningApi.updateWindow(editing.value, body)
    else await planningApi.createWindow(body)
    open.value = false
    success.value = 'Доступність збережено.'
    await resource.reload()
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
function askDelete(window: AvailabilityWindow) {
  deleting.value = window
  error.value = null
}
async function remove() {
  if (!deleting.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    await planningApi.deleteWindow(deleting.value.id)
    deleting.value = null
    success.value = 'Інтервал видалено.'
    await resource.reload()
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <h1>Щотижнева доступність</h1>
      <p class="muted">
        Місцевий час: {{ auth.user?.timezone }}. Доступність повторюється щотижня.
      </p>
    </div>
    <AppButton variant="primary" @click="edit()">Додати інтервал</AppButton>
  </header>
  <PlanningNav />
  <p v-if="success" role="status">{{ success }}</p>
  <LoadingState v-if="resource.loading.value" />
  <ErrorState
    v-else-if="resource.error.value"
    :error="resource.error.value"
    retry
    @retry="resource.reload"
  />
  <div v-else class="planning-week">
    <AppCard v-for="(label, index) in weekdays" :key="label" :title="label">
      <p v-if="!resource.data.value?.data.some((w) => w.day_of_week === index + 1)" class="helper">
        Доступність не задана.
      </p>
      <article
        v-for="window in resource.data.value?.data.filter((w) => w.day_of_week === index + 1)"
        :key="window.id"
        class="session-card"
      >
        <p>{{ window.starts_at }} — {{ window.ends_at }}</p>
        <div class="actions">
          <AppButton :aria-label="`Редагувати інтервал ${window.id}`" @click="edit(window)">
            Редагувати
          </AppButton>
          <AppButton
            variant="danger"
            :aria-label="`Видалити інтервал ${window.id}`"
            @click="askDelete(window)"
          >
            Видалити
          </AppButton>
        </div>
      </article>
    </AppCard>
  </div>
  <AppModal
    v-if="open"
    :title="editing === null ? 'Новий інтервал' : 'Редагування інтервалу'"
    :busy="busy"
    @close="open = false"
  >
    <form class="stack" @submit.prevent="save">
      <fieldset :disabled="busy" class="planning-fieldset">
        <FormField
          id="availability-day"
          v-slot="a"
          label="День тижня"
          :errors="fieldErrors(error).day_of_week"
        >
          <select
            :id="a.id"
            v-model="day"
            :aria-invalid="a.invalid"
            :aria-describedby="a.describedby"
          >
            <option v-for="(label, index) in weekdays" :key="label" :value="index + 1">
              {{ label }}
            </option>
          </select>
        </FormField>
        <FormField
          id="availability-start"
          v-slot="a"
          label="Початок інтервалу"
          :errors="fieldErrors(error).starts_at"
        >
          <input
            :id="a.id"
            v-model="start"
            type="time"
            step="1"
            required
            :aria-invalid="a.invalid"
            :aria-describedby="a.describedby"
          />
        </FormField>
        <FormField
          id="availability-end"
          v-slot="a"
          label="Кінець інтервалу"
          hint="HH:MM:SS; для кінця дня введіть 24:00:00."
          :errors="fieldErrors(error).ends_at"
        >
          <input
            :id="a.id"
            v-model="end"
            type="text"
            required
            placeholder="24:00:00"
            :aria-invalid="a.invalid"
            :aria-describedby="a.describedby"
          />
        </FormField>
      </fieldset>
      <p v-if="localError" class="field-error" role="alert">{{ localError }}</p>
      <FormNotice :error="error" />
      <AppButton type="submit" variant="primary" :busy="busy">Зберегти інтервал</AppButton>
    </form>
  </AppModal>
  <ConfirmDialog
    v-if="deleting"
    title="Видалити інтервал доступності?"
    :busy="busy"
    :error="error"
    @close="deleting = null"
    @confirm="remove"
  >
    {{ weekdays[deleting.day_of_week - 1] }}: {{ deleting.starts_at }} — {{ deleting.ends_at }}. Це
    змінить доступність для наступних планувань.
  </ConfirmDialog>
</template>
