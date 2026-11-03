import { spawn } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'
import { chromium } from '@playwright/test'

function start(args) {
  return spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...args], { stdio: 'inherit' })
}
async function ready(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Vite exited: ${child.exitCode}`)
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* Server starting. */
    }
    await setTimeout(100)
  }
  throw new Error(`Server did not start: ${url}`)
}
async function check(args, url) {
  const server = start(args)
  let browser
  try {
    await ready(url, server)
    browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const failures = []
    page.on('pageerror', (e) => failures.push(e.message))
    page.on('response', (r) => {
      if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`)
    })
    await page.route('http://localhost:8000/**', (route) => route.abort())
    await page.goto(url)
    await page.locator('.cover-main').waitFor()
    await page.goto(`${url}#/guide/tasks`)
    await page.locator('#main h1').filter({ hasText: 'Завдання та підзавдання' }).waitFor()
    await page.locator('#main img').evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode()))
    })
    const back = await page.locator('.back-to-app').getAttribute('href')
    if (new URL(back, url).href !== new URL('../', url).href)
      throw new Error('Wrong app return URL')
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error('Mobile overflow')
    if (failures.length) throw new Error(failures.join('\n'))
    console.log(`PASS: ${url}, tasks deep link, genuine media, app return and mobile width`)
  } finally {
    await browser?.close()
    server.kill('SIGTERM')
    if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve))
  }
}
await check(
  ['--host', 'localhost', '--port', '5178', '--strictPort'],
  'http://localhost:5178/help/',
)
const build = start(['build', '--base=/planner/', '--outDir=node_modules/.tmp/help-base'])
const status = await new Promise((resolve) => build.once('exit', resolve))
if (status !== 0) throw new Error(`Prefixed build exited: ${status}`)
await check(
  [
    'preview',
    '--base=/planner/',
    '--outDir=node_modules/.tmp/help-base',
    '--host',
    'localhost',
    '--port',
    '4178',
    '--strictPort',
  ],
  'http://localhost:4178/planner/help/',
)
