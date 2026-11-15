import { defineConfig } from '@playwright/test'
import base from './playwright.live-base'
import { authorizeLive } from './e2e/support/liveSafety'

authorizeLive('registration')
export default defineConfig(base)
