<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { fieldErrors } from '@/api/client'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import type { SessionReminderSettings } from '@/types/api'
const auth = useAuthStore()
const theme = useThemeStore()
const router = useRouter()
const form = reactive({
  name: auth.user?.name ?? '',
  email: auth.user?.email ?? '',
  timezone: auth.user?.timezone ?? 'UTC',
})
const busy = ref(false)
const error = ref<unknown>(null)
const success = ref('')
const errors = computed(() => fieldErrors(error.value))
const reminderBusy = ref(false)
const reminderError = ref<unknown>(null)
const reminderSuccess = ref('')
const reminderErrors = computed(() => fieldErrors(reminderError.value))
function savedReminderSettings(): SessionReminderSettings {
  return {
    reminder_email_enabled: auth.user?.reminder_email_enabled ?? false,
    session_reminder_in_app_enabled: auth.user?.session_reminder_in_app_enabled ?? false,
    session_reminder_email_enabled: auth.user?.session_reminder_email_enabled ?? false,
    session_reminder_lead_minutes: auth.user?.session_reminder_lead_minutes ?? 10,
  }
}
const reminderSettings = reactive(savedReminderSettings())
const reminderDirty = computed(() => {
  const saved = savedReminderSettings()
  return (Object.keys(saved) as (keyof SessionReminderSettings)[]).some(
    (key) => reminderSettings[key] !== saved[key],
  )
})
const emailUnavailable = computed(
  () => !auth.user?.email_verified || !reminderSettings.reminder_email_enabled,
)
watch(
  () => [auth.user?.email_verified, reminderSettings.reminder_email_enabled],
  () => {
    if (emailUnavailable.value) reminderSettings.session_reminder_email_enabled = false
  },
  { flush: 'sync' },
)
watch(
  () => auth.user,
  () => {
    Object.assign(reminderSettings, savedReminderSettings())
  },
)
watch(reminderSettings, () => {
  reminderSuccess.value = ''
})
async function saveReminders() {
  if (accountBusy.value) return
  reminderBusy.value = true
  reminderError.value = null
  reminderSuccess.value = ''
  try {
    await auth.update({
      ...reminderSettings,
      session_reminder_email_enabled:
        !emailUnavailable.value && reminderSettings.session_reminder_email_enabled,
    })
    reminderSuccess.value = 'Налаштування нагадувань збережено.'
  } catch (reason) {
    reminderError.value = reason
  } finally {
    reminderBusy.value = false
  }
}
const accountBusy = computed(() => busy.value || reminderBusy.value)
const dirty = computed(
  () =>
    form.name !== auth.user?.name ||
    form.email !== auth.user?.email ||
    form.timezone !== auth.user?.timezone,
)
const zones = Intl.supportedValuesOf('timeZone')
if (!zones.includes('Europe/Kyiv')) zones.push('Europe/Kyiv')
if (!zones.includes('UTC')) zones.unshift('UTC')
onBeforeRouteLeave(
  () =>
    !auth.user ||
    !(dirty.value || reminderDirty.value) ||
    window.confirm('Залишити сторінку без збереження профілю?'),
)
async function submit() {
  if (accountBusy.value) return
  busy.value = true
  success.value = ''
  error.value = null
  try {
    await auth.update({ ...form })
    success.value = 'Профіль збережено.'
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
async function logout() {
  if (accountBusy.value) return
  busy.value = true
  error.value = null
  try {
    await auth.logout()
    await router.replace('/login')
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="page-workspace page-settings">
    <header class="page-heading">
      <div>
        <p class="eyebrow">ВАШ ОСОБИСТИЙ ПРОСТІР</p>
        <h1>Налаштування</h1>
        <p class="muted">Профіль, нагадування та вигляд застосунку.</p>
      </div>
      <RouterLink to="/profile/security" class="button secondary">
        Безпека облікового запису
      </RouterLink>
    </header>
    <nav class="section-nav" aria-label="Налаштування простору">
      <a href="#profile-data">Профіль</a>
      <a href="#session-reminders">Нагадування про сесії</a>
      <a href="#appearance">Вигляд</a>
    </nav>
    <div class="settings-grid">
      <AppCard id="profile-data" title="Особисті дані">
        <p v-if="success" class="success-notice" role="status">{{ success }}</p>
        <FormNotice :error="error" />
        <form class="stack" @submit.prevent="submit">
          <fieldset :disabled="accountBusy">
            <div class="stack">
              <FormField id="profile-name" label="Ім’я" :errors="errors.name" v-slot="f">
                <input
                  :id="f.id"
                  v-model="form.name"
                  autocomplete="name"
                  required
                  maxlength="255"
                  :aria-invalid="f.invalid"
                  :aria-describedby="f.describedby"
                />
              </FormField>
              <FormField
                id="profile-email"
                label="Електронна пошта"
                :errors="errors.email"
                v-slot="f"
              >
                <input
                  :id="f.id"
                  v-model="form.email"
                  type="email"
                  autocomplete="email"
                  required
                  maxlength="255"
                  :aria-invalid="f.invalid"
                  :aria-describedby="f.describedby"
                />
              </FormField>
              <FormField
                id="profile-timezone"
                label="Часовий пояс"
                hint="Визначає дати розкладу, статистики та місцевий час дедлайнів."
                :errors="errors.timezone"
                v-slot="f"
              >
                <input
                  :id="f.id"
                  v-model="form.timezone"
                  list="timezones"
                  required
                  maxlength="64"
                  :aria-invalid="f.invalid"
                  :aria-describedby="f.describedby"
                />
                <datalist id="timezones">
                  <option v-for="zone in zones" :key="zone" :value="zone" />
                </datalist>
              </FormField>
              <div>
                <AppButton variant="primary" type="submit" :busy="busy" :disabled="reminderBusy">
                  Зберегти профіль
                </AppButton>
              </div>
            </div>
          </fieldset>
        </form>
      </AppCard>
      <div class="stack">
        <AppCard id="session-reminders" title="Нагадування про сесії">
          <p class="helper">Налаштування застосовуються до нових навчальних сесій.</p>
          <p id="session-reminder-timing" class="helper">
            Якщо час нагадування вже минув, сповіщення не надійде
          </p>
          <form class="stack" @submit.prevent="saveReminders">
            <FormNotice :error="reminderError" />
            <fieldset :disabled="accountBusy" class="stack">
              <section class="stack" aria-label="Поштові нагадування">
                <FormField
                  id="reminder-email-consent"
                  label="Нагадування на пошту"
                  hint="Загальна згода на поштові нагадування, зокрема ручні."
                  :errors="reminderErrors.reminder_email_enabled"
                  v-slot="f"
                >
                  <input
                    :id="f.id"
                    v-model="reminderSettings.reminder_email_enabled"
                    type="checkbox"
                    role="switch"
                    :disabled="!auth.user?.email_verified"
                    :aria-invalid="f.invalid"
                    :aria-describedby="
                      [
                        f.describedby,
                        !auth.user?.email_verified ? 'email-reminders-unavailable' : '',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    "
                  />
                </FormField>
                <p
                  v-if="!auth.user?.email_verified"
                  id="email-reminders-unavailable"
                  class="helper"
                >
                  Пошта недоступна, доки адресу не підтверджено. Нагадування у застосунку доступні.
                  <RouterLink to="/profile/security" class="text-link">
                    Підтвердити email
                  </RouterLink>
                </p>
                <div v-if="reminderSettings.reminder_email_enabled" class="session-email-option">
                  <FormField
                    id="session-reminder-email"
                    label="Надсилати нагадування про сесії"
                    :errors="reminderErrors.session_reminder_email_enabled"
                    v-slot="f"
                  >
                    <input
                      :id="f.id"
                      v-model="reminderSettings.session_reminder_email_enabled"
                      type="checkbox"
                      role="switch"
                      :disabled="emailUnavailable"
                      :aria-invalid="f.invalid"
                      :aria-describedby="f.describedby"
                    />
                  </FormField>
                </div>
              </section>
              <section class="stack" aria-labelledby="session-channels-title">
                <h3 id="session-channels-title">Нагадування про сесії</h3>
                <FormField
                  id="session-reminder-in-app"
                  label="У застосунку"
                  :errors="reminderErrors.session_reminder_in_app_enabled"
                  v-slot="f"
                >
                  <input
                    :id="f.id"
                    v-model="reminderSettings.session_reminder_in_app_enabled"
                    type="checkbox"
                    role="switch"
                    :aria-invalid="f.invalid"
                    :aria-describedby="f.describedby"
                  />
                </FormField>
              </section>
              <FormField
                v-if="
                  reminderSettings.session_reminder_in_app_enabled ||
                  reminderSettings.session_reminder_email_enabled
                "
                id="session-reminder-lead"
                label="За скільки хвилин до початку"
                :errors="reminderErrors.session_reminder_lead_minutes"
                hint="Від 1 до 65535 хвилин. Спільне значення для обох каналів."
                v-slot="f"
              >
                <input
                  :id="f.id"
                  v-model.number="reminderSettings.session_reminder_lead_minutes"
                  type="number"
                  min="1"
                  max="65535"
                  step="1"
                  required
                  :aria-invalid="f.invalid"
                  :aria-describedby="f.describedby"
                />
              </FormField>
              <AppButton
                type="submit"
                variant="primary"
                :busy="reminderBusy"
                :disabled="!reminderDirty"
              >
                Зберегти нагадування
              </AppButton>
            </fieldset>
            <p role="status" aria-live="polite">
              {{
                reminderBusy
                  ? 'Збереження…'
                  : reminderSuccess || (reminderDirty ? 'Є незбережені зміни.' : '')
              }}
            </p>
          </form>
        </AppCard>
        <AppCard id="appearance" title="Вигляд застосунку">
          <p class="muted">Оберіть комфортну для вас тему.</p>
          <div class="theme-options">
            <button :aria-pressed="theme.theme === 'light'" @click="theme.setTheme('light')">
              <span class="theme-swatch light"></span>
              Світла
            </button>
            <button :aria-pressed="theme.theme === 'dark'" @click="theme.setTheme('dark')">
              <span class="theme-swatch dark"></span>
              Темна
            </button>
          </div>
          <p class="helper">Зберігається лише в цьому браузері.</p>
        </AppCard>
        <AppCard title="Обліковий запис">
          <p class="muted">Завершити поточний сеанс на цьому пристрої.</p>
          <AppButton :busy="busy" :disabled="reminderBusy" @click="logout">Вийти</AppButton>
        </AppCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-email-option {
  margin-inline-start: 12px;
  padding: 16px;
  border-inline-start: 2px solid var(--border);
  background: var(--surface-secondary, transparent);
  border-radius: 8px;
}
</style>
