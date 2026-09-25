import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { apply } from '../lib/index.js'

async function boot() {
  const dshHome = await mkdtemp(path.join(os.tmpdir(), 'p25-test-'))
  process.env.DSH_HOME = dshHome
  const registrations = []
  const ctx = {
    logger: { info() {}, warn() {} },
    provide() {},
    get() { return null },
    effect(fn) { return fn() },
    inject(deps, fn) {
      if (deps.includes('webServer')) {
        const routeCtx = { ...ctx, llm: { stream: (_args) => (async function* () {
          yield { type: 'text-delta', text: JSON.stringify({ name: 'Test Worldbook', entries: [{ keys: ['test'], content: 'test content', comment: 'test comment', enabled: true }] }) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })() }, agentDefaultModel: { currentSelection: () => ({ provider: 'mock', model: 'mock-json' }), saveSelection: async () => {} } }
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

test('P2-5: 剧本→MuseAI 冒险 end-to-end flow', async () => {
  const { dshHome, handler } = await boot()
  const projectId = 'p25-demo'
  const scriptPath = 'test-drama.txt'
  const dramaText = `场景：客厅
角色：小明，小红
对白：
小明：今天天气真好啊！
小红：是啊，我们去公园玩吧？`

  try {
    // 1. Create a story project
    const projectRes = await callRoute(handler, 'POST', '/plugins/creative-suite/story/projects', { id: projectId, name: 'Test Project for Drama to Adventure', instruction: '' })
    assert.equal(projectRes.status, 200, 'Failed to create story project')
    assert.equal(projectRes.payload.project.id, projectId)
    console.log(`Created project ${projectId}`)

    // 2. Write a script file (drama) into the project
    const writeRes = await callRoute(handler, 'POST', '/plugins/creative-suite/story/tools/write_file/run', { projectId, path: scriptPath, text: dramaText })
    assert.equal(writeRes.status, 200, 'Failed to write script file')
    console.log(`Wrote script ${scriptPath}`)

    // 3. Call the drama/to-adventure endpoint
    const adventureRes = await callRoute(handler, 'POST', '/plugins/creative-suite/drama/to-adventure', { projectId, path: scriptPath, text: dramaText })
    console.log('Adventure response:', JSON.stringify(adventureRes.payload, null, 2))

    // 4. Verify response structure
    assert.equal(adventureRes.status, 200, 'Response should be ok')
    assert.ok(adventureRes.payload.ok, 'Response ok should be true')
    assert.equal(adventureRes.payload.projectId, projectId, 'Project ID should match')
    assert.equal(adventureRes.payload.path, scriptPath, 'Path should match')

    // Verify worldbook
    assert.ok(adventureRes.payload.worldbook, 'Worldbook should be present')
    assert.ok(adventureRes.payload.worldbook.id, 'Worldbook should have an id')
    assert.ok(adventureRes.payload.worldbook.name, 'Worldbook should have a name')
    assert.ok(adventureRes.payload.worldbook.entryCount !== undefined, 'Worldbook should have entryCount')

    // Verify preset
    assert.ok(adventureRes.payload.preset, 'Preset should be present')
    assert.ok(adventureRes.payload.preset.id, 'Preset should have an id')
    assert.ok(adventureRes.payload.preset.name, 'Preset should have a name')
    assert.ok(adventureRes.payload.preset.promptCount !== undefined, 'Preset should have promptCount')

    // Verify session
    assert.ok(adventureRes.payload.session, 'Session should be present')
    assert.ok(adventureRes.payload.session.id, 'Session should have an id')
    assert.ok(adventureRes.payload.session.name, 'Session should have a name')
    assert.equal(adventureRes.payload.session.mode, 'adventure', 'Session mode should be adventure')
    assert.ok(adventureRes.payload.session.worldbookId, 'Session should have worldbookId')
    assert.equal(adventureRes.payload.session.storyProjectId, projectId, 'Session should link to the project')

    // 5. Check that the UI success message would be shown: we already verified ok: true and presence of IDs.
    // The UI shows success message when adventureResult is not empty and no error.
    // We can also check that there is no error field.
    assert.ok(!adventureRes.payload.error, 'Response should not contain an error field')
  } finally {
    // Cleanup is handled by the test framework removing the temp directory
  }
})