import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    // Developer overlay is outside the product UI and fails axe in real Vite runs.
    ...(mode === 'integration' ? [] : [vueDevTools()]),
    {
      name: 'help-static-entry',
      configureServer(server) {
        // Dev's public-file middleware does not resolve directory indexes.
        // Rewrite only this entry before the SPA history fallback runs.
        server.middlewares.use((req, _res, next) => {
          const url = new URL(req.url ?? '/', 'http://vite.local')
          if (url.pathname === `${server.config.base}help/`)
            req.url = `${server.config.base}help/index.html${url.search}`
          next()
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
