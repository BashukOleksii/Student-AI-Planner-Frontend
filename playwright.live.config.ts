import { defineConfig } from '@playwright/test'
import base from './playwright.live-base'
import { authorizeLive } from './e2e/support/liveSafety'
// Legacy account-creating flow now requires explicit registration authorization.
authorizeLive('registration')
export default defineConfig(base)
