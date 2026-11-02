import { createRequire } from 'node:module'
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(resolve(projectRoot, 'package.json'))
if (!process.argv[2]) throw Error('Передайте шлях до mermaid/dist/mermaid.min.js')
const mermaidBundle = resolve(process.argv[2])
const mermaidVersion = JSON.parse(
  readFileSync(resolve(dirname(mermaidBundle), '../package.json'), 'utf8'),
).version
const { chromium } = require('@playwright/test')
const root = resolve(projectRoot, 'docs/defense/diagrams')
const output = resolve(process.argv[3] || '/tmp/student-planner-stage9-diagrams')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.addScriptTag({ path: mermaidBundle })
  await page.evaluate(() =>
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      fontFamily: 'Arial',
      flowchart: { useMaxWidth: false },
      sequence: { useMaxWidth: false },
      er: { useMaxWidth: false },
    }),
  )
  const files = readdirSync(root)
    .filter((name) => name.endsWith('.mmd'))
    .sort()
  if (files.length !== 9) throw Error(`Expected nine diagrams, found ${files.length}`)
  for (const [i, file] of files.entries()) {
    const source = readFileSync(resolve(root, file), 'utf8')
    const result = await page.evaluate(
      async ({ source, i }) => {
        const parsed = await mermaid.parse(source)
        const { svg } = await mermaid.render(`defenseDiagram${i}`, source)
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
        if (doc.querySelector('parsererror')) throw Error('Invalid SVG')
        return {
          type: parsed.diagramType,
          svg,
          viewBox: doc.documentElement.getAttribute('viewBox'),
        }
      },
      { source, i },
    )
    writeFileSync(resolve(output, file.replace('.mmd', '.svg')), result.svg)
    await page.setContent(result.svg)
    await page.addStyleTag({
      content: 'body{margin:0;background:white}svg{max-width:1500px;height:auto;display:block}',
    })
    await page
      .locator('body > svg')
      .screenshot({ path: resolve(output, file.replace('.mmd', '.png')) })
    results.push({ file, type: result.type, viewBox: result.viewBox, parsed: true, rendered: true })
    console.log(`PASS ${file}: parse and SVG render`)
  }
  writeFileSync(
    resolve(output, 'validation-results.json'),
    JSON.stringify({ mermaid_version: mermaidVersion, results }, null, 2),
  )
} finally {
  await browser.close()
}
