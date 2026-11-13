import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { planningBackend } from '../tests/helpers/planningBackend'
async function setup(page: Page) {
  const backend = planningBackend(),
    errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request(),
      headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const response = backend.handle(request.url(), request.method(), request.postDataJSON() ?? {})
    await route.fulfill({
      status: response.status,
      headers,
      ...(response.status === 204 ? {} : { json: response.body ?? {} }),
    })
  })
  return { backend, errors }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('period form, split preview, whole-proposal confirmation from page two and saved result', async ({
  page,
}, testInfo) => {
  const { backend, errors } = await setup(page),
    source = backend.replan.session_results[0]!
  source.replacements = [
    source.replacement!,
    { ...source.replacement!, starts_at: '2026-11-03T14:00:00Z', ends_at: '2026-11-03T14:30:00Z' },
  ]
  backend.replan.session_results = Array.from({ length: 7 }, (_, index) => ({
    ...source,
    study_session_id: index + 11,
    original: { ...source.original, ends_at: '2026-11-02T10:30:00Z', duration_seconds: 5400 },
    ...(index === 6
      ? {
          replacement: null,
          replacements: [],
          untransferred_seconds: 5400,
          replacement_reason_codes: ['no_replacement_capacity'],
        }
      : {}),
  }))
  backend.replan.warnings = []
  Object.assign(backend.replan.summary, {
    inspected_sessions: 7,
    affected_sessions: 7,
    valid_sessions: 0,
    cannot_replan_sessions: 0,
    proposed_replacements: 12,
    unplaced_sessions: 1,
    partial_replacements: 6,
    original_affected_seconds: 37800,
    replacement_seconds: 21600,
    untransferred_seconds: 16200,
  })
  await page.goto('/planning/replanning?start_date=2026-11-09&end_date=2026-11-15')
  await expect(page.locator('form input')).toHaveCount(2)
  await expect(page.getByLabel('Початок періоду', { exact: true })).toHaveValue('2026-11-09')
  expect(backend.requests.some((request) => request.method === 'POST')).toBe(false)
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('replanning-form.png'), fullPage: true })
  await page.getByRole('button', { name: 'Перевірити план', exact: true }).click()
  await expect(page.getByText('Ще не збережено', { exact: true })).toBeVisible()
  await expect(page.locator('.replanning-period')).toContainText('2026-11-02 — 2026-11-08')
  await expect(page.locator('.replanning-changes .replanning-source')).toHaveCount(5)
  await expect(
    page.locator('.replanning-source').first().locator('.replanning-intervals li'),
  ).toHaveCount(2)
  expect(backend.sessions).toEqual([])
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('replanning-preview.png'), fullPage: true })
  const navigation = page.getByRole('navigation', { name: 'Що зміниться', exact: true })
  await navigation.getByRole('button', { name: 'Наступна', exact: true }).click()
  await expect(page.locator('.replanning-changes .replanning-source')).toHaveCount(2)
  await expect(page.locator('.replanning-changes a[href="/planning/sessions/16"]')).toBeVisible()
  const decision = page.locator('.replanning-decision')
  await expect(decision).toContainText('Підтвердження застосує всю пропозицію')
  for (const checkbox of await decision.getByRole('checkbox').all()) await checkbox.check()
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('replanning-page-two.png'), fullPage: true })
  const audit = await new AxeBuilder({ page }).include('.page-replanning').analyze()
  expect(
    audit.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([])
  await decision.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Зміни збережено', exact: true })).toBeVisible()
  await expect(page.locator('.replanning-saved-dates')).toContainText('2026-11-03 — 2026-11-03')
  await expect(page.locator('.replanning-saved-remainder')).toContainText('Без нового часу: 90 хв')
  await expect(page.locator('.replanning-decision')).toHaveCount(0)
  expect(
    backend.requests.find((request) => request.path.endsWith('/replanning/confirm'))?.body,
  ).toEqual({
    preview_token: 'opaqueReplanToken==',
    accept_partial: true,
    accept_unplaced_cancellation: true,
    accept_split_replacements: true,
  })
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('replanning-saved.png'), fullPage: true })
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme
    }, theme)
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await noOverflow(page)
    }
  }
  await page
    .locator('.replanning-saved-actions')
    .getByRole('link', { name: 'Навчальні сесії', exact: true })
    .click()
  await expect(page).toHaveURL(/\/planning\/sessions\?start_date=2026-11-03&end_date=2026-11-03/)
  expect(errors).toEqual([])
})

test('clean period differs from no replacement; expired confirmation remains blocked', async ({
  page,
}) => {
  const { backend, errors } = await setup(page),
    unplaced = backend.replan.session_results[1]!
  backend.replan.session_results = []
  backend.replan.warnings = []
  Object.assign(backend.replan.summary, {
    affected_sessions: 0,
    cannot_replan_sessions: 0,
    proposed_replacements: 0,
    no_changes_needed: true,
  })
  await page.goto('/planning/replanning')
  await page.getByRole('button', { name: 'Перевірити план', exact: true }).click()
  await expect(
    page.getByText('У цьому періоді нічого переносити не потрібно', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.replanning-changes')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toHaveCount(0)
  backend.replan.session_results = [unplaced]
  Object.assign(backend.replan.summary, {
    affected_sessions: 1,
    unplaced_sessions: 1,
    partial_replacements: 0,
    untransferred_seconds: 3600,
    no_changes_needed: false,
  })
  await page.getByRole('button', { name: 'Перевірити план', exact: true }).click()
  await expect(
    page.getByText('Проблеми є, але нового часу не знайдено.', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.replanning-source')).toContainText('Без нового часу: 60 хв')
  for (const checkbox of await page.locator('.replanning-decision').getByRole('checkbox').all())
    await checkbox.check()
  backend.failure = { method: 'POST', path: /confirm$/, status: 422 }
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  await expect(page.locator('.replanning-saved-summary')).toHaveCount(0)
  expect(backend.requests.filter((request) => request.path.endsWith('/confirm'))).toHaveLength(1)
  await noOverflow(page)
  expect(errors).toEqual([])
})
