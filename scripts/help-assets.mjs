import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const assets = {
  'docsify.min.js': 'docsify/dist/docsify.min.js',
  'search.min.js': 'docsify/dist/plugins/search.min.js',
  'core.min.css': 'docsify/dist/themes/core.min.css',
  'docsify-LICENSE': 'docsify/LICENSE',
  'manrope-LICENSE': '@fontsource/manrope/LICENSE',
}
for (const subset of ['latin', 'cyrillic']) {
  for (const weight of [400, 600, 700]) {
    const name = `manrope-${subset}-${weight}-normal.woff2`
    assets[name] = `@fontsource/manrope/files/${name}`
  }
}
await mkdir(new URL('public/help/vendor/', root), { recursive: true })
for (const [name, source] of Object.entries(assets)) {
  await copyFile(
    new URL(`node_modules/${source}`, root),
    new URL(`public/help/vendor/${name}`, root),
  )
}
console.log(
  `Help: copied ${Object.keys(assets).length} local assets to ${fileURLToPath(new URL('public/help/vendor/', root))}`,
)
