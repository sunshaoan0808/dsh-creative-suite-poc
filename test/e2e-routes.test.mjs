// P7-6: route-level e2e 替代测试 (browser-e2e 被 DSH host 缺失阻塞,见 /tmp/p7e2e_deps.txt)。
// 覆盖端到端闭环: status -> story project -> import/worldbook -> lineage graph
//   -> migrate/all -> museai-settings GET/POST -> novel-to-card pipeline。
// 运行: node --test test/e2e-routes.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { apply } from '../lib/index.js'

async function boot() {
  const dshHome = await mkdtemp(path.join(os.tmpdir(), 'p76-e2e-'))
  process.env.DSH_HOME = dshHome
  const registrations = []
  const ctx = {
    logger: { info() {}, warn() {} },
    provide() {},
    get() { return null },
    effect(fn) { return fn() },
    inject(deps, fn) {
      if (deps.includes('webServer')) {
        const routeCtx = {
          ...ctx,
          llm: {
            listProviders: () => [{ id: 'mock', name: 'mock' }],
            listModels: async () => [{ id: 'mock-json', name: 'mock-json' }],
            stream: (_args) => (async function * () {
              yield { type: 'text-delta', text: JSON.stringify({ name: 'E2E Worldbook', entries: [{ keys: ['e2e'], content: 'e2e lore', comment: 'e2e entry', enabled: true }] }) }
              yield { type: 'finish', reason: { kind: 'stop' } }
            })()
          },
          agentDefaultModel: {
            currentSelection: () => ({ provider: 'mock', model: 'mock-json' }),
            saveSelection: async () => {}
          }
        }
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

test('P7-6: route-level e2e — status/migrate/graph/museai-settings 全闭环', async () => {
  const { handler } = await boot()
  const projectId = 'p76-e2e'

  // 1. status: 插件存活 + store 可读
  const status = await callRoute(handler, 'GET', '/plugins/creative-suite/status')
  assert.equal(status.status, 200)
  assert.equal(status.payload.ok, true)
  assert.equal(status.payload.version, '0.17.0')
  assert.ok(Array.isArray(status.payload.modes))

  // 2. 创建 story 项目 (端到端起点)
  const project = await callRoute(handler, 'POST', '/plugins/creative-suite/story/projects', { id: projectId, name: 'P7-6 e2e', instruction: '' })
  assert.equal(project.status, 200)
  assert.equal(project.payload.project.id, projectId)

  // 3. 写剧本文件 -> import worldbook (带 lineage, 供 graph 验证)
  const dramaText = '场景:客厅\n角色:小明,小红\n对白:\n小明:今天天气真好啊!\n小红:是啊,我们去公园玩吧?'
  const write = await callRoute(handler, 'POST', '/plugins/creative-suite/story/tools/write_file/run', { projectId, path: 'drama.txt', text: dramaText })
  assert.equal(write.status, 200)
  const wb = await callRoute(handler, 'POST', '/plugins/creative-suite/import/worldbook', {
    id: 'p76-wb', name: 'p76 wb',
    entries: [{ keys: ['e2e'], content: 'e2e lore', comment: 'e2e entry' }]
  })
  assert.equal(wb.status, 200)
  const wbId = wb.payload.resource.id
  assert.ok(wbId)

  // 4. graph: worldbook 节点可达 (lineage graph 闭环)
  const graph = await callRoute(handler, 'GET', `/plugins/creative-suite/lineage/worldbooks/${encodeURIComponent(wbId)}/graph`)
  assert.equal(graph.status, 200)
  assert.equal(graph.payload.ok, true)
  assert.ok(Array.isArray(graph.payload.nodes))
  const keys = graph.payload.nodes.map((n) => `${n.kind}:${n.id}`)
  assert.ok(keys.includes(`worldbooks:${wbId}`), `graph 应包含 worldbook 节点, 实际: ${keys.join(',')}`)

  // 5. migrate/all: 空 tavern 目录下也应 ok (imported=0, 无抛错)
  const migrate = await callRoute(handler, 'POST', '/plugins/creative-suite/migrate/all', {})
  assert.equal(migrate.status, 200)
  assert.equal(migrate.payload.ok, true)
  assert.ok(migrate.payload.cards && migrate.payload.worldbooks && migrate.payload.presets)

  // 6. museai-settings: GET 默认 -> POST 保存 -> GET 回读 (设置闭环)
  const settingsGet = await callRoute(handler, 'GET', '/plugins/creative-suite/museai/settings')
  assert.equal(settingsGet.status, 200)
  assert.equal(settingsGet.payload.ok, true)
  assert.ok(settingsGet.payload.museaiSettings)
  const settingsPost = await callRoute(handler, 'POST', '/plugins/creative-suite/museai/settings', {
    prompt: 'p76 e2e prompt', sampling: { temperature: 0.5, top_p: 0.8 }
  })
  assert.equal(settingsPost.status, 200)
  assert.equal(settingsPost.payload.ok, true)
  assert.equal(settingsPost.payload.settings.prompt, 'p76 e2e prompt')
  assert.equal(settingsPost.payload.settings.sampling.temperature, 0.5)
  const settingsReGet = await callRoute(handler, 'GET', '/plugins/creative-suite/museai/settings')
  assert.equal(settingsReGet.status, 200)
  assert.equal(settingsReGet.payload.museaiSettings.prompt, 'p76 e2e prompt')

  // 7. models/catalog 附带验证 (museai-settings 依赖 modelCatalog)
  const models = await callRoute(handler, 'GET', '/plugins/creative-suite/models')
  assert.equal(models.status, 200)
  assert.equal(models.payload.ok, true)
  assert.ok(Array.isArray(models.payload.groups))
})
