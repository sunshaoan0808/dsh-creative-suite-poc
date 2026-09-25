import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile } from 'node:fs/promises'
import { apply } from '../lib/index.js'

async function boot() {
  const dshHome = await mkdtemp(path.join(os.tmpdir(), 'creative-p67-'))
  process.env.DSH_HOME = dshHome
  const registrations = []
  const ctx = {
    logger: { info() {}, warn() {} },
    provide() {},
    get() { return null },
    effect(fn) { return fn() },
    inject(deps, fn) {
      if (deps.includes('webServer')) {
        const routeCtx = { ...ctx, llm: {}, agentDefaultModel: { currentSelection: () => null } }
        routeCtx.effect = (f) => f()
        routeCtx.webServer = { register: (r) => registrations.push(r) }
        fn(routeCtx)
      }
    }
  }
  await apply(ctx, {})
  assert.equal(registrations.length, 1)
  const handler = registrations[0].handler
  return { dshHome, handler }
}

function callRoute(handler, method, url, body) {
  return new Promise((resolve, reject) => {
    import('node:events').then(({ EventEmitter }) => {
      const req = new EventEmitter()
      req.method = method
      req.url = url
      const res = {
        status: 0,
        payload: null,
        writeHead(status) { this.status = status },
        end(text) {
          try { this.payload = JSON.parse(String(text)) } catch { this.payload = String(text) }
          resolve(this)
        }
      }
      Promise.resolve(handler(req, res)).catch(reject)
      if (body !== undefined) {
        const raw = Buffer.from(JSON.stringify(body))
        req.emit('data', raw)
      }
      req.emit('end')
    }).catch(reject)
  })
}

test('P6-7: create -> update x2 -> versions -> diff -> rollback -> persist', async () => {
  const { dshHome, handler } = await boot()
  const created = await callRoute(handler, 'POST', '/plugins/creative-suite/resources/scripts', { id: 'p67-demo', name: 'demo', data: { title: 'v1', count: 1, nested: { a: 1 } } })
  assert.equal(created.status, 200)
  assert.equal(created.payload.resource.version, 1)

  const u1 = await callRoute(handler, 'PATCH', '/plugins/creative-suite/resources/scripts/p67-demo', { data: { title: 'v2', count: 2 } })
  assert.equal(u1.payload.resource.version, 2)
  assert.equal(u1.payload.resource.data.title, 'v2')
  assert.deepEqual(u1.payload.resource.data.nested, { a: 1 })

  const u2 = await callRoute(handler, 'PATCH', '/plugins/creative-suite/resources/scripts/p67-demo', { data: { title: 'v3', extra: true } })
  assert.equal(u2.payload.resource.version, 3)

  const versions = await callRoute(handler, 'GET', '/plugins/creative-suite/resources/scripts/p67-demo/versions')
  assert.equal(versions.status, 200)
  assert.equal(versions.payload.currentVersion, 3)
  assert.deepEqual(versions.payload.versions.map(v => v.version).sort(), [1, 2, 3])

  const snap1 = await callRoute(handler, 'GET', '/plugins/creative-suite/resources/scripts/p67-demo/versions/1')
  assert.equal(snap1.status, 200)
  assert.equal(snap1.payload.snapshot.data.title, 'v1')

  const diff = await callRoute(handler, 'GET', '/plugins/creative-suite/resources/scripts/p67-demo/diff?from=1&to=3')
  assert.equal(diff.status, 200)
  const paths = diff.payload.diff.map(d => d.path).sort()
  assert.ok(paths.includes('title'))
  assert.ok(paths.includes('count') || paths.includes('extra'))

  const rb = await callRoute(handler, 'POST', '/plugins/creative-suite/resources/scripts/p67-demo/rollback', { version: 1 })
  assert.equal(rb.status, 200)
  assert.equal(rb.payload.resource.version, 4)
  assert.equal(rb.payload.resource.data.title, 'v1')

  const versions2 = await callRoute(handler, 'GET', '/plugins/creative-suite/resources/scripts/p67-demo/versions')
  assert.deepEqual(versions2.payload.versions.map(v => v.version).sort(), [1, 2, 3, 4])

  // invalid version
  const bad = await callRoute(handler, 'POST', '/plugins/creative-suite/resources/scripts/p67-demo/rollback', { version: 99 })
  assert.equal(bad.status, 400)

  // persisted file contains histories
  const raw = JSON.parse(await readFile(path.join(dshHome, 'storages', 'creative-suite.json'), 'utf8'))
  assert.ok(raw.resourceHistories.scripts['p67-demo'].length >= 3)

  // delete also clears history
  const del = await callRoute(handler, 'DELETE', '/plugins/creative-suite/resources/scripts/p67-demo')
  assert.equal(del.status, 200)
  const raw2 = JSON.parse(await readFile(path.join(dshHome, 'storages', 'creative-suite.json'), 'utf8'))
  assert.equal(raw2.resourceHistories.scripts['p67-demo'], undefined)
})

test('P6-7: legacy store without histories stays compatible', async () => {
  const { dshHome, handler } = await boot()
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(path.join(dshHome, 'storages'), { recursive: true })
  await writeFile(path.join(dshHome, 'storages', 'creative-suite.json'), JSON.stringify({ version: 1, resources: { scripts: { legacy: { id: 'legacy', kind: 'scripts', name: 'legacy', version: 5, createdAt: 1, updatedAt: 2, data: { x: 1 } } }, cards: {}, worldbooks: {}, presets: {}, styles: {}, novels: {}, summaries: {}, sessions: {}, stories: {} }, updatedAt: 2 }), 'utf8')
  // legacy file normalizes without crash
  const { normalizeStore } = await import('../lib/index.js')
  const legacy = { version: 1, resources: { scripts: { legacy: { id: 'legacy' } } }, updatedAt: 2 }
  const norm = normalizeStore(legacy)
  assert.ok(norm.resources.scripts.legacy)
  assert.deepEqual(norm.resourceHistories.scripts, {})
})
