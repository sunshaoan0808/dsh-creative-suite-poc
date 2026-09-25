#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const PROFILE = process.env.DSH_CREATIVE_PROFILE || 'creative'
const PORT = process.env.BROWSER_E2E_PORT || '3093'

function startDsh() {
  const child = spawn('dsh', ['--profile', PROFILE, '--port', PORT, '--no-open'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  let url = ''
  child.stdout.on('data', chunk => {
    output += chunk.toString()
    const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/.exec(output)
    if (match && !url) url = match[0]
  })
  child.stderr.on('data', chunk => { output += chunk.toString() })
  return { child, getUrl: () => url, getOutput: () => output }
}

async function waitForUrl(server, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (!server.getUrl() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return server.getUrl()
}

async function main() {
  const require = createRequire('/root/.dsh/apps/dsh-tavern/package.json')
  const { chromium } = require('playwright')
  const server = startDsh()
  try {
    const url = await waitForUrl(server)
    if (!url) throw new Error('DSH Web 启动超时')
    let browser
    try {
      browser = await chromium.launch({ headless: true })
    } catch (error) {
      console.error('BROWSER_E2E_BLOCKED')
      console.error(String(error && error.message || error).slice(0, 1200))
      console.error('Hint: npx playwright install-deps')
      process.exitCode = 2
      return
    }
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(3000)
      const text = await page.evaluate(() => document.body.innerText)
      const ok = text.includes('创作') || text.includes('DSH') || text.includes('对话')
      console.log(JSON.stringify({ ok, profile: PROFILE, url: url.replace(/token=\S+/, 'token=***'), bodyHead: text.slice(0, 400) }, null, 2))
      process.exitCode = ok ? 0 : 1
    } finally {
      await browser.close()
    }
  } finally {
    server.child.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 800))
    if (!server.child.killed) server.child.kill('SIGKILL')
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
