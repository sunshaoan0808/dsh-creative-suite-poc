// N6: chat/* 本地化路由测试（regen/rollback/undo-rollback/retry-mvu 经 helper runtime）
import { describe, it, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mod = await import('../lib/index.js')
const helper = await import('../lib/helper-runtime.js')

function mockRes() {
  return { status: 0, statusCode: 0, body: null, headers: {},
    writeHead(code, headers) { this.status = code; this.statusCode = code; Object.assign(this.headers, headers) },
    end(text) { try { this.body = JSON.parse(String(text)) } catch { this.body = String(text) } } }
}
async function callRoute(handler, method, url, body) {
  const { EventEmitter } = await import('node:events')
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.destroy = () => {}
  const res = mockRes()
  const done = new Promise((resolve) => { const origEnd = res.end.bind(res); res.end = (t) => { origEnd(t); resolve(res) } })
  void Promise.resolve(handler(req, res)).catch((error) => { res.status = 500; res.statusCode = 500; res.body = { ok: false, error: String(error && error.message || error) }; resolve(res) })
  if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
  req.emit('end')
  return done
}

describe('N6: chat routes native', () => {
  let ctx, routeHandler, dir
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'n6-'))
    process.env.DSH_HOME = dir
    let captured = null
    ctx = { logger: { info() {}, warn() {}, error() {} }, provide() {},
      get() { return null },
      inject(deps, fn) {
        if (deps.includes('webServer')) {
          const routeCtx = { webServer: { register(route) { captured = route.handler } },
            llm: { stream: async function* () { yield { type: 'text-delta', text: 'x' }; yield { type: 'finish', reason: { kind: 'ok' } } } },
            agentDefaultModel: { currentSelection: () => ({ provider: 't', model: 'm' }) },
            effect(fn2) { fn2() } }
          fn(routeCtx)
        } else { try { fn({ skills: { register: () => () => {} }, effect(f) { f() } }) } catch {} }
      },
      effect(fn) { fn() } }
    await mod.apply(ctx, {})
    routeHandler = captured
    assert.ok(routeHandler, 'route registered')
  })

  async function call(method, url, body) {
    return await callRoute(routeHandler, method, url, body)
  }

  it('regen 缺runtimeId 400，无runtime 404', async () => {
    const r1 = await call('POST', '/plugins/creative-suite/tavern/chat/regen', {})
    assert.equal(r1.body.ok, false)
    const r2 = await call('POST', '/plugins/creative-suite/tavern/chat/regen', { runtimeId: 'nope' })
    assert.equal(r2.status, 404)
  })

  it('regen/rollback/undo 全链路经runtime', async () => {
    const rt = helper.createHelperRuntime({ id: 'n6-r1', cardId: 'c1' })
    rt.createMessage({ role: 'user', content: 'hi' })
    rt.createMessage({ role: 'assistant', content: 'hello' })
    rt.createMessage({ role: 'assistant', content: 'hello2' })
    const regen = await call('POST', '/plugins/creative-suite/tavern/chat/regen', { runtimeId: 'n6-r1' })
    assert.equal(regen.body.ok, true)
    assert.equal(regen.body.native, true)
    assert.equal(regen.body.removed.content, 'hello2')
    const rb = await call('POST', '/plugins/creative-suite/tavern/chat/rollback', { runtimeId: 'n6-r1', index: 0 })
    assert.equal(rb.body.ok, true)
    assert.equal(rb.body.kept.length, 1)
    const undo = await call('POST', '/plugins/creative-suite/tavern/chat/undo-rollback', { runtimeId: 'n6-r1' })
    assert.equal(undo.body.ok, true)
    assert.equal(undo.body.messages.length, 2)
    rt.stop('done')
  })

  it('undo空栈409，rollback缺index 400', async () => {
    const rt = helper.createHelperRuntime({ id: 'n6-r2', cardId: 'c1' })
    const u = await call('POST', '/plugins/creative-suite/tavern/chat/undo-rollback', { runtimeId: 'n6-r2' })
    assert.equal(u.status, 409)
    const rb = await call('POST', '/plugins/creative-suite/tavern/chat/rollback', { runtimeId: 'n6-r2', index: 'xx' })
    assert.equal(rb.status, 400)
    rt.stop('done')
  })

  it('retry-mvu开新settlement', async () => {
    const rt = helper.createHelperRuntime({ id: 'n6-r3', cardId: 'c1' })
    const r = await call('POST', '/plugins/creative-suite/tavern/chat/retry-mvu', { runtimeId: 'n6-r3', turn: 5, label: 'retry' })
    assert.equal(r.body.ok, true)
    assert.equal(r.body.native, true)
    assert.equal(r.body.settlement.status, 'pending')
    assert.equal(r.body.settlement.turn, 5)
    rt.stop('done')
  })
})
