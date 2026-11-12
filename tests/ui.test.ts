import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import App from '@/App.vue'
import { useAuthStore } from '@/stores/auth'
import { makeRouter } from '@/router'
import { setAuthErrorHandler } from '@/api/client'
import { user, task, progress, lesson, json, page } from './fixtures'
import type { Task, Subtask, Progress, TaskInput } from '@/types/api'
import { renderApp } from './helpers/renderApp'
import { f2Backend } from './helpers/f2Backend'
import TaskCard from '@/components/domain/TaskCard.vue'
import { isOverdue } from '@/utils/dates'

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
    if (path === '/api/planning/recovery-suggestions')
      return json({
        data: [],
        meta: { current_page: 1, last_page: 1 },
        automation: { last_scanned_at: null, last_outcome: null },
      })
    if (path === '/api/study-sessions') return json({ data: [], meta: { timezone: user.timezone } })
    if (path === '/api/semester-schedules') return json({ data: [] })
    if (path.startsWith('/api/academic-calendar/') || path.startsWith('/api/schedule/'))
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
    expect(wrapper.text()).toContain('Ваш день, Олена')
    expect(wrapper.text()).toContain('На сьогодні занять більше немає')
    expect(wrapper.text()).toContain('Почніть із першого завдання')
    expect(wrapper.text()).toContain('Запланувати навчання')
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
        url.includes('/academic-calendar/')
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
    expect(wrapper.text()).toContain('На сьогодні занять більше немає')
  })
  it('shows recoverable read errors and renders actual lesson details', async () => {
    const { wrapper, fetch } = await render('/', { failSchedule: true })
    expect(wrapper.text()).toContain('Сервіс тимчасово недоступний')
    const retry = wrapper.findAll('button').find((b) => b.text() === 'Спробувати ще раз')
    await retry?.trigger('click')
    await flushPromises()
    expect(fetch.mock.calls.filter((c) => c[0].includes('/academic-calendar/today'))).toHaveLength(
      2,
    )
  })
  it('renders schedule, date navigation and week mode', async () => {
    const { wrapper, fetch } = await render('/schedule/legacy')
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
    await button('Повернути до виконання').trigger('click')
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
    expect(wrapper.findAll('nav[aria-label="Основна навігація"]').length).toBe(1)
    expect(wrapper.findAll('nav[aria-label="Мобільна навігація"]').length).toBe(1)
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
    const { wrapper, router } = await render('/schedule/legacy', { signedIn: false })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    await wrapper.get('#email').setValue(user.email)
    await wrapper.get('#password').setValue('example-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/schedule/legacy')
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
  it.each(['pending', 'completed'] as const)(
    'recovers the last page after changing the final %s task status',
    async (status) => {
      const { wrapper, router, fetch } = await render('/profile')
      let changed = false
      const paginated = vi.fn(async (url: string, init?: RequestInit) => {
        const parsed = new URL(url)
        if (parsed.pathname.endsWith(status === 'pending' ? '/complete' : '/reopen')) changed = true
        if (parsed.pathname === '/api/tasks') {
          const current = Number(parsed.searchParams.get('page') ?? 1)
          return json(
            page(
              changed && current > 1
                ? []
                : [{ ...task, status, title: changed ? 'Залишене завдання' : task.title }],
              current,
              changed ? 1 : 2,
            ),
          )
        }
        return fetch(url, init)
      })
      vi.stubGlobal('fetch', paginated)
      await router.push('/tasks')
      await wrapper.get('#status-filter').setValue(status)
      await flushPromises()
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Далі →')!
        .trigger('click')
      await flushPromises()
      await wrapper
        .findAll('button')
        .find((b) => b.text() === (status === 'pending' ? 'Завершити' : 'Повернути до виконання'))!
        .trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Залишене завдання')
      expect(wrapper.text()).not.toContain('Завдань поки немає')
      expect(paginated.mock.calls.at(-1)?.[0]).toContain('page=1')
      expect(paginated.mock.calls.at(-1)?.[0]).toContain(`status=${status}`)
    },
  )
  it('sends both deadline bounds in UTC and shows authoritative filter errors', async () => {
    const { wrapper, fetch } = await render('/tasks')
    await wrapper.get('#deadline-from-filter').setValue('2026-11-10T12:30')
    await wrapper.get('#deadline-filter').setValue('2026-11-12T12:30')
    await wrapper.get('.deadline-filter').trigger('submit')
    await flushPromises()
    expect(fetch.mock.calls.at(-1)?.[0]).toContain('deadline_from=2026-11-10T10%3A30%3A00Z')
    expect(fetch.mock.calls.at(-1)?.[0]).toContain('deadline_to=2026-11-12T10%3A30%3A00Z')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ errors: { deadline_from: ['Перевірте межу дедлайну.'] } }, 422)),
    )
    await wrapper.get('.deadline-filter').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Перевірте межу дедлайну.')
  })
  it.each(['/tasks/new', '/tasks/1'])(
    'preserves the draft and blocks a second save after an uncertain result at %s',
    async (path) => {
      const { wrapper, fetch, router } = await render(path)
      const uncertain = vi.fn(async (url: string, init?: RequestInit) => {
        const response = await fetch(url, init)
        if (['POST', 'PATCH'].includes(init?.method ?? 'GET')) throw new TypeError('Response lost')
        return response
      })
      vi.stubGlobal('fetch', uncertain)
      await wrapper.get('#task-title').setValue('Чернетка після втраченої відповіді')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(path)
      expect(wrapper.text()).toContain('Результат збереження невідомий')
      expect((wrapper.get('#task-title').element as HTMLInputElement).value).toBe(
        'Чернетка після втраченої відповіді',
      )
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(
        uncertain.mock.calls.filter((c) => ['POST', 'PATCH'].includes(c[1]?.method ?? 'GET')),
      ).toHaveLength(1)
      expect(wrapper.find('a[href="/tasks"]').exists()).toBe(true)
    },
  )
  it('sends only one task creation while the first submission is unresolved', async () => {
    const { wrapper, fetch } = await render('/tasks/new')
    let resolve!: (response: Response) => void
    const pending = vi.fn((url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>((done) => {
            resolve = done
          })
        : fetch(url, init),
    )
    vi.stubGlobal('fetch', pending)
    await wrapper.get('#task-title').setValue('Одне завдання')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(pending.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1)
    resolve(json({ data: { ...task, title: 'Одне завдання' } }, 201))
    await flushPromises()
  })
})

