import '@fontsource/manrope/400.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import './styles/main.css'
import './styles/ai.css'
import './styles/planning.css'
import './styles/schedule.css'
import './styles/activity.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { setAuthErrorHandler } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { makeRouter } from '@/router'
import App from './App.vue'
const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
const router = makeRouter(undefined, pinia)
const auth = useAuthStore(pinia)
setAuthErrorHandler((status) => {
  auth.handleAuthError(status)
  if (
    status === 401 &&
    router.currentRoute.value.matched.length &&
    !router.currentRoute.value.meta.public
  )
    void router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
})
app.use(router)
app.mount('#app')
