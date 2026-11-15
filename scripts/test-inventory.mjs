import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const run = (...args) =>
  JSON.parse(
    execFileSync(process.execPath, args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }),
  )
const vitest = run(
  'node_modules/vitest/vitest.mjs',
  'list',
  '--config',
  'tests/config/vitest.config.ts',
  '--no-staticParse',
  '--json',
)
const browserList = (config) =>
  run(
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config',
    `tests/config/${config}`,
    '--list',
    '--reporter=json',
  )
const specs = (suite) => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(specs)]
const discovered = (report) => {
  if (report.errors?.length) throw new Error(JSON.stringify(report.errors))
  return report.suites.flatMap(specs).map((spec) => ({ file: spec.file, title: spec.title }))
}
// Importing guarded configs may inspect Laravel or demand a paid-provider opt-in.
// Read their fixed declarations without importing a config or bypassing a gate.
function guardedInventory(directory) {
  const items = []
  for (const name of readdirSync(resolve(root, directory)).filter((name) => name.endsWith('.ts'))) {
    const file = resolve(root, directory, name)
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression.getText(source)
        if (expression.startsWith('test.each') || expression.startsWith('test.describe.each'))
          throw new Error(`Expand the guarded inventory explicitly: ${file}`)
        if (expression === 'test') {
          if (!ts.isStringLiteral(node.arguments[0]))
            throw new Error(`Expected a fixed guarded scenario title: ${file}`)
          items.push({ file: relative(root, file), title: node.arguments[0].text })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return items
}
const groups = {
  unit: vitest.filter((item) => item.file.includes('/tests/unit/')),
  integration: vitest.filter((item) => item.file.includes('/tests/integration/')),
  offline: discovered(browserList('playwright.config.ts')),
  fullstack: guardedInventory('e2e/fullstack'),
  live: guardedInventory('e2e/live'),
  media: discovered(browserList('playwright.help-media.config.ts')),
}
if (groups.unit.length + groups.integration.length !== vitest.length)
  throw new Error('Every Vitest case must have exactly one category.')
const counts = Object.fromEntries(
  Object.entries(groups).map(([name, items]) => [name, items.length]),
)
const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
console.log(
  JSON.stringify(
    {
      counts,
      total,
      limit: 350,
      methods: {
        unit: 'vitest list --no-staticParse',
        integration: 'vitest list --no-staticParse',
        offline: 'playwright test --list',
        media: 'playwright test --list',
        fullstack: 'fixed AST declarations; also verify --list through the isolated runner',
        live: 'fixed AST declarations; guarded configs were not imported',
      },
      guardedScenarios: { fullstack: groups.fullstack, live: groups.live },
    },
    null,
    2,
  ),
)
if (total > 350) process.exitCode = 1