describe('Unfinished Task lifecycle', () => {
  async function click(wrapper: ReturnType<typeof mount>, label: string) {
    await wrapper
      .findAll('button')
      .find((button) => button.text() === label)!
      .trigger('click')
    await flushPromises()
  }
  it('keeps Task/Subtask status unions and Task-only statistics separate', () => {
    expectTypeOf<Task['status']>().toEqualTypeOf<'pending' | 'missed' | 'completed'>()
    expectTypeOf<Subtask['status']>().toEqualTypeOf<'pending' | 'completed'>()
    expectTypeOf<keyof Progress['subtasks']['current']>().toEqualTypeOf<
      'total' | 'pending' | 'completed' | 'overdue_pending'
    >()
    expectTypeOf<Extract<keyof TaskInput, 'status'>>().toEqualTypeOf<never>()
    expect(isOverdue('2000-01-01T00:00:00Z', 'missed')).toBe(true)
    expect(isOverdue('2000-01-01T00:00:00Z', 'completed')).toBe(false)
  })
  it('filters exact missed and pending populations and renders all three labels', async () => {
    const backend = f2Backend()
    backend.tasks.push(
      { ...task, id: 2, status: 'missed' },
      { ...task, id: 3, status: 'completed', completed_at: '2026-11-08T12:00:00Z' },
    )
    const { wrapper, fetch } = await renderApp('/tasks', backend)
    for (const label of ['Очікує виконання', 'Не виконано', 'Виконано'])
      expect(wrapper.findAll('.task-row .badge').map((b) => b.text())).toContain(label)
    await wrapper.get('#status-filter').setValue('missed')
    await flushPromises()
    expect(fetch.mock.calls.at(-1)?.[0]).toContain('status=missed')
    expect(wrapper.findAll('.task-row')).toHaveLength(1)
    expect(wrapper.get('.task-row a[href="/planning/recovery?task_id=2"]').text()).toBe(
      'Відновити роботу',
    )
    await wrapper.get('#status-filter').setValue('pending')
    await flushPromises()
    expect(wrapper.findAll('.task-row')).toHaveLength(1)
    expect(wrapper.get('.task-row').text()).toContain('Очікує виконання')
    expect(wrapper.get('.task-row').text()).not.toContain('Відновити роботу')
  })
  it('marks, reopens and completes missed Tasks using lifecycle POSTs without changing Subtasks', async () => {
    document.cookie = 'XSRF-TOKEN=task%2Bcsrf'
    const backend = f2Backend()
    backend.tasks[0]!.deadline_at = '2000-01-01T00:00:00Z'
    backend.children = [
      {
        id: 4,
        task_id: 1,
        title: 'Виконаний крок',
        status: 'completed',
        completed_at: '2026-11-08T12:00:00Z',
        description: null,
        deadline_at: null,
        estimated_minutes: 20,
        position: 1,
      },
    ]
    const originalChildren = structuredClone(backend.children)
    const { wrapper, fetch } = await renderApp('/tasks', backend)
    await click(wrapper, 'Позначити невиконаним')
    expect(wrapper.get('.task-row').text()).toContain('Не виконано')
    expect(wrapper.get('.task-row').text()).toContain('Прострочено')
    await click(wrapper, 'Повернути до виконання')
    expect(backend.tasks[0]!.status).toBe('pending')
    await click(wrapper, 'Позначити невиконаним')
    await click(wrapper, 'Завершити')
    expect(backend.tasks[0]!.status).toBe('completed')
    expect(wrapper.get('.task-row').text()).not.toContain('Прострочено')
    expect(wrapper.get('.task-row').text()).not.toContain('Позначити невиконаним')
    expect(backend.children).toEqual(originalChildren)
    const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(writes.map(([url]) => new URL(url).pathname)).toEqual([
      '/api/tasks/1/miss',
      '/api/tasks/1/reopen',
      '/api/tasks/1/miss',
      '/api/tasks/1/complete',
    ])
    for (const [, init] of writes) {
      expect(init).toMatchObject({ credentials: 'include' })
      expect(new Headers(init?.headers).get('X-XSRF-TOKEN')).toBe('task+csrf')
      expect(init?.body).toBeUndefined()
    }
    expect(backend.requests.some((r) => r.method === 'PATCH')).toBe(false)
  })
  it('reads the completed Task after a stale pending-to-missed conflict and never auto-reopens it', async () => {
    const backend = f2Backend(),
      { wrapper } = await renderApp('/tasks', backend)
    backend.tasks[0]!.status = 'completed'
    backend.tasks[0]!.completed_at = '2026-11-08T12:00:00Z'
    await click(wrapper, 'Позначити невиконаним')
    expect(wrapper.text()).toContain('Конфлікт стану завдання')
    expect(backend.requests.some((r) => r.path === '/api/tasks/1' && r.method === 'GET')).toBe(true)
    expect(backend.requests.filter((r) => r.method === 'POST').map((r) => r.path)).toEqual([
      '/api/tasks/1/miss',
    ])
    expect(wrapper.get('.task-row').text()).toContain('Виконано')
    expect(wrapper.get('.task-row').text()).not.toContain('Позначити невиконаним')
    expect(wrapper.get('.task-row').text()).not.toContain('Завершити')
    expect(wrapper.get('.task-row').text()).toContain('Повернути до виконання')
  })
  it('prevents duplicate lifecycle requests while pending', async () => {
    const backend = f2Backend(),
      { wrapper } = await renderApp('/tasks', backend),
      original = globalThis.fetch
    let release!: () => void,
      sends = 0
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/miss')) {
          sends++
          await held
        }
        return original(url, init)
      }),
    )
    const card = wrapper.getComponent(TaskCard)
    card.vm.$emit('lifecycle', 'miss')
    card.vm.$emit('lifecycle', 'miss')
    await flushPromises()
    expect(sends).toBe(1)
    expect(
      wrapper.findAll('.task-row button').every((b) => b.attributes('disabled') !== undefined),
    ).toBe(true)
    release()
    await flushPromises()
    expect(backend.tasks[0]!.status).toBe('missed')
  })
  it('blocks an uncertain saved mutation until a manual GET, with no replay or success claim', async () => {
    const backend = f2Backend(),
      { wrapper } = await renderApp('/tasks', backend),
      original = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const response = await original(url, init)
        if (url.endsWith('/miss')) throw new TypeError('Lost response after persistence')
        return response
      }),
    )
    await click(wrapper, 'Позначити невиконаним')
    expect(backend.tasks[0]!.status).toBe('missed')
    expect(wrapper.text()).toContain('Результат зміни стану невідомий')
    expect(wrapper.find('.success-notice').exists()).toBe(false)
    wrapper.getComponent(TaskCard).vm.$emit('lifecycle', 'miss')
    await flushPromises()
    expect(backend.requests.filter((r) => r.path.endsWith('/miss'))).toHaveLength(1)
    await click(wrapper, `Перевірити стан: ${backend.tasks[0]!.title}`)
    expect(wrapper.get('.task-row').text()).toContain('Не виконано')
    expect(wrapper.text()).toContain('Поточні дані перевірено')
    expect(backend.requests.some((r) => r.path === '/api/tasks/1' && r.method === 'GET')).toBe(true)
    expect(backend.requests.filter((r) => r.path.endsWith('/miss'))).toHaveLength(1)
  })
  it('uses the returned status rather than assuming the requested transition succeeded', async () => {
    const backend = f2Backend(),
      handle = backend.handle
    vi.spyOn(backend, 'handle').mockImplementation((url, method, body, headers) =>
      url.endsWith('/miss')
        ? { status: 200, body: { data: { ...task, status: 'pending' } } }
        : handle(url, method, body, headers),
    )
    const { wrapper } = await renderApp('/tasks', backend)
    await click(wrapper, 'Позначити невиконаним')
    expect(wrapper.get('.success-notice').text()).toContain('Очікує виконання')
    expect(wrapper.get('.task-row').text()).not.toContain('Не виконано')
  })
  it.each([401, 419, 404])(
    'preserves the existing %s boundary without replaying a mutation',
    async (status) => {
      const backend = f2Backend(),
        { wrapper, auth, router } = await renderApp('/tasks', backend)
      backend.failure = { path: /\/miss$/, method: 'POST', status }
      await click(wrapper, 'Позначити невиконаним')
      expect(backend.requests.filter((r) => r.path.endsWith('/miss'))).toHaveLength(1)
      if (status === 401) expect(router.currentRoute.value.path).toBe('/login')
      else if (status === 419) expect(auth.csrfFailure).toBe(true)
      else expect(wrapper.text()).toContain('Запис недоступний')
    },
  )
})
