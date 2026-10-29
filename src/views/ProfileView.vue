<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { fieldErrors } from '@/api/client'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
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
  () => !auth.user || !dirty.value || window.confirm('Залишити сторінку без збереження профілю?'),
)
async function submit() {
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
  <header class="page-heading">
    <div>
      <p class="eyebrow">ВАШ ОСОБИСТИЙ ПРОСТІР</p>
      <h1>Налаштування</h1>
      <p class="muted">Профіль та вигляд застосунку.</p>
    </div>
  </header>
  <div class="settings-grid">
    <AppCard title="Особисті дані">
      <p v-if="success" class="success-notice" role="status">{{ success }}</p>
      <FormNotice :error="error" />
      <form class="stack" @submit.prevent="submit">
        <fieldset :disabled="busy">
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
              <AppButton variant="primary" type="submit" :busy="busy">Зберегти профіль</AppButton>
            </div>
          </div>
        </fieldset>
      </form>
    </AppCard>
    <div class="stack">
      <AppCard title="Вигляд застосунку">
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
        <AppButton :busy="busy" @click="logout">Вийти</AppButton>
      </AppCard>
    </div>
  </div>
</template>
