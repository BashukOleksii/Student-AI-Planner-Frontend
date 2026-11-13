import { test, expect } from '@playwright/test'
import { reviewValue } from '../src/utils/planning'
import type { PublicObject } from '../src/types/ai'
function isPublicObject(value: unknown): value is PublicObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
import { recoveryPresentationBackend } from '../tests/helpers/recoveryPresentationBackend'
import { planningBackend, sessionFixture } from '../tests/helpers/planningBackend'

for (const scenario of [
  'unresolved',
  'full',
  'split',
  'partial',
  'zero',
  'information',
  'stale',
] as const) {
  test(`student planning review: ${scenario}`, async ({ page }) => {
    const recovery = recoveryPresentationBackend()
    const planning = planningBackend()
    const source = reviewValue(planning.replan.session_results[0]!)
    if (!isPublicObject(source) || !isPublicObject(source.replacement))
      throw new Error('Invalid fixture')
    const replacement = source.replacement
    recovery.suggestion.review = {
      version: 1,
      kind: 'replan',
      adaptive_replanning: {
        summary: { untransferred_seconds: 0 },
        session_results: [{ ...source, replacements: [replacement], untransferred_seconds: 0 }],
      },
    }
    if (scenario === 'split')
      recovery.suggestion.review.adaptive_replanning = {
        summary: { untransferred_seconds: 0 },
        session_results: [
          {
            ...source,
            replacements: [
              replacement,
              {
                ...replacement,
                starts_at: '2026-11-04T09:00:00Z',
                ends_at: '2026-11-04T09:30:00Z',
              },
            ],
            untransferred_seconds: 0,
          },
        ],
      }
    if (scenario === 'partial')
      recovery.suggestion.review.adaptive_replanning = {
        summary: { untransferred_seconds: 1800 },
        session_results: [
          {
            ...source,
            replacements: [replacement],
            untransferred_seconds: 1800,
            explanations: ['Час перетинається із заняттям.'],
          },
        ],
      }
    if (scenario === 'unresolved') {
      recovery.suggestion.kind = 'decision_required'
      recovery.suggestion.actionable = false
      recovery.suggestion.requires_lifecycle_decision = true
      recovery.suggestion.review = {
        version: 1,
        kind: 'decision_required',
        unknown_session_decisions: [reviewValue(sessionFixture())],
      }
    }
    if (scenario === 'zero') {
      recovery.suggestion.kind = 'warning'
      recovery.suggestion.actionable = false
      recovery.suggestion.review = {
        version: 1,
        kind: 'warning',
        workload_advice: {
          summary: { unscheduled_seconds: 1800 },
          work_advice: [
            { task_id: 1, unscheduled_seconds: 1800, reason_codes: ['no_suitable_time_in_period'] },
          ],
        },
      }
    }
    if (scenario === 'information') {
      recovery.suggestion.kind = 'create_plan'
      recovery.check.attention_count = 0
      recovery.check.has_informational_recommendations = true
      recovery.suggestion.review = {
        version: 1,
        kind: 'create_plan',
        new_work_plan: reviewValue({
          ...planning.plan,
          user_summary: {
            title: 'Знайдено час для навчання',
            next_step: 'Перевірте запропоновані сесії.',
          },
        }),
      }
    }
    if (scenario === 'stale') recovery.check.review_refresh_required = true
    await page.route('http://localhost:8000/**', async (route) => {
      const request = route.request()
      const headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      }
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      const path = new URL(request.url()).pathname
      const handler =
        path.includes('recovery-suggestions') || path.includes('attention-status')
          ? recovery
          : planning
      const result = handler.handle(request.url(), request.method(), request.postDataJSON() ?? {})
      await route.fulfill({ status: result.status, json: result.body ?? {}, headers })
    })
    await page.goto('/planning/suggestions/example')
    const detail = page.getByRole('region', { name: 'Огляд пропозиції', exact: true })
    await expect(detail).toContainText('2026-11-02')
    await expect(page.locator('.planning-nav a[href="/planning/suggestions"]')).toHaveCount(0)
    if (scenario === 'unresolved')
      await expect(detail.getByRole('link', { name: 'Записати результат сесії →' })).toBeVisible()
    if (scenario === 'split') await expect(detail.getByText(/Нова сесія №/)).toHaveCount(2)
    if (scenario === 'partial') {
      await expect(detail).toContainText('У цьому періоді не знайдено нового часу для 30 хв роботи')
      await expect(detail).toContainText('Час перетинається із заняттям.')
    }
    if (scenario === 'full')
      await expect(detail).toContainText('Увесь час, який потрібно було перенести, розміщено')
    if (scenario === 'zero') await expect(detail).toContainText('не знайдено придатної сесії')
    if (scenario === 'information')
      await expect(page.getByText('Рекомендація:', { exact: false })).toBeVisible()
    if (scenario === 'stale')
      await expect(
        detail.getByRole('button', { name: 'Підтвердити зміни', exact: true }),
      ).toBeDisabled()
    await expect(detail).not.toContainText(
      /preview_token|reason_codes|session_results|lesson_overlap/,
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(recovery.writes).toEqual([])
  })
}

for (const path of ['/planning/preview', '/planning/replanning', '/planning/recovery']) {
  test(`manual review keeps period, consent and entire confirmation: ${path}`, async ({ page }) => {
    const backend = planningBackend()
    backend.plan = {
      ...backend.plan,
      sessions: Array.from({ length: 4 }, (_, index) => ({
        task_id: 1,
        subtask_id: null,
        starts_at: `2026-11-02T${String(index + 9).padStart(2, '0')}:00:00Z`,
        ends_at: `2026-11-02T${String(index + 9).padStart(2, '0')}:30:00Z`,
        duration_seconds: 1800,
      })),
    }
    await page
      .context()
      .addCookies([{ name: 'XSRF-TOKEN', value: 'review-csrf', url: 'http://localhost:4173' }])
    await page.route('http://localhost:8000/**', async (route) => {
      const request = route.request()
      const headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      }
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      const result = backend.handle(request.url(), request.method(), request.postDataJSON() ?? {})
      await route.fulfill({
        status: result.status,
        ...(result.status === 204 ? {} : { json: result.body ?? {} }),
        headers,
      })
    })
    await page.goto(path)
    await page
      .getByRole('button', {
        name: path.endsWith('recovery') ? 'Знайти час для невиконаної роботи' : 'Створити огляд',
        exact: true,
      })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Пропозиція — ще не збережено', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Підтвердження застосує весь огляд, включно з усіма сторінками карток.', {
        exact: true,
      }),
    ).toBeVisible()
    if (!path.endsWith('recovery'))
      await page.getByRole('button', { name: 'Наступна', exact: true }).first().click()
    for (const checkbox of await page.locator('input[type="checkbox"]').all())
      await checkbox.check()
    expect(backend.requests.some((request) => request.path.endsWith('/confirm'))).toBe(false)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Збережений результат', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Період огляду:', { exact: false })).toBeVisible()
    expect(backend.requests.filter((request) => request.path.endsWith('/confirm'))).toHaveLength(1)
    if (path.endsWith('preview')) expect(backend.sessions).toHaveLength(4)
  })
}
