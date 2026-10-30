import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { expect, type Page } from '@playwright/test'
export async function serveLiveFrontend(page: Page) {
  await page
    .context()
    .grantPermissions(['local-network-access'], { origin: 'http://localhost:5173' })
  const bundle = resolve('dist')
  // Only frontend assets are fulfilled; never register routes for the Laravel origin.
  await page.route('http://localhost:5173/**', async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname),
      candidate = resolve(bundle, `.${pathname}`)
    const file =
      candidate.startsWith(bundle + sep) && extname(pathname)
        ? candidate
        : resolve(bundle, 'index.html')
    expect((await stat(file)).isFile()).toBe(true)
    await route.fulfill({ path: file })
  })
}
export async function liveApi<T>(
  page: Page,
  path: string,
  method = 'GET',
  body?: unknown,
  csrf = true,
): Promise<{ status: number; data: T }> {
  return page.evaluate(
    async ({ path, method, body, csrf }) => {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      if (csrf && method !== 'GET')
        headers['X-XSRF-TOKEN'] = decodeURIComponent(
          document.cookie
            .split('; ')
            .find((c) => c.startsWith('XSRF-TOKEN='))
            ?.slice(11) ?? '',
        )
      const response = await fetch(`http://localhost:8000${path}`, {
        credentials: 'include',
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return {
        status: response.status,
        data: response.status === 204 ? null : await response.json(),
      }
    },
    { path, method, body, csrf },
  )
}
