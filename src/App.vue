<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import AppLayout from '@/layouts/AppLayout.vue'
import PublicLayout from '@/layouts/PublicLayout.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import AppButton from '@/components/ui/AppButton.vue'
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
useThemeStore().initialize()
const recovering = ref(false)
const recoveryError = ref<unknown>(null)
async function retryBootstrap() {
  await auth.initialize()
  if (!auth.bootstrapError)
    await router.replace({ path: route.path, query: route.query, force: true })
}
async function recover() {
  recovering.value = true
  recoveryError.value = null
  try {
    await auth.recoverSession()
  } catch (e) {
    recoveryError.value = e
  } finally {
    recovering.value = false
  }
}
watch(
  () => route.path,
  () => {
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true }),
    )
  },
)
</script>
<template>
  <div v-if="auth.bootstrapError" class="boot-state">
    <ErrorState :error="auth.bootstrapError" retry @retry="retryBootstrap" />
  </div>
  <LoadingState v-else-if="!auth.initialized || !route.matched.length" />
  <PublicLayout v-else-if="route.meta.public"><RouterView :key="route.path" /></PublicLayout>
  <AppLayout v-else-if="auth.user">
    <div v-if="auth.csrfFailure" class="session-banner" role="alert">
      <p>Перевірка сеансу не вдалася. Дія не повторювалася автоматично.</p>
      <AppButton :busy="recovering" @click="recover">Відновити сеанс</AppButton>
      <ErrorState v-if="recoveryError" :error="recoveryError" />
    </div>
    <RouterView :key="`${auth.user.id}:${route.path}`" />
  </AppLayout>
  <LoadingState v-else />
</template>
