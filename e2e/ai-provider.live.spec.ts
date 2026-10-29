import { expect, test } from '@playwright/test'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
// Opt-in only. Reuses an operator-provided session and owned conversation; never
// creates users or confirms actions. May incur provider charges and appends history.
test('operator-opted-in real AI answer persists in an existing conversation', async ({ page }) => {
  await page
    .context()
    .grantPermissions(['local-network-access'], { origin: 'http://localhost:5173' })
  const bundle = resolve('dist')
  await page.route('http://localhost:5173/**', async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname)
    const candidate = resolve(bundle, `.${pathname}`)
    const file =
      candidate.startsWith(`${bundle}${sep}`) && extname(pathname)
        ? candidate
        : resolve(bundle, 'index.html')
    expect((await stat(file)).isFile()).toBe(true)
    await route.fulfill({ path: file })
  })
  const decisions: string[] = []
  page.on('request', (request) => {
    if (/\/actions\/[^/]+\/(confirm|reject)$/.test(request.url())) decisions.push(request.method())
  })
  const id = process.env.AI_LIVE_CONVERSATION_ID!
  await page.goto(`/ai/conversations/${id}`)
  await expect(page.getByLabel('Повідомлення помічнику', { exact: true })).toBeVisible()
  const content =
    'Коротко переліч мої відкриті завдання. Це лише запит на читання; не пропонуй змін.'
  await page.getByLabel('Повідомлення помічнику', { exact: true }).fill(content)
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/ai/conversations/${id}/messages`) && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Надіслати повідомлення', exact: true }).click()
  expect((await response).status()).toBe(200)
  await expect(page.locator('.ai-pending-intent')).toHaveCount(0)
  await expect(page.locator('.ai-user').filter({ hasText: content })).toBeVisible()
  await page.reload()
  await expect(page.locator('.ai-user').filter({ hasText: content })).toBeVisible()
  expect(decisions).toEqual([])
})
