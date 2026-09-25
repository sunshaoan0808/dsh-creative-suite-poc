#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PACKAGE_NAME = 'dsh-creative-suite-poc'
const SCRIPT_PATH = fileURLToPath(import.meta.url)
const PACKAGE_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..')
const VERSION_MATRIX_MODULE = path.join(PACKAGE_ROOT, 'lib', 'version-matrix.js')
const DSH_BIN = process.env.DSH_BIN || 'dsh'

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function profilePath(profile) {
  return path.join(dshHome(), 'profiles', profile)
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    cwd: options.cwd || process.cwd()
  })
}

function dumpConfig(profile) {
  const result = run(DSH_BIN, ['--profile', profile, '--dump-config'], { capture: true })
  if (result.error) throw new Error(`无法运行 ${DSH_BIN}: ${result.error.message}`)
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (result.status !== 0) throw new Error(output.trim() || `${DSH_BIN} --dump-config exited ${result.status}`)
  return output
}

function inspectProfile(profile) {
  const dir = profilePath(profile)
  const packageFile = path.join(dir, 'package.json')
  const output = dumpConfig(profile)
  return {
    profile,
    profileDir: dir,
    profileExists: existsSync(packageFile),
    packageInstalled: output.includes(PACKAGE_NAME),
    modeEntry: output.includes("- id: creative-suite"),
    profilePackage: existsSync(packageFile) ? readJson(packageFile) : null
  }
}

function printStatus(profile) {
  const state = inspectProfile(profile)
  console.log(JSON.stringify({
    ok: state.packageInstalled && state.modeEntry,
    package: PACKAGE_NAME,
    profile: state.profile,
    profileDir: state.profileDir,
    profileExists: state.profileExists,
    packageInstalled: state.packageInstalled,
    modeEntry: state.modeEntry,
    bundles: state.profilePackage && state.profilePackage.dsh && state.profilePackage.dsh.profile ? state.profilePackage.dsh.profile.bundles : null
  }, null, 2))
  return state.packageInstalled && state.modeEntry
}

function install(profile) {
  const result = run(DSH_BIN, ['plugin', '--profile', profile, 'add', PACKAGE_ROOT])
  if (result.error) throw new Error(`无法运行 ${DSH_BIN}: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${DSH_BIN} plugin add exited ${result.status}`)
  return printStatus(profile)
}

function fusionPlan(profile) {
  const dir = profilePath(profile)
  const packageFile = path.join(dir, 'package.json')
  if (!existsSync(packageFile)) throw new Error(`profile 不存在：${packageFile}`)
  const pkg = readJson(packageFile)
  const dependencies = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}
  const profileSection = pkg.dsh && pkg.dsh.profile && typeof pkg.dsh.profile === 'object' ? pkg.dsh.profile : {}
  const bundles = Array.isArray(profileSection.bundles) ? profileSection.bundles : []
  return {
    profile,
    packageFile,
    backupDir: path.join(dshHome(), 'backups'),
    dependency: dependencies[PACKAGE_NAME] || null,
    dependencyNeeded: dependencies[PACKAGE_NAME] !== `link:${PACKAGE_ROOT}`,
    bundleNeeded: !bundles.includes(PACKAGE_NAME),
    bundles
  }
}

function linkFusion(profile, plan, backupFile) {
  const pkg = readJson(plan.packageFile)
  pkg.dependencies = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}
  pkg.dependencies[PACKAGE_NAME] = `link:${PACKAGE_ROOT}`
  pkg.dsh = pkg.dsh && typeof pkg.dsh === 'object' ? pkg.dsh : {}
  pkg.dsh.profile = pkg.dsh.profile && typeof pkg.dsh.profile === 'object' ? pkg.dsh.profile : {}
  pkg.dsh.profile.bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []
  if (!pkg.dsh.profile.bundles.includes(PACKAGE_NAME)) pkg.dsh.profile.bundles.push(PACKAGE_NAME)
  writeFileSync(plan.packageFile, JSON.stringify(pkg, null, 2) + '\n')
  const nodeModules = path.join(path.dirname(plan.packageFile), 'node_modules')
  mkdirSync(nodeModules, { recursive: true })
  const target = path.join(nodeModules, PACKAGE_NAME)
  rmSync(target, { recursive: true, force: true })
  symlinkSync(PACKAGE_ROOT, target, 'dir')
  const ok = printStatus(profile)
  console.log(JSON.stringify({ ok, profile, mode: 'link', backupFile, rollback: `cp ${backupFile} ${plan.packageFile} && rm -rf ${target}` }, null, 2))
  return ok
}

