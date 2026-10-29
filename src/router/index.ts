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
        path: '/ai',
        component: () => import('@/views/AiView.vue'),
        meta: { title: 'AI-помічник' },
      },
      {
        path: '/ai/conversations/:id(\\d+)',
        component: () => import('@/views/AiView.vue'),
        meta: { title: 'AI-помічник' },
      },
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
        path: '/planning',
        component: () => import('@/views/PlanningView.vue'),
        meta: { title: 'Планування' },
      },
      {
        path: '/planning/preferences',
        component: () => import('@/views/PlanningSettingsView.vue'),
        meta: { title: 'Вподобання навчання' },
      },
      {
        path: '/planning/availability',
        component: () => import('@/views/AvailabilityView.vue'),
        meta: { title: 'Доступність' },
      },
      {
        path: '/planning/free-time',
        component: () => import('@/views/FreeTimeView.vue'),
        meta: { title: 'Вільний час' },
      },
      {
        path: '/planning/preview',
        component: () => import('@/views/PlanPreviewView.vue'),
        meta: { title: 'Новий план' },
      },
      {
        path: '/planning/replanning',
        component: () => import('@/views/PlanPreviewView.vue'),
        meta: { title: 'Перепланування' },
      },
      {
        path: '/planning/sessions',
        component: () => import('@/views/StudySessionsView.vue'),
        meta: { title: 'Навчальні сесії' },
      },
      {
        path: '/planning/sessions/:id(\\d+)',
        component: () => import('@/views/StudySessionView.vue'),
        meta: { title: 'Навчальна сесія' },
      },
      { path: '/academic', redirect: '/academic/institutions' },
      {
        path: '/academic/:section(institutions|periods|subjects|teachers)',
        component: () => import('@/views/AcademicView.vue'),
        meta: { title: 'Навчання' },
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
