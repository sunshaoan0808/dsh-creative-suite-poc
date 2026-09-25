import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { apply } from '../lib/index.js'

async function boot() {
  const dshHome = await mkdtemp(path.join(os.tmpdir(), 'creative-p44-'))
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
  return { dshHome, handler: registrations[0].handler }
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
        req.emit('data', Buffer.from(JSON.stringify(body)))
      }
      req.emit('end')
    }).catch(reject)
  })
}

test('P4-4: project CRUD (create/read/list/update/delete)', async () => {
  const { handler } = await boot()
  const created = await callRoute(handler, 'POST', '/plugins/creative-suite/story/projects', { id: 'p44-demo', name: 'P44 Demo', kind: 'novel' })
  assert.equal(created.status, 200)
  assert.equal(created.payload.project.id, 'p44-demo')

  const list = await callRoute(handler, 'GET', '/plugins/creative-suite/story/projects')
  assert.equal(list.status, 200)
  assert.ok(list.payload.projects.some(p => p.id === 'p44-demo'))

  const got = await callRoute(handler, 'GET', '/plugins/creative-suite/story/projects/p44-demo')
  assert.equal(got.status, 200)
  assert.equal(got.payload.project.name, 'P44 Demo')
  assert.ok(Array.isArray(got.payload.files))
  assert.ok(got.payload.files.some(f => f.path === 'README.md'))

  const updated = await callRoute(handler, 'PUT', '/plugins/creative-suite/story/projects/p44-demo', { name: 'P44 Renamed' })
  assert.equal(updated.status, 200)
  assert.equal(updated.payload.project.name, 'P44 Renamed')

  const patched = await callRoute(handler, 'PATCH', '/plugins/creative-suite/story/projects/p44-demo', { name: 'P44 Patched' })
  assert.equal(patched.status, 200)
  assert.equal(patched.payload.project.name, 'P44 Patched')

  const removed = await callRoute(handler, 'DELETE', '/plugins/creative-suite/story/projects/p44-demo')
  assert.equal(removed.status, 200)
  assert.equal(removed.payload.removed, 'p44-demo')

  const list2 = await callRoute(handler, 'GET', '/plugins/creative-suite/story/projects')
  assert.ok(!list2.payload.projects.some(p => p.id === 'p44-demo'))
})

test('P4-4: file CRUD (create/read/list/update/delete)', async () => {
  const { handler } = await boot()
  await callRoute(handler, 'POST', '/plugins/creative-suite/story/projects', { id: 'p44-files', name: 'P44 Files', kind: 'novel' })

  const created = await callRoute(handler, 'POST', '/plugins/creative-suite/story/projects/p44-files/file', { path: 'notes/hello.md', text: '# hello' })
  assert.equal(created.status, 200)
  assert.equal(created.payload.path, 'notes/hello.md')

  const read = await callRoute(handler, 'GET', '/plugins/creative-suite/story/projects/p44-files/file?path=' + encodeURIComponent('notes/hello.md'))
  assert.equal(read.status, 200)
  assert.equal(read.payload.text, '# hello')

  const listed = await callRoute(handler, 'GET', '/plugins/creative-suite/story/projects/p44-files/files')
  assert.equal(listed.status, 200)
  assert.ok(listed.payload.files.some(f => f.path === 'notes/hello.md'))

  const updated = await callRoute(handler, 'PUT', '/plugins/creative-suite/story/projects/p44-files/file', { path: 'notes/hello.md', text: '# hello v2' })
  assert.equal(updated.status, 200)
  assert.equal(updated.payload.updated, true)

  const reread = await callRoute(handler, 'GET', '/plugins/creative-suite/story/projects/p44-files/file?path=' + encodeURIComponent('notes/hello.md'))
  assert.equal(reread.payload.text, '# hello v2')

  const missingUpdate = await callRoute(handler, 'PUT', '/plugins/creative-suite/story/projects/p44-files/file', { path: 'notes/nope.md', text: 'x' })
  assert.equal(missingUpdate.status, 404)

  const deleted = await callRoute(handler, 'DELETE', '/plugins/creative-suite/story/projects/p44-files/file?path=' + encodeURIComponent('notes/hello.md'))
  assert.equal(deleted.status, 200)
  assert.equal(deleted.payload.removed, 'notes/hello.md')

  const listed2 = await callRoute(handler, 'GET', '/plugins/creative-suite/story/projects/p44-files/files')
  assert.ok(!listed2.payload.files.some(f => f.path === 'notes/hello.md'))

  const missingDelete = await callRoute(handler, 'DELETE', '/plugins/creative-suite/story/projects/p44-files/file?path=' + encodeURIComponent('notes/nope.md'))
  assert.equal(missingDelete.status, 404)

  // path traversal is rejected
  const evil = await callRoute(handler, 'GET', '/plugins/creative-suite/story/projects/p44-files/file?path=' + encodeURIComponent('../evil.md'))
  assert.equal(evil.status, 500)
  assert.equal(evil.payload.ok, false)
})
