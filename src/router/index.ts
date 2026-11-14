import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import type { Pinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import {
  capturePasswordResetLink,
  clearPasswordResetLink,
  prepareInitialPasswordResetLink,
} from '@/utils/passwordResetLink'
export function safeRedirect(value: unknown) {
  return typeof value === 'string' &&
    /^\/(?![\/\\])/.test(value) &&
    !/[\u0000-\u0020\u007f\\]/u.test(value) &&
    !value.startsWith('/login') &&
    !value.startsWith('/register') &&
    !value.startsWith('/forgot-password') &&
    !value.startsWith('/reset-password')
    ? value
    : '/'
}
export function makeRouter(history?: RouterHistory, pinia?: Pinia) {
  prepareInitialPasswordResetLink()
  const auth = useAuthStore(pinia)
  let resetLinkVersion = 0
  const router = createRouter({
    history: history ?? createWebHistory(),
    scrollBehavior: () => ({ top: 0 }),
    routes: [
      {
        path: '/login',
        component: () => import('@/views/LoginView.vue'),
        meta: { public: true, title: 'Вхід' },
      },
      {
        path: '/forgot-password',
        component: () => import('@/views/ForgotPasswordView.vue'),
        meta: { public: true, allowAuthenticated: true, title: 'Відновлення пароля' },
      },
      {
        path: '/reset-password',
        component: () => import('@/views/ResetPasswordView.vue'),
        meta: { public: true, allowAuthenticated: true, title: 'Скидання пароля' },
      },
      {
        path: '/verify-email',
        component: () => import('@/views/VerifyEmailView.vue'),
        meta: { public: true, allowAuthenticated: true, title: 'Підтвердження email' },
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
        path: '/schedule/semester-calendar',
        component: () => import('@/views/SemesterCalendarView.vue'),
        meta: { title: 'Семестрові розклади' },
      },
      {
        path: '/planning/suggestions/:uuid',
        component: () => import('@/views/RecoverySuggestionsView.vue'),
        meta: { title: 'Огляд відновлення навчання' },
      },
      {
        path: '/planning/suggestions',
        component: () => import('@/views/RecoverySuggestionsView.vue'),
        meta: { title: 'Потребує уваги' },
      },
      {
        path: '/schedule/legacy',
        component: () => import('@/views/LegacyScheduleView.vue'),
        meta: { title: 'Окремі заняття' },
      },
      {
        path: '/schedule/semesters/new',
        component: () => import('@/views/SemesterSettingsView.vue'),
        meta: { title: 'Новий семестровий розклад' },
      },
      {
        path: '/schedule/semesters/:id(\\d+)',
        component: () => import('@/views/SemesterManagementView.vue'),
        meta: { title: 'Редагувати семестровий розклад' },
      },
      {
        path: '/schedule/semesters/:id(\\d+)/weekdays/:weekday([1-5])',
        component: () => import('@/views/SemesterRuleView.vue'),
        meta: { title: 'Редагування дня тижня' },
      },
      {
        path: '/schedule/semesters/:id(\\d+)/import-settings',
        component: () => import('@/views/SemesterImportSettingsView.vue'),
        meta: { title: 'Налаштування імпорту' },
      },
      {
        path: '/schedule/semesters/:id(\\d+)/settings',
        component: () => import('@/views/SemesterSettingsView.vue'),
        meta: { title: 'Налаштування семестру' },
      },
      {
        path: '/schedule/semesters/:id(\\d+)/rules/new',
        component: () => import('@/views/SemesterRuleView.vue'),
        meta: { title: 'Нове регулярне заняття' },
      },
      {
        path: '/schedule/semesters/:id(\\d+)/rules/:rule(\\d+)',
        component: () => import('@/views/SemesterRuleView.vue'),
        meta: { title: 'Редагування регулярного заняття' },
      },
      {
        path: '/schedule/semesters/:id(\\d+)/dates/:date',
        component: () => import('@/views/SemesterDateView.vue'),
        meta: { title: 'Розклад на окрему дату' },
      },
      {
        path: '/schedule/semester-import',
        component: () => import('@/views/SemesterImportView.vue'),
        meta: { title: 'Імпорт семестрового розкладу' },
      },
      {
        path: '/schedule/semester-imports/:id(\\d+)',
        component: () => import('@/views/SemesterImportDetailView.vue'),
        meta: { title: 'Огляд семестрового імпорту' },
      },
      {
        path: '/schedule/lessons/new',
        component: () => import('@/views/LessonEditorView.vue'),
        meta: { title: 'Нове заняття' },
      },
      {
        path: '/schedule/lessons/:id(\\d+)',
        component: () => import('@/views/LessonEditorView.vue'),
        meta: { title: 'Заняття' },
      },
      {
        path: '/schedule/lessons/:id(\\d+)/edit',
        component: () => import('@/views/LessonEditorView.vue'),
        meta: { title: 'Редагування заняття' },
      },
      {
        path: '/schedule/lessons/:id(\\d+)/replacement',
        redirect: (to) => `/schedule/lessons/${to.params.id}`,
        meta: { title: 'Заміна заняття' },
      },
      {
        path: '/schedule/import',
        redirect: '/schedule/legacy',
        meta: { title: 'Імпорт Excel' },
      },
      {
        path: '/schedule/imports/:id(\\d+)',
        redirect: (to) => `/schedule/import-history/${to.params.id}`,
      },
      {
        path: '/schedule/import-history/:id(\\d+)',
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
        meta: { title: 'Деталі завдання' },
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
        path: '/planning/workload',
        component: () => import('@/views/WorkloadAdviceView.vue'),
        meta: { title: 'Аналіз навчального навантаження' },
      },
      {
        path: '/planning/preview',
        component: () => import('@/views/PlanPreviewView.vue'),
        meta: { title: 'Новий план' },
      },
      {
        path: '/planning/recovery',
        component: () => import('@/views/PlanPreviewView.vue'),
        meta: { title: 'Відновлення невиконаної роботи' },
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
    if (to.path === '/reset-password' && (Object.keys(to.query).length || to.hash)) {
      capturePasswordResetLink(to.query)
      // Force a clean navigation even when another reset link is opened on this same page.
      // Guard redirects inherit the original navigation's force flag in Vue Router.
      await router.replace({ path: '/reset-password', force: true })
      return false
    }
    if (to.path === '/reset-password') to.meta.resetLinkVersion = ++resetLinkVersion
    await auth.initialize()
    if (auth.bootstrapError) return true
    if (!to.meta.public && !auth.authenticated)
      return { path: '/login', query: { redirect: to.fullPath } }
    if (to.meta.public && !to.meta.allowAuthenticated && auth.authenticated)
      return safeRedirect(to.query.redirect)
  })
  router.afterEach((to) => {
    if (to.path !== '/reset-password') clearPasswordResetLink()
    document.title = `${String(to.meta.title ?? 'Student AI Planner')} · Student AI Planner`
  })
  return router
}
