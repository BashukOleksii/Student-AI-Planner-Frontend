import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import base from './playwright.live-base'
import { authorizeLive } from '../../e2e/support/liveSafety'
const authorization = authorizeLive('system')
export default defineConfig(base, {
  testMatch: ['**/system.live.spec.ts', '**/stage15.live.spec.ts'],
  timeout: 180000,
  outputDir: fileURLToPath(new URL('../../test-results/system-live', import.meta.url)),
  use: { storageState: authorization.storageState, trace: 'off' },
})
