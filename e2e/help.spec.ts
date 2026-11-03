import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { scheduleBackend } from '../tests/helpers/scheduleBackend'

// Shared with the dev and prefixed-base smoke command through HELP_TEST_ORIGIN/PATH.
const origin = process.env.HELP_TEST_ORIGIN
const base = process.env.HELP_TEST_PATH ?? '/'
const url = (path: string) => `${origin ?? ''}${base}${path}`

test('public static Docsify, every topic, media, search and themes', async ({ page, request }) => {
  const failures: string[] = []
  const requests: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('request', (req) => requests.push(req.url()))
  page.on('response', (res) => {
    if (res.status() >= 400) failures.push(`${res.status()} ${res.url()}`)
  })
  await page.route('http://localhost:8000/**', (route) => route.abort())
  const response = await page.goto(url('help/'))
  expect(response?.status()).toBe(200)
  expect(await response?.text()).toContain('vendor/docsify.min.js')
  await expect(page.locator('.cover')).toBeVisible()
  await page.getByRole('link', { name: 'Відкрити посібник', exact: true }).click()
  await expect(page.locator('#main h1')).toHaveText('Перші кроки')
  await page.goto(url('help/#/guide/tasks'))
  await expect(page.locator('#main h1')).toHaveText('Завдання та підзавдання')
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Показати або сховати зміст', exact: true }).click()
  await expect(page.locator('.sidebar')).toBeVisible()
  const links = await page
    .locator('.sidebar-nav a')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => (node as HTMLAnchorElement).href)
        .filter((href) => !href.includes('?id=')),
    )
  expect(new Set(links).size).toBe(18)
  for (const href of new Set(links)) {
    await page.goto(href)
    await expect(page.locator('#main h1')).toBeVisible()
    await expect(page.locator('#main')).not.toContainText('Сторінку довідника не знайдено')
    for (const image of await page.locator('#main img').all()) {
      await expect(image).toHaveAttribute('alt', /\S+/)
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
        .toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.goto(url('help/#/guide/tasks'))
  await expect(page.locator('#main h1')).toHaveText('Завдання та підзавдання')
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Показати або сховати зміст', exact: true }).click()
  const search = page.getByRole('searchbox')
  await search.fill('нерозподілену')
  await expect(page.locator('.search .matching-post').first()).toBeVisible()
  await page.locator('.search .matching-post a').first().click()
  await expect(page.locator('#main')).toContainText(/нерозподілен/)
  await page.goto(url('help/#/guide/tasks'))
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: 'Темна тема', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(
      audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const workbook = await request.get(url('examples/schedule-example.xlsx'))
  expect(workbook.status()).toBe(200)
  expect((await workbook.body()).subarray(0, 2).toString()).toBe('PK')
  expect(requests.some((path) => path.includes(':8000'))).toBe(false)
  expect(requests.every((path) => new URL(path).origin === new URL(page.url()).origin)).toBe(true)
  expect(failures).toEqual([])
})

test('Help is an accessible normal link from public and authenticated navigation', async ({
  page,
  context,
}) => {
  // Current SPA supports origin-root deployment. Prefix smoke tests target the static manual only.
  test.skip(base !== '/', 'Existing Vue Router deployment remains origin-root only')
  const backend = scheduleBackend()
  let signedIn = false
  await context.route('http://localhost:8000/**', async (route) => {
    const req = route.request(),
      headers = {
        'Access-Control-Allow-Origin': new URL(page.url()).origin,
        'Access-Control-Allow-Credentials': 'true',
      }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (!signedIn) return route.fulfill({ status: 401, headers, json: {} })
    const result = backend.handle(req.url(), req.method(), req.postDataJSON() ?? {})
    return route.fulfill({
      status: result.status,
      headers,
      ...(result.status === 204 ? {} : { json: result.body }),
    })
  })
  for (const path of ['login', 'register', 'tasks']) {
    signedIn = path === 'tasks'
    await page.goto(url(path))
    const help = page
      .getByRole('link', { name: 'Допомога (у новій вкладці)', exact: true })
      .filter({ visible: true })
    await expect(help).toHaveAttribute('href', `${base}help/`)
    await expect(help).toHaveAttribute('rel', 'noopener noreferrer')
    if (signedIn && test.info().project.name === 'desktop') {
      await page.setViewportSize({ width: 1024, height: 640 })
      const logout = page
        .locator('.sidebar')
        .getByRole('button', { name: 'Вийти з облікового запису', exact: true })
      await logout.scrollIntoViewIfNeeded()
      await expect(logout).toBeInViewport()
      await help.scrollIntoViewIfNeeded()
      await expect(help).toBeInViewport()
    }
    const popupPromise = context.waitForEvent('page')
    await help.click()
    const popup = await popupPromise
    await expect(popup).toHaveURL(/\/help\//)
    await expect(popup.locator('.cover')).toBeVisible()
    await popup.getByRole('link', { name: 'До Student AI Planner' }).click()
    await expect(popup).toHaveURL(signedIn ? /\/tasks$|:\d+\/$/ : /\/login(?:\?|$)/)
    await popup.close()
  }
})
