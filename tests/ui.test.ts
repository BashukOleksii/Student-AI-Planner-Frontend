import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import App from '@/App.vue'
import { useAuthStore } from '@/stores/auth'
import { makeRouter } from '@/router'
import { setAuthErrorHandler } from '@/api/client'
import { user, task, progress, lesson, json, page } from './fixtures'
import type { Task } from '@/types/api'

function server(
  options: {
    signedIn?: boolean
    empty?: boolean
    failSchedule?: boolean
    failTaskWrite?: boolean
  } = {},
) {
  let signedIn = options.signedIn ?? true
  let tasks: Task[] = options.empty ? [] : [{ ...task }]
  let currentUser = { ...user }
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname
    const body: Record<string, unknown> = init.body ? JSON.parse(String(init.body)) : {}
    const method = init.method ?? 'GET'
    if (path === '/sanctum/csrf-cookie') return new Response(null, { status: 204 })
    if (path === '/api/auth/login' || path === '/api/auth/register') {
      signedIn = true
      return json({ data: currentUser })
    }
    if (!signedIn) return json({}, 401)
    if (path === '/api/auth/logout') {
      signedIn = false
      return new Response(null, { status: 204 })
    }
    if (path === '/api/profile') {
      if (method === 'PATCH') currentUser = { ...currentUser, ...body }
      return json({ data: currentUser })
    }
    if (path === '/api/subjects')
      return json({
        data: [
          { id: 1, name: 'Математика', code: null, color: null, education_institution_id: null },
        ],
      })
    if (path.startsWith('/api/schedule/'))
      return options.failSchedule
        ? json({}, 503)
        : json({
            data: options.empty ? [] : [lesson],
            meta: {
              timezone: currentUser.timezone,
              start_date: '2026-10-29',
              end_date: path.includes('/week/') ? '2026-11-04' : '2026-10-29',
            },
          })
    if (path === '/api/statistics/progress') return json({ data: progress })
    if (path === '/api/tasks') {
      if (method === 'POST') {
        if (options.failTaskWrite) return json({ errors: { title: ['Назва обов’язкова'] } }, 422)
        const added = { ...task, ...body, id: 2 } as Task
        tasks.push(added)
        return json({ data: added }, 201)
      }
      const filter = new URL(url).searchParams.get('status')
      return json(page(filter ? tasks.filter((t) => t.status === filter) : tasks))
    }
    if (/^\/api\/tasks\/\d+\/subtasks$/.test(path)) return json({ data: [] })
    if (/^\/api\/tasks\/\d+\/progress$/.test(path))
      return json({
        data: { task_id: 1, total_subtasks: 0, completed_subtasks: 0, progress_percent: null },
      })
    const match = path.match(/^\/api\/tasks\/(\d+)(?:\/(complete|reopen))?$/)
    if (match) {
      const index = tasks.findIndex((t) => t.id === Number(match[1]))
      const found = tasks[index]
      if (!found) return json({}, 404)
      if (method === 'DELETE') {
        tasks.splice(index, 1)
        return new Response(null, { status: 204 })
      }
      if (method === 'PATCH') tasks[index] = { ...found, ...body }
      if (match[2])
        tasks[index] = { ...found, status: match[2] === 'complete' ? 'completed' : 'pending' }
      return json({ data: tasks[index] })
    }
    throw new Error(`Unmocked endpoint: ${method} ${path}`)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
async function render(path: string, options: Parameters<typeof server>[0] = {}) {
  const fetch = server(options)
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = makeRouter(createMemoryHistory(), pinia)
  setAuthErrorHandler((status) => {
    const auth = useAuthStore(pinia)
    auth.handleAuthError(status)
    if (
      status === 401 &&
      router.currentRoute.value.matched.length &&
      !router.currentRoute.value.meta.public
    )
      void router.replace('/login')
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router, fetch, auth: useAuthStore(pinia) }
}
describe('functional application with deterministic HTTP responses', () => {
  it('shows dashboard empty states and backend totals without fabricated data', async () => {
    const { wrapper, fetch } = await render('/', { empty: true })
    expect(wrapper.text()).toContain('Вітаємо, Олена')
    expect(wrapper.text()).toContain('Сьогодні немає занять')
    expect(wrapper.text()).toContain('Немає відкритих завдань')
    expect(wrapper.text()).toContain('Статистики ще немає')
    expect(
      fetch.mock.calls.some((c) => c[0].includes('start_date=') && c[0].includes('end_date=')),
    ).toBe(true)
  })
  it('shows dashboard loading state until its schedule resolves', async () => {
    const { wrapper, router, fetch } = await render('/profile')
    let resolve: ((response: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        url.includes('/schedule/')
          ? new Promise<Response>((r) => {
              resolve = r
            })
          : fetch(url, init),
      ),
    )
    await router.push('/')
    await flushPromises()
    expect(wrapper.text()).toContain('Завантажуємо дані')
    resolve?.(
      json({
        data: [],
        meta: { timezone: user.timezone, start_date: '2026-10-29', end_date: '2026-10-29' },
      }),
    )
    await flushPromises()
    expect(wrapper.text()).toContain('Сьогодні немає занять')
  })
  it('shows recoverable read errors and renders actual lesson details', async () => {
    const { wrapper, fetch } = await render('/', { failSchedule: true })
    expect(wrapper.text()).toContain('Сервіс тимчасово недоступний')
    const retry = wrapper.findAll('button').find((b) => b.text() === 'Спробувати ще раз')
    await retry?.trigger('click')
    await flushPromises()
    expect(fetch.mock.calls.filter((c) => c[0].includes('/schedule/today'))).toHaveLength(2)
  })
  it('renders schedule, date navigation and week mode', async () => {
    const { wrapper, fetch } = await render('/schedule')
    expect(wrapper.text()).toContain('Архітектура ПЗ')
    expect(wrapper.text()).toContain('Ірина Коваль')
    expect(wrapper.text()).toContain('Ауд. 301')
    await wrapper.get('[aria-label="Наступний період"]').trigger('click')
    await flushPromises()
    expect(fetch.mock.calls.some((c) => c[0].includes('/schedule/date/'))).toBe(true)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Тиждень')
      ?.trigger('click')
    await flushPromises()
    expect(fetch.mock.calls.some((c) => c[0].includes('/schedule/week/'))).toBe(true)
  })
  it('creates a task with canonical UTC deadline and refreshes list', async () => {
    const { wrapper, router, fetch } = await render('/tasks/new')
    await wrapper.get('#task-title').setValue('Підготувати звіт')
    await wrapper.get('#task-deadline').setValue('2026-11-12T12:30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/tasks'))
    expect(wrapper.text()).toContain('Підготувати звіт')
    const write = fetch.mock.calls.find(
      (c) => c[0].endsWith('/api/tasks') && c[1]?.method === 'POST',
    )
    expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({
      title: 'Підготувати звіт',
      deadline_at: '2026-11-12T10:30:00Z',
      subject_id: null,
    })
    expect(JSON.parse(String(write?.[1]?.body))).not.toHaveProperty('status')
  })
  it('maps task field errors and stays on the form after failure', async () => {
    const { wrapper, router } = await render('/tasks/new', { failTaskWrite: true })
    await wrapper.get('#task-title').setValue('Нове завдання')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tasks/new')
    expect(wrapper.get('#task-title').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Назва обов’язкова')
  })
  it('loads and PATCHes only changed fields, including clearing a nullable deadline', async () => {
    const { wrapper, fetch, router } = await render('/tasks/1')
    expect((wrapper.get('#task-title').element as HTMLInputElement).value).toBe(task.title)
    await wrapper.get('#task-title').setValue('Оновлено')
    await wrapper.get('#task-deadline').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/tasks'))
    const write = fetch.mock.calls.find((c) => c[1]?.method === 'PATCH')
    expect(JSON.parse(String(write?.[1]?.body))).toEqual({ title: 'Оновлено', deadline_at: null })
  })
  it('completes, reopens and confirms deletion with refreshed collection', async () => {
    const { wrapper, fetch } = await render('/tasks')
    const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
    await button('Завершити').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Виконано')
    await button('Відновити').trigger('click')
    await flushPromises()
    expect(fetch.mock.calls.some((c) => c[0].endsWith('/reopen'))).toBe(true)
    await button('Видалити').trigger('click')
    expect(wrapper.find('dialog').exists()).toBe(true)
    expect(fetch.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false)
    await wrapper.get('dialog button.secondary').trigger('click')
    expect(wrapper.find('dialog').exists()).toBe(false)
    await button('Видалити').trigger('click')
    await wrapper.get('dialog button.danger').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Завдань поки немає')
    expect(fetch.mock.calls.filter((c) => c[1]?.method === 'DELETE')).toHaveLength(1)
  })
  it('filters tasks with supported backend query parameters', async () => {
    const { wrapper, fetch } = await render('/tasks')
    await wrapper.get('#status-filter').setValue('completed')
    await flushPromises()
    expect(fetch.mock.calls.at(-1)?.[0]).toContain('status=completed')
    expect(wrapper.text()).toContain('Завдань поки немає')
  })
  it('updates profile, preserves success after timezone change and switches theme', async () => {
    const { wrapper, auth, fetch } = await render('/profile')
    await wrapper.get('#profile-name').setValue('Марія')
    await wrapper.get('#profile-timezone').setValue('America/New_York')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(auth.user?.name).toBe('Марія')
    expect(auth.user?.timezone).toBe('America/New_York')
    expect(wrapper.text()).toContain('Профіль збережено')
    expect(
      fetch.mock.calls.some((c) => c[0].endsWith('/api/profile') && c[1]?.method === 'PATCH'),
    ).toBe(true)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Темна')
      ?.trigger('click')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('planner-theme')).toBe('dark')
  })
  it('provides desktop/mobile navigation and clears protected content after logout', async () => {
    const { wrapper, router, auth } = await render('/profile')
    expect(wrapper.findAll('nav').length).toBe(2)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Вийти')
      ?.trigger('click')
    await flushPromises()
    expect(auth.user).toBeNull()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(wrapper.find('.sidebar').exists()).toBe(false)
    expect(wrapper.find('#profile-name').exists()).toBe(false)
  })
  it('logs in through the form and navigates to the original destination', async () => {
    const { wrapper, router } = await render('/schedule', { signedIn: false })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    await wrapper.get('#email').setValue(user.email)
    await wrapper.get('#password').setValue('example-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/schedule')
    expect(wrapper.text()).toContain('Архітектура ПЗ')
  })
  it('recovers CSRF explicitly without replaying a failed task creation', async () => {
    const { wrapper, fetch } = await render('/tasks/new')
    await wrapper.get('#task-title').setValue('Зберегти мою чернетку')
    const rejected = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/tasks') && init?.method === 'POST') return json({}, 419)
      return fetch(url, init)
    })
    vi.stubGlobal('fetch', rejected)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Дія не повторювалася автоматично')
    expect(rejected.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Відновити сеанс')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('.session-banner').exists()).toBe(false)
    expect(rejected.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1)
    expect((wrapper.get('#task-title').element as HTMLInputElement).value).toBe(
      'Зберегти мою чернетку',
    )
    expect(rejected.mock.calls.some((c) => c[0].endsWith('/sanctum/csrf-cookie'))).toBe(true)
  })
  it('removes protected content when a subsequent API read returns 401', async () => {
    const { wrapper, router, auth } = await render('/profile')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json({}, 401))),
    )
    await router.push('/tasks')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(auth.user).toBeNull()
    expect(wrapper.find('.sidebar').exists()).toBe(false)
  })
  it('navigates backend pagination and resets page when filters change', async () => {
    const { wrapper, router, fetch } = await render('/profile')
    const paginated = vi.fn((url: string, init?: RequestInit) => {
      if (new URL(url).pathname === '/api/tasks')
        return Promise.resolve(
          json(page([task], Number(new URL(url).searchParams.get('page') || 1), 2)),
        )
      return fetch(url, init)
    })
    vi.stubGlobal('fetch', paginated)
    await router.push('/tasks')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Далі →')!
      .trigger('click')
    await flushPromises()
    expect(paginated.mock.calls.at(-1)?.[0]).toContain('page=2')
    expect(wrapper.text()).toContain('2 / 2')
    await wrapper.get('#priority-filter').setValue('3')
    await flushPromises()
    expect(paginated.mock.calls.at(-1)?.[0]).toContain('page=1')
    expect(paginated.mock.calls.at(-1)?.[0]).toContain('priority=3')
  })
})
