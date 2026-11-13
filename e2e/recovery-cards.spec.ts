import { test, expect } from '@playwright/test'
import { recoveryCardsBackend } from '../tests/helpers/recoveryCardsBackend'
for (const count of [1, 5]) {
  test(`recovery list shows ${count} cards without dividers or footer`, async ({
    page,
    isMobile,
  }) => {
    const backend = recoveryCardsBackend(count)
    await page.route('http://localhost:8000/**', async (route) => {
      const request = route.request()
      const headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      }
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      const result = backend.handle(request.url(), request.method(), request.postDataJSON() ?? {})
      await route.fulfill({ status: result.status, json: result.body ?? {}, headers })
    })
    await page.goto('/planning/suggestions')
    const cards = page.locator('.suggestion-card')
    await expect(cards).toHaveCount(count)
    await expect(page.locator('.suggestion-pagination')).toHaveCount(0)
    await expect(page.getByText('Діагностика за період', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Створити план вручну', exact: true })).toHaveCount(
      0,
    )
    await expect(
      page.getByRole('link', { name: 'Відновлення окремої роботи', exact: true }),
    ).toHaveCount(0)
    const first = cards.first()
    const text = first.locator('.suggestion-summary > div')
    const button = first.getByRole('button', { name: 'Переглянути', exact: true })
    const textBox = await text.boundingBox(),
      buttonBox = await button.boundingBox()
    expect(textBox).not.toBeNull()
    expect(buttonBox).not.toBeNull()
    if (isMobile) expect(buttonBox!.y).toBeGreaterThanOrEqual(textBox!.y + textBox!.height)
    else expect(buttonBox!.x).toBeGreaterThanOrEqual(textBox!.x + textBox!.width)
    const cardStyle = await first.evaluate((node) => {
      const style = getComputedStyle(node)
      return { border: style.borderTopWidth, padding: style.paddingTop }
    })
    expect(cardStyle).toEqual({ border: '1px', padding: '16px' })
    for (const group of await page.locator('.suggestion-group').all())
      expect(await group.evaluate((node) => getComputedStyle(node).borderBottomWidth)).toBe('0px')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await button.focus()
    expect(await button.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none')
    await button.click()
    await expect(page).toHaveURL(/\/planning\/suggestions\/card-0$/)
    await expect(page.getByRole('region', { name: 'Огляд пропозиції', exact: true })).toBeVisible()
    const collapse = page.getByRole('button', { name: 'Згорнути', exact: true })
    await expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await expect(first.getByRole('region', { name: 'Огляд пропозиції', exact: true })).toBeVisible()
    await collapse.focus()
    await page.keyboard.press('Space')
    await expect(page).toHaveURL(/\/planning\/suggestions$/)
    await expect(page.getByRole('region', { name: 'Огляд пропозиції', exact: true })).toHaveCount(0)
    await expect(first.getByRole('button', { name: 'Переглянути', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(backend.requests.every((request) => request.method === 'GET')).toBe(true)
    expect(backend.requests.some((request) => request.path.includes('/diagnostics'))).toBe(false)
  })
}

test('keyboard switching and collapse retain the list context', async ({ page }) => {
  const backend = recoveryCardsBackend(2, 2)
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const result = backend.handle(request.url(), request.method(), request.postDataJSON() ?? {})
    await route.fulfill({ status: result.status, json: result.body ?? {}, headers })
  })
  await page.goto('/planning/suggestions/card-0?status=all&page=2')
  const first = page.locator('#suggestion-toggle-card-0'),
    second = page.locator('#suggestion-toggle-card-1')
  await expect(first).toHaveAttribute('aria-expanded', 'true')
  await second.focus()
  await page.keyboard.press('Enter')
  await expect(second).toHaveAttribute('aria-expanded', 'true')
  await expect(second).toBeEnabled()
  await expect(first).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('region', { name: 'Огляд пропозиції', exact: true })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await second.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/planning\/suggestions\?status=all&page=2$/)
  await expect(page.locator('#recovery-status')).toHaveValue('all')
  await expect(page.locator('.suggestion-pagination')).toContainText('2 / 2')
  await expect(second).toHaveAttribute('aria-expanded', 'false')
  await expect(second).toBeFocused()
  expect(backend.requests.every((request) => request.method === 'GET')).toBe(true)
})
