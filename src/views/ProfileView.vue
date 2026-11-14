<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { ApiError, fieldErrors } from '@/api/client'
import { accountApi } from '@/api/endpoints'
import { emailVerificationApi } from '@/api/emailVerification'
import { useEmailVerificationFeedback } from '@/composables/useEmailVerificationFeedback'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import type { SessionReminderSettings } from '@/types/api'
import NewPasswordFields from '@/components/ui/NewPasswordFields.vue'
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
const passwords = reactive({ current_password: '', password: '', password_confirmation: '' })
const passwordBusy = ref(false)
const passwordError = ref<unknown>(null)
const passwordSuccess = ref(false)
const passwordErrors = computed(() => fieldErrors(passwordError.value))
const verificationBusy = ref(false),
  verificationSent = ref(false)
const {
  message: verificationError,
  retryIn,
  clearError: clearVerificationError,
  fail: verificationFailed,
} = useEmailVerificationFeedback()
const verificationController = new AbortController()
onUnmounted(() => verificationController.abort())
watch(
  () => auth.user?.email,
  () => {
    verificationSent.value = false
    clearVerificationError()
  },
)
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
    await auth.update({ ...reminderSettings })
    reminderSuccess.value = 'Налаштування нагадувань збережено.'
  } catch (reason) {
    reminderError.value = reason
  } finally {
    reminderBusy.value = false
  }
}
const accountBusy = computed(
  () => busy.value || passwordBusy.value || verificationBusy.value || reminderBusy.value,
)
async function requestVerification() {
  if (
    accountBusy.value ||
    retryIn.value ||
    auth.csrfFailure ||
    auth.user?.email_verified ||
    form.email !== auth.user?.email
  )
    return
  const email = auth.user.email
  verificationBusy.value = true
  verificationSent.value = false
  clearVerificationError()
  try {
    await emailVerificationApi.send(verificationController.signal)
    if (!verificationController.signal.aborted && auth.user?.email === email)
      verificationSent.value = true
  } catch (reason) {
    if (!verificationController.signal.aborted) verificationFailed(reason)
  } finally {
    verificationBusy.value = false
  }
}
function clearPasswords() {
  passwords.current_password = ''
  passwords.password = ''
  passwords.password_confirmation = ''
}
onUnmounted(clearPasswords)
async function changePassword() {
  if (accountBusy.value) return
  passwordError.value = null
  passwordSuccess.value = false
  if (passwords.password !== passwords.password_confirmation) {
    passwordError.value = new ApiError(422, { password_confirmation: ['Паролі не збігаються.'] })
    return
  }
  passwordBusy.value = true
  try {
    await accountApi.changePassword({ ...passwords })
    clearPasswords()
    passwordSuccess.value = true
  } catch (e) {
    passwordError.value = e
  } finally {
    passwordBusy.value = false
  }
}
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
        <p class="muted">Профіль та вигляд застосунку.</p>
      </div>
    </header>
    <nav class="section-nav" aria-label="Налаштування простору">
      <a href="#profile-data">Профіль</a>
      <a href="#session-reminders">Нагадування про сесії</a>
      <a href="#account-security">Безпека</a>
      <a href="#appearance">Вигляд</a>
      <RouterLink to="/planning/preferences">Навчальні вподобання</RouterLink>
      <RouterLink to="/academic">Предмети та заклади</RouterLink>
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
                <AppButton variant="primary" type="submit" :busy="busy" :disabled="passwordBusy">
                  Зберегти профіль
                </AppButton>
              </div>
            </div>
          </fieldset>
        </form>
      </AppCard>
      <div class="stack">
        <AppCard title="Підтвердження email" class="email-verification-status">
          <p>{{ auth.user?.email }}</p>
          <p class="badge" :class="auth.user?.email_verified ? 'success' : 'warning'">
            {{ auth.user?.email_verified ? 'Email підтверджено' : 'Email не підтверджено' }}
          </p>
          <template v-if="!auth.user?.email_verified">
            <p v-if="form.email !== auth.user?.email" class="helper">
              Збережіть нову адресу, щоб запросити лист для неї.
            </p>
            <div class="actions">
              <AppButton
                :busy="verificationBusy"
                :disabled="
                  accountBusy || auth.csrfFailure || retryIn > 0 || form.email !== auth.user?.email
                "
                @click="requestVerification"
              >
                Надіслати лист підтвердження
              </AppButton>
            </div>
          </template>
          <p v-if="verificationSent" class="success-notice" role="status">
            Лист підтвердження запитано. Перевірте пошту.
          </p>
          <p v-if="verificationError" class="field-error" role="alert">{{ verificationError }}</p>
          <p v-if="retryIn" class="helper" role="status">Спробуйте через {{ retryIn }} с.</p>
        </AppCard>
        <AppCard id="session-reminders" title="Нагадування про сесії">
          <p class="helper">Налаштування застосовуються до нових навчальних сесій.</p>
          <p id="session-reminder-timing" class="helper">
            Якщо час нагадування вже минув, сповіщення не надійде
          </p>
          <form class="stack" @submit.prevent="saveReminders">
            <FormNotice :error="reminderError" />
            <fieldset :disabled="accountBusy" class="stack">
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
              <FormField
                id="reminder-email-consent"
                label="Дозволити поштові нагадування"
                :errors="reminderErrors.reminder_email_enabled"
                v-slot="f"
              >
                <input
                  :id="f.id"
                  v-model="reminderSettings.reminder_email_enabled"
                  type="checkbox"
                  :disabled="!auth.user?.email_verified"
                  :aria-invalid="f.invalid"
                  :aria-describedby="f.describedby"
                />
              </FormField>
              <FormField
                id="session-reminder-email"
                label="На пошту"
                :errors="reminderErrors.session_reminder_email_enabled"
                :hint="
                  !auth.user?.email_verified
                    ? 'Підтвердьте поточну email-адресу, щоб увімкнути пошту. Нагадування у застосунку доступні.'
                    : !reminderSettings.reminder_email_enabled
                      ? 'Увімкніть згоду «Дозволити поштові нагадування». Нагадування у застосунку доступні.'
                      : undefined
                "
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
              <FormField
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
        <AppCard title="Як організувати навчання">
          <div class="planning-shortcuts">
            <RouterLink to="/planning/preferences">
              <strong>Тривалість і перерви</strong>
              <span>Комфортне навантаження</span>
            </RouterLink>
            <RouterLink to="/planning/availability">
              <strong>Час для навчання</strong>
              <span>Дні та вільні години</span>
            </RouterLink>
          </div>
        </AppCard>
        <AppCard id="account-security" title="Зміна пароля">
          <p class="muted">Поточний сеанс залишиться активним. Інші сеанси буде завершено.</p>
          <p v-if="passwordSuccess" class="success-notice" role="status">Пароль змінено.</p>
          <form class="stack" @submit.prevent="changePassword">
            <FormNotice :error="passwordError" />
            <p
              v-if="
                passwordError instanceof ApiError &&
                (passwordError.status === 0 || passwordError.status >= 500)
              "
              class="helper"
            >
              Пароль міг змінитися. Перед повторною зміною перевірте вхід із новим паролем в іншій
              вкладці.
            </p>
            <fieldset :disabled="accountBusy" class="stack">
              <FormField
                id="current-password"
                label="Поточний пароль"
                :errors="passwordErrors.current_password"
                v-slot="f"
              >
                <input
                  :id="f.id"
                  v-model="passwords.current_password"
                  type="password"
                  autocomplete="current-password"
                  required
                  :aria-invalid="f.invalid"
                  :aria-describedby="f.describedby"
                />
              </FormField>
              <NewPasswordFields
                prefix="change"
                v-model:password="passwords.password"
                v-model:confirmation="passwords.password_confirmation"
                :errors="passwordErrors"
              />
              <AppButton type="submit" variant="primary" :busy="passwordBusy" :disabled="busy">
                Змінити пароль
              </AppButton>
            </fieldset>
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
          <AppButton :busy="busy" :disabled="passwordBusy" @click="logout">Вийти</AppButton>
        </AppCard>
      </div>
    </div>
  </div>
</template>
