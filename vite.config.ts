import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    ...(mode === 'integration' ? [] : [vueDevTools()]),
    {
      name: 'help-static-entry',
      configureServer(server) {
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