function fusion(profile, apply, linkMode = false) {
  const plan = fusionPlan(profile)
  if (!apply) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      mode: linkMode ? 'link' : 'plugin',
      ...plan,
      plannedChanges: [
        plan.dependencyNeeded ? `dependencies.${PACKAGE_NAME} = link:${PACKAGE_ROOT}` : null,
        plan.bundleNeeded ? `dsh.profile.bundles += ${PACKAGE_NAME}` : null,
        linkMode ? `node_modules/${PACKAGE_NAME} -> ${PACKAGE_ROOT}` : null
      ].filter(Boolean)
    }, null, 2))
    return true
  }
  mkdirSync(plan.backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = path.join(plan.backupDir, `${profile}-package-${stamp}.json`)
  copyFileSync(plan.packageFile, backupFile)
  if (linkMode) return linkFusion(profile, plan, backupFile)
  const result = run(DSH_BIN, ['plugin', '--profile', profile, 'add', PACKAGE_ROOT])
  if (result.error) throw new Error(`无法运行 ${DSH_BIN}: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${DSH_BIN} plugin add exited ${result.status}`)
  const ok = printStatus(profile)
  console.log(JSON.stringify({ ok, profile, mode: 'plugin', backupFile, rollback: `cp ${backupFile} ${plan.packageFile} && dsh plugin --profile ${profile} install` }, null, 2))
  return ok
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function matrix(profile, outPath) {
  const { buildVersionMatrix, renderVersionMatrixMarkdown } = await import(pathToFileURL(VERSION_MATRIX_MODULE).href)
  const pkg = readJson(path.join(PACKAGE_ROOT, 'package.json'))
  const dshResult = run(DSH_BIN, ['--version'], { capture: true })
  const dshVersion = dshResult.status === 0 ? String(dshResult.stdout || '').trim() : null
  let deps = {}
  const npmResult = run('npm', ['ls', '--json', '--depth=0'], { capture: true, cwd: PACKAGE_ROOT })
  try {
    const parsed = JSON.parse(npmResult.stdout || '{}')
    deps = parsed.dependencies || {}
  } catch (_error) {}
  let constants = {}
  try {
    constants = await import(pathToFileURL(path.join(PACKAGE_ROOT, 'lib', 'index.js')).href)
  } catch (_error) {}
  const value = buildVersionMatrix({
    pocVersion: pkg.version,
    nodeVersion: process.version,
    dshVersion,
    cordisVersion: deps['@deepseek-ai/cordis'] && deps['@deepseek-ai/cordis'].version || null,
    reactVersion: deps.react && deps.react.version || null,
    ajvVersion: deps.ajv && deps.ajv.version || null,
    playwrightVersion: deps.playwright && deps.playwright.version || null,
    storeVersion: constants.STORE_VERSION ?? null,
    storageDomain: constants.STORAGE_DOMAIN || null,
    tavernApiVersion: process.env.DSH_TAVERN_API_VERSION || null,
    browserScriptRuntime: process.env.DSH_TAVERN_BROWSER_SCRIPT_RUNTIME || null
  })
  const markdown = renderVersionMatrixMarkdown(value)
  if (outPath) {
    writeFileSync(outPath, markdown)
    console.log(outPath)
  } else {
    console.log(markdown)
  }
  return true
}

function dshAvailable() {
  try {
    const probe = spawnSync(DSH_BIN, ['--version'], { stdio: 'pipe', encoding: 'utf8' })
    if (probe.error) return { ok: false, error: probe.error }
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

async function bootRouteHandler() {
  const { apply } = await import(pathToFileURL(path.join(PACKAGE_ROOT, 'lib', 'index.js')).href)
  const registrations = []
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    provide() {},
    get() { return null },
    effect(fn) { return fn() },
    inject(deps, fn) {
      if (Array.isArray(deps) && deps.includes('webServer')) {
        const routeCtx = { ...ctx, llm: {}, agentDefaultModel: { currentSelection: () => null } }
        routeCtx.effect = (f) => f()
        routeCtx.webServer = { register: (r) => registrations.push(r) }
        fn(routeCtx)
      }
    }
  }
  await apply(ctx, {})
  const registration = registrations[0]
  if (!registration || typeof registration.handler !== 'function') throw new Error('route-level 启动失败：web handler 未注册')
  return registration.handler
}

function callRouteHandler(handler, method, url, body) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter()
    req.method = method
    req.url = url
    const res = {
      status: 0,
      headers: null,
      payload: null,
      writeHead(status, headers) { this.status = status; this.headers = headers || null },
      end(text) {
        try { this.payload = JSON.parse(String(text)) } catch { this.payload = String(text) }
        resolve(this)
      }
    }
    Promise.resolve(handler(req, res)).catch(reject)
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
}

async function smokeRouteLevel(profile, diagnosis) {
  const handler = await bootRouteHandler()
  const result = await callRouteHandler(handler, 'GET', '/plugins/creative-suite/status')
  if (result.status !== 200 || !result.payload || result.payload.ok === false) {
    throw new Error(`route-level 状态接口失败：HTTP ${result.status} ${JSON.stringify(result.payload)}`)
  }
  console.log(JSON.stringify({
    ok: true,
    mode: 'route-level',
    profile,
    diagnosis,
    status: result.payload
  }, null, 2))
  return true
}

async function smoke(profile, port = 0, timeoutMs = 60000) {
  const routeLevelOnly = process.argv.includes('--route-level')
  if (routeLevelOnly) {
    return smokeRouteLevel(profile, { reason: 'flag', detail: '通过 --route-level 直接使用 route-level 模式（跳过 dsh web 启动）' })
  }
  const availability = dshAvailable()
  if (!availability.ok) {
    const detail = `dsh 二进制缺失或无法运行（DSH_BIN=${DSH_BIN}）：${availability.error.message}`
    try {
      return await smokeRouteLevel(profile, { reason: 'dsh-missing', detail })
    } catch (routeError) {
      console.log(JSON.stringify({
        ok: false,
        mode: 'route-level',
        profile,
        diagnosis: { reason: 'dsh-missing', detail, routeError: routeError instanceof Error ? routeError.message : String(routeError) }
      }, null, 2))
      return false
    }
  }
  const args = ['--profile', profile, '--port', String(port), '--no-open']
  const child = spawn(DSH_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
  let output = ''
  let url = ''
  let exited = false
  let spawnError = null
  child.on('exit', () => { exited = true })
  child.on('error', error => { spawnError = error; exited = true })
  child.stdout.on('data', chunk => {
    output += chunk.toString()
    const match = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=\S+/.exec(output)
    if (match && !url) url = match[0]
  })
  child.stderr.on('data', chunk => { output += chunk.toString() })
  const deadline = Date.now() + timeoutMs
  try {
    while (!url && Date.now() < deadline) {
      if (exited) throw new Error(`DSH 提前退出：\n${output.slice(-2000)}`)
      await sleep(250)
    }
    if (!url) throw new Error(`等待 DSH Web 启动超时：\n${output.slice(-2000)}`)
    const origin = new URL(url).origin
    const response = await fetch(origin + '/plugins/creative-suite/status', { signal: AbortSignal.timeout(10000) })
    const payload = await response.json()
    if (!response.ok || payload.ok === false) throw new Error(`状态接口失败：HTTP ${response.status} ${JSON.stringify(payload)}`)
    console.log(JSON.stringify({
      ok: true,
      mode: 'web',
      profile,
      webUrl: url,
      status: payload
    }, null, 2))
    return true
  } catch (webError) {
    const reason = spawnError && spawnError.code === 'ENOENT' ? 'dsh-missing' : 'web-timeout'
    const detail = webError instanceof Error ? webError.message : String(webError)
    try {
      return await smokeRouteLevel(profile, { reason, detail })
    } catch (routeError) {
      console.log(JSON.stringify({
        ok: false,
        mode: 'route-level',
        profile,
        diagnosis: { reason, detail, routeError: routeError instanceof Error ? routeError.message : String(routeError) }
      }, null, 2))
      return false
    }
  } finally {
    if (!exited) {
      child.kill('SIGTERM')
      await sleep(500)
      if (!exited) child.kill('SIGKILL')
    }
  }
}

function summarizeStoreCounts(store) {
  const counts = {}
  const resources = store && store.resources && typeof store.resources === 'object' ? store.resources : {}
  for (const [type, items] of Object.entries(resources)) {
    counts[type] = items && typeof items === 'object' ? Object.keys(items).length : 0
  }
  return counts
}

async function migrateStore(from, to, dryRun) {
  if (!from) throw new Error('migrate 需要 --from <legacy.json>（旧格式存储文件）')
  if (!existsSync(from)) throw new Error(`输入文件不存在：${from}`)
  const { migrateLegacyStore } = await import(pathToFileURL(path.join(PACKAGE_ROOT, 'lib', 'migrator.js')).href)
  const legacy = JSON.parse(readFileSync(from, 'utf8'))
  const store = migrateLegacyStore(legacy)
  const counts = summarizeStoreCounts(store)
  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, from, to: to || null, version: store.version, counts }, null, 2))
    return true
  }
  if (to) {
    mkdirSync(path.dirname(path.resolve(to)), { recursive: true })
    writeFileSync(to, JSON.stringify(store, null, 2) + '\n')
    console.log(JSON.stringify({ ok: true, from, to, version: store.version, counts }, null, 2))
  } else {
    process.stdout.write(JSON.stringify(store, null, 2) + '\n')
  }
  return true
}

