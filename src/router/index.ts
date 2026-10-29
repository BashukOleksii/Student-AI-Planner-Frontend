import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import type { Pinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
export function safeRedirect(value: unknown) {
  return typeof value === 'string' &&
    /^\/(?![\/\\])/.test(value) &&
    !value.startsWith('/login') &&
    !value.startsWith('/register')
    ? value
    : '/'
}
export function makeRouter(history: RouterHistory = createWebHistory(), pinia?: Pinia) {
  const auth = useAuthStore(pinia)
  const router = createRouter({
    history,
    scrollBehavior: () => ({ top: 0 }),
    routes: [
      {
        path: '/login',
        component: () => import('@/views/LoginView.vue'),
        meta: { public: true, title: 'Вхід' },
      },
      {
        path: '/register',
        component: () => import('@/views/RegisterView.vue'),
        meta: { public: true, title: 'Реєстрація' },
      },
      { path: '/', component: () => import('@/views/DashboardView.vue'), meta: { title: 'Огляд' } },
      {
        path: '/schedule',
        component: () => import('@/views/ScheduleView.vue'),
        meta: { title: 'Розклад' },
      },
      {
        path: '/tasks',
        component: () => import('@/views/TasksView.vue'),
        meta: { title: 'Завдання' },
      },
      {
        path: '/tasks/new',
        component: () => import('@/views/TaskEditorView.vue'),
        meta: { title: 'Нове завдання' },
      },
      {
        path: '/tasks/:id(\\d+)',
        component: () => import('@/views/TaskEditorView.vue'),
        meta: { title: 'Редагування завдання' },
      },
      {
        path: '/profile',
        component: () => import('@/views/ProfileView.vue'),
        meta: { title: 'Налаштування' },
      },
      {
        path: '/:pathMatch(.*)*',
        component: () => import('@/views/NotFoundView.vue'),
        meta: { title: 'Сторінку не знайдено' },
      },
    ],
  })
  router.beforeEach(async (to) => {
    await auth.initialize()
    if (auth.bootstrapError) return true
    if (!to.meta.public && !auth.authenticated)
      return { path: '/login', query: { redirect: to.fullPath } }
    if (to.meta.public && auth.authenticated) return safeRedirect(to.query.redirect)
  })
  router.afterEach((to) => {
    document.title = `${String(to.meta.title ?? 'Student AI Planner')} · Student AI Planner`
  })
  return router
}
