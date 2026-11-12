<script setup lang="ts">
import { computed, ref } from 'vue'
import { planningApi } from '@/api/planning'
import { fieldErrors } from '@/api/client'
import { useResource } from '@/composables/useResource'
import { useAvailabilitySetup } from '@/composables/useAvailabilitySetup'
import { weekdays, canonicalWallTime, wallTimeLabel, preferenceFields } from '@/utils/planning'
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
const preferences = useResource((signal) => planningApi.preferences(signal))
const setup = useAvailabilitySetup((windows) => {
  resource.data.value = { data: windows }
})
const showSetup = computed(
  () => setup.selection.value !== null || resource.data.value?.data.length === 0,
)
const unsetPreferences = computed(() =>
  preferences.data.value
    ? preferenceFields
        .filter(({ key }) => preferences.data.value!.data[key] === null)
        .map(({ label }) => label.replace(', хв', ''))
    : [],
)
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
function edit(window?: AvailabilityWindow, selectedDay = 1) {
  editing.value = window?.id ?? null
  day.value = window?.day_of_week ?? selectedDay
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
  <div class="page-workspace page-planning">
    <header class="page-heading">
      <div>
        <h1>Щотижнева доступність</h1>
        <p class="muted">
          Коли вам зручно навчатися щотижня? Час: {{ auth.user?.timezone }}. Ці інтервали
          використовуються для майбутніх планів; наявні сесії не пересуваються.
        </p>
      </div>
      <AppButton variant="primary" :disabled="setup.busy.value" @click="edit()">
        Додати інтервал
      </AppButton>
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
    <template v-else-if="resource.data.value">
      <AppCard
        v-if="showSetup"
        class="availability-setup"
        title="Налаштуйте час для самостійного навчання"
      >
        <p class="muted">
          Щоб сформувати навчальний план, потрібно визначити години, коли ви готові навчатися. Ми
          пропонуємо початковий графік, який можна змінити.
        </p>
        <p class="helper">
          Це необов’язкова пропозиція. До підтвердження нічого не зберігається. Часовий пояс:
          {{ auth.user?.timezone }}.
        </p>
        <form class="stack" @submit.prevent="setup.save">
          <fieldset
            :disabled="setup.busy.value || setup.selection.value !== null"
            class="planning-fieldset availability-editor"
          >
            <legend class="sr-only">Дні та години самостійного навчання</legend>
            <div
              v-for="day in setup.days.value"
              :key="day.day_of_week"
              class="availability-draft-row"
            >
              <label class="availability-day-toggle" :for="`setup-day-${day.day_of_week}`">
                <input :id="`setup-day-${day.day_of_week}`" v-model="day.enabled" type="checkbox" />
                {{ day.label }}
              </label>
              <div class="field">
                <label :for="`setup-start-${day.day_of_week}`">Початок · {{ day.label }}</label>
                <input
                  :id="`setup-start-${day.day_of_week}`"
                  v-model="day.starts_at"
                  type="time"
                  step="1"
                  :disabled="!day.enabled"
                  :required="day.enabled"
                />
              </div>
              <div class="field">
                <label :for="`setup-end-${day.day_of_week}`">Завершення · {{ day.label }}</label>
                <input
                  :id="`setup-end-${day.day_of_week}`"
                  v-model="day.ends_at"
                  type="text"
                  placeholder="22:00"
                  :disabled="!day.enabled"
                  :required="day.enabled"
                />
              </div>
            </div>
          </fieldset>
          <details class="availability-summary">
            <summary>Підсумок вибраного графіка</summary>
            <p>{{ setup.summary.value || 'Жодного дня не вибрано.' }}</p>
          </details>
          <p class="helper">
            Заняття за університетським розкладом та вже заплановані навчальні сесії автоматично
            виключаються з доступного часу.
          </p>
          <p v-if="setup.localError.value" class="field-error" role="alert">
            {{ setup.localError.value }}
          </p>
          <template v-if="setup.selection.value">
            <p role="status">
              Підтверджено інтервалів: {{ setup.saved.value }} із
              {{ setup.selection.value.length }}.
            </p>
            <p v-if="setup.complete.value" role="status">Вибраний графік доступності збережено.</p>
            <p v-else-if="setup.paused.value" class="planning-warning" role="status">
              Збереження зупинено{{ setup.failedDay.value ? `: ${setup.failedDay.value}` : '' }}.
              {{ setup.saved.value ? 'Частину графіка вже збережено.' : '' }}
              {{ !setup.verified.value ? 'Поточний стан сервера не вдалося перевірити.' : '' }}
              Результат останнього запиту може потребувати перевірки. Автоматичного повтору немає.
              Натисніть «Перевірити й зберегти решту», щоб перечитати доступність і додати лише
              відсутні інтервали.
            </p>
          </template>
          <FormNotice :error="setup.error.value" />
          <div class="actions">
            <AppButton
              v-if="!setup.complete.value"
              type="submit"
              variant="primary"
              :busy="setup.busy.value"
              :disabled="busy"
            >
              {{ setup.selection.value ? 'Перевірити й зберегти решту' : 'Зберегти доступність' }}
            </AppButton>
            <AppButton
              v-if="setup.selection.value"
              :disabled="setup.busy.value"
              @click="setup.finish"
            >
              {{ setup.complete.value ? 'Закрити підсумок' : 'Завершити налаштування пізніше' }}
            </AppButton>
          </div>
        </form>
      </AppCard>
      <RouterLink
        v-if="resource.data.value.data.length"
        to="/planning/preview"
        class="button primary availability-plan-link"
      >
        Створити новий огляд плану
      </RouterLink>
      <div class="availability-preferences helper">
        <p v-if="unsetPreferences.length">
          Не задано користувацькі обмеження для:
          {{ unsetPreferences.join(', ').toLocaleLowerCase('uk-UA') }}. Для цих параметрів
          користувацькі обмеження відсутні.
        </p>
        <ErrorState
          v-if="preferences.error.value"
          :error="preferences.error.value"
          retry
          @retry="preferences.reload"
        />
        <RouterLink to="/planning/preferences">Переглянути вподобання навчання</RouterLink>
      </div>
      <div v-if="resource.data.value.data.length" class="availability-week">
        <AppCard v-for="(label, index) in weekdays" :key="label" :title="label">
          <p
            v-if="!resource.data.value?.data.some((w) => w.day_of_week === index + 1)"
            class="helper"
          >
            Час для навчання ще не вказано.
          </p>
          <article
            v-for="window in resource.data.value?.data.filter((w) => w.day_of_week === index + 1)"
            :key="window.id"
            class="availability-window"
          >
            <p>{{ wallTimeLabel(window.starts_at) }} — {{ wallTimeLabel(window.ends_at) }}</p>
            <div class="actions">
              <AppButton
                :aria-label="`Редагувати: ${label}, ${wallTimeLabel(window.starts_at)}–${wallTimeLabel(window.ends_at)}`"
                :disabled="setup.busy.value"
                @click="edit(window)"
              >
                Редагувати
              </AppButton>
              <AppButton
                variant="danger"
                :aria-label="`Видалити: ${label}, ${wallTimeLabel(window.starts_at)}–${wallTimeLabel(window.ends_at)}`"
                :disabled="setup.busy.value"
                @click="askDelete(window)"
              >
                Видалити
              </AppButton>
            </div>
          </article>
          <AppButton
            class="week-add"
            :aria-label="`Додати час: ${label}`"
            :disabled="setup.busy.value"
            @click="edit(undefined, index + 1)"
          >
            + Додати час
          </AppButton>
        </AppCard>
      </div>
    </template>
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
            hint="Наприклад, 18:30. Для кінця дня — 24:00."
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
      {{ weekdays[deleting.day_of_week - 1] }}: {{ deleting.starts_at }} — {{ deleting.ends_at }}.
      Це змінить доступність для наступних планувань.
    </ConfirmDialog>
  </div>
</template>