function usage() {
  console.log(`用法：
  dsh-creative-suite status --profile <name>
  dsh-creative-suite install --profile <name>
  dsh-creative-suite smoke --profile <name> [--port <number>] [--timeout <ms>]
  dsh-creative-suite smoke --profile <name> [--route-level]
  dsh-creative-suite fusion --profile <name> [--apply] [--link]
  dsh-creative-suite matrix [--out <file>]
  dsh-creative-suite migrate --from <legacy.json> [--to <store.json>] [--dry-run]

默认 profile：creative
PACKAGE_ROOT：${PACKAGE_ROOT}`)
}

async function main() {
  const args = process.argv.slice(2)
  const action = args[0] || 'status'
  const profileIndex = args.indexOf('--profile')
  const profile = profileIndex >= 0 ? args[profileIndex + 1] : (process.env.DSH_CREATIVE_PROFILE || 'creative')
  const portIndex = args.indexOf('--port')
  const port = portIndex >= 0 ? Number(args[portIndex + 1]) || 0 : 0
  const timeoutIndex = args.indexOf('--timeout')
  const timeoutMs = timeoutIndex >= 0 ? Number(args[timeoutIndex + 1]) || 60000 : 60000
  const apply = args.includes('--apply')
  const linkMode = args.includes('--link')
  const dryRun = args.includes('--dry-run')
  const fromIndex = args.indexOf('--from')
  const from = fromIndex >= 0 ? args[fromIndex + 1] : null
  const toIndex = args.indexOf('--to')
  const to = toIndex >= 0 ? args[toIndex + 1] : null
  const outIndex = args.indexOf('--out')
  const outPath = outIndex >= 0 ? args[outIndex + 1] : ''

  if (action === 'status') process.exitCode = printStatus(profile) ? 0 : 1
  else if (action === 'install') process.exitCode = install(profile) ? 0 : 1
  else if (action === 'smoke') {
    try { process.exitCode = (await smoke(profile, port, timeoutMs)) ? 0 : 1 } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
  } else if (action === 'migrate') {
    try { process.exitCode = (await migrateStore(from, to, dryRun)) ? 0 : 1 } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
  } else if (action === 'fusion') {
    try { process.exitCode = fusion(profile, apply, linkMode) ? 0 : 1 } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
  } else if (action === 'matrix') {
    try { process.exitCode = (await matrix(profile, outPath)) ? 0 : 1 } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
  } else if (action === 'help' || action === '--help' || action === '-h') usage()
  else { usage(); process.exitCode = 2 }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
