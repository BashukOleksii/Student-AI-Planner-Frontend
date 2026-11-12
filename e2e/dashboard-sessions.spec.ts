import { expect, test } from '@playwright/test'
import { planningBackend, sessionFixture } from '../tests/helpers/planningBackend'
import { task } from '../tests/fixtures'

for (const theme of ['light', 'dark'] as const) {
  test(`Dashboard sessions stay grouped and wrap in ${theme} theme`, async ({ page }, info) => {
    const backend = planningBackend()
    const title = 'Реалізувати REST API'
    const longTitle = `${title}: авторизація, навчальні завдання та документація. `.repeat(4)
    backend.base.tasks[0]!.title = title
    backend.base.tasks.push({ ...task, id: 2, title: longTitle })
    backend.sessions = [sessionFixture(1), { ...sessionFixture(2), task_id: 2 }]
    await page.clock.setFixedTime(new Date('2026-11-02T08:00:00Z'))
    await page.addInitScript((theme) => localStorage.setItem('planner-theme', theme), theme)
    await page.route('http://localhost:8000/**', async (route) => {
      const request = route.request()
      const result = backend.handle(request.url(), request.method())
      await route.fulfill({
        status: result.status,
        json: result.body ?? {},
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:4173',
          'Access-Control-Allow-Credentials': 'true',
        },
      })
    })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const sessions = page.locator('.dashboard-session')
    await expect(sessions).toHaveCount(2)
    await expect(sessions.nth(1).locator('header a')).toHaveText(longTitle.trim())

    const initialWidth = page.viewportSize()!.width
    for (const width of [initialWidth, 320, 768]) {
      await page.setViewportSize({ width, height: 900 })
      for (const [index, session] of (await sessions.all()).entries()) {
        await expect(session.locator('.badge')).toHaveText('Заплановано')
        await expect(session.locator('header a')).toHaveAttribute(
          'href',
          `/planning/sessions/${index + 1}`,
        )
        await expect(session.getByRole('link', { name: 'Відкрити завдання' })).toHaveAttribute(
          'href',
          `/tasks/${index + 1}`,
        )
        await expect(session).toContainText('30 хв')
        const layout = await session.evaluate((element) => {
          const header = element.querySelector('header')!.getBoundingClientRect()
          const title = element.querySelector('header a')!.getBoundingClientRect()
          const badge = element.querySelector('.badge')!.getBoundingClientRect()
          const paragraphs = element.querySelectorAll('p')
          const date = paragraphs[0]!.getBoundingClientRect()
          const metadata = paragraphs[1]!.getBoundingClientRect()
          return {
            dateGap: date.top - header.bottom,
            metadataGap: metadata.top - date.bottom,
            overlap: title.right > badge.left && title.bottom > badge.top,
            statusBelow: badge.top >= title.bottom,
            headerTop: header.top,
            titleTop: title.top,
            badgeTop: badge.top,
            overflows: element.scrollWidth > element.clientWidth,
          }
        })
        expect(layout.dateGap).toBeCloseTo(8, 0)
        expect(layout.metadataGap).toBeCloseTo(8, 0)
        expect(layout.overlap).toBe(false)
        expect(layout.overflows).toBe(false)
        if (width === 320) expect(layout.statusBelow).toBe(true)
        if (width === 1440) {
          expect(layout.titleTop).toBe(layout.headerTop)
          expect(layout.badgeTop).toBe(layout.headerTop)
        }
      }
      expect(
        await sessions.nth(1).evaluate((element) => {
          const previous = element.previousElementSibling!.getBoundingClientRect()
          return element.getBoundingClientRect().top - previous.bottom
        }),
      ).toBeCloseTo(16, 0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
      await sessions
        .first()
        .locator('header a')
        .evaluate((element) => element.scrollIntoView())
      const screenshot = info.outputPath(`dashboard-${theme}-${width}.png`)
      await page.screenshot({ path: screenshot, fullPage: true })
      await info.attach(`dashboard-${theme}-${width}`, {
        path: screenshot,
        contentType: 'image/png',
      })
    }

    await page.goto('/planning/sessions')
    await expect(page.locator('.session-card')).toHaveCount(2)
    await expect(page.locator('.dashboard-session')).toHaveCount(0)
    await expect(page.locator('.session-card header').first()).toHaveCSS('margin-bottom', '20px')
  })
}
