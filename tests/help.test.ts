import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const root = resolve('public/help')
const markdown = [
  'README.md',
  '_sidebar.md',
  '_coverpage.md',
  '_404.md',
  ...readdirSync(`${root}/guide`).map((name) => `guide/${name}`),
]

describe('public user manual', () => {
  it('has all 17 guide pages, homepage and no broken local Markdown/media links', () => {
    expect(markdown.filter((file) => file.startsWith('guide/'))).toHaveLength(17)
    for (const file of markdown) {
      const source = readFileSync(resolve(root, file), 'utf8')
      for (const match of source.matchAll(/(!?)\[([^\]]*)\]\(([^\s)]+)[^)]*\)/g)) {
        const [, image, label, href] = match
        expect(label?.trim(), `${file}: accessible link/image`).toBeTruthy()
        if (/^https?:|^#/.test(href!)) continue
        const path = href!.split(/[?#]/)[0]!
        // Docsify routes are root-relative by default; media URLs use page directories.
        const target = image
          ? resolve(root, dirname(file), path)
          : path.endsWith('.xlsx')
            ? resolve(root, path)
            : resolve(root, path === '/' ? 'README.md' : path.replace(/^\//, ''))
        expect(existsSync(target), `${file}: ${href} → ${target}`).toBe(true)
      }
    }
  })
  it('keeps authored HTML/JS/CSS assets local and present', () => {
    for (const file of ['index.html', 'styles/main.css']) {
      const source = readFileSync(resolve(root, file), 'utf8')
      const links = file.endsWith('.html')
        ? [...source.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!)
        : [...source.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]!)
      for (const link of links) {
        expect(link).not.toMatch(/^https?:|^\/\//)
        expect(existsSync(resolve(root, dirname(file), link)), `${file}: ${link}`).toBe(true)
      }
    }
    expect(readFileSync(`${root}/index.html`, 'utf8')).toContain('lang="uk"')
    expect(readFileSync('package.json', 'utf8')).toContain('"docsify": "5.1.0"')
  })
})
