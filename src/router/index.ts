import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import type { Pinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
export function safeRedirect(value: unknown) {
  return typeof value === 'string' &&
    /^\/(?![\/\\])/.test(value) &&
    !/[\u0000-\u0020\u007f\\]/u.test(value) &&
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
        path: '/schedule/lessons/new',
        component: () => import('@/views/LessonEditorView.vue'),
        meta: { title: 'Нове заняття' },
      },
      {
        path: '/schedule/lessons/:id(\\d+)',
        component: () => import('@/views/LessonDetailView.vue'),
        meta: { title: 'Заняття' },
      },
      {
        path: '/schedule/lessons/:id(\\d+)/edit',
        component: () => import('@/views/LessonEditorView.vue'),
        meta: { title: 'Редагування заняття' },
      },
      {
        path: '/schedule/lessons/:id(\\d+)/replacement',
        component: () => import('@/views/LessonEditorView.vue'),
        meta: { title: 'Заміна заняття' },
      },
      {
        path: '/schedule/import',
        component: () => import('@/views/ScheduleImportView.vue'),
        meta: { title: 'Імпорт Excel' },
      },
      {
        path: '/schedule/imports/:id(\\d+)',
        component: () => import('@/views/ScheduleImportDetailView.vue'),
        meta: { title: 'Огляд імпорту' },
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
      {
        path: '/reminders',
        component: () => import('@/views/RemindersView.vue'),
        meta: { title: 'Нагадування' },
      },
      {
        path: '/reminders/new',
        component: () => import('@/views/ReminderEditorView.vue'),
        meta: { title: 'Нове нагадування' },
      },
      {
        path: '/reminders/:id(\\d+)',
        component: () => import('@/views/ReminderDetailView.vue'),
        meta: { title: 'Нагадування' },
      },
      {
        path: '/reminders/:id(\\d+)/edit',
        component: () => import('@/views/ReminderEditorView.vue'),
        meta: { title: 'Редагування нагадування' },
      },
      {
        path: '/inbox',
        component: () => import('@/views/InboxView.vue'),
        meta: { title: 'Вхідні сповіщення' },
      },
      {
        path: '/statistics',
        component: () => import('@/views/StatisticsView.vue'),
        meta: { title: 'Статистика' },
      },
      {
        path: '/statistics/trends',
        component: () => import('@/views/StatisticsView.vue'),
        meta: { title: 'Тренди' },
      },
      {
        path: '/statistics/comparison',
        component: () => import('@/views/ComparisonView.vue'),
        meta: { title: 'Порівняння' },
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
