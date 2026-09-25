#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const result = spawnSync('npm', ['pack', '--json'], { cwd: root, encoding: 'utf8' })
if (result.error) throw result.error
if (result.status !== 0) {
  console.error(result.stderr || result.stdout)
  process.exit(result.status || 1)
}
let parsed = null
try { parsed = JSON.parse(result.stdout) } catch { console.log(result.stdout.trim()) }
if (Array.isArray(parsed) && parsed.length > 0) {
  for (const item of parsed) console.log(path.join(root, item.filename))
} else if (result.stdout.trim()) {
  console.log(result.stdout.trim())
}
