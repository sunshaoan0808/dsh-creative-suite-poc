import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { apply, lineageGraphFor } from '../lib/index.js'
async function boot() {
  const dshHome = await mkdtemp(path.join(os.tmpdir(), 'p66-test-'))
  process.env.DSH_HOME = dshHome
  const registrations = []
  const ctx = {
    logger: { info() {}, warn() {} },
    provide() {},
    get() { return null },
    effect(fn) { return fn() },
    inject(deps, fn) {
      if (deps.includes('webServer')) {
        const routeCtx = { ...ctx, llm: { stream: async function* () {
          yield { type: 'text-delta', text: JSON.stringify({ name: '世界书', entries: [{ keys: ['a'], content: '设定内容', comment: '条目标题', enabled: true }], characters: [{ id: 'chr-1', name: '主角', description: '外貌与身份', personality: '性格', scenario: '与主角关系', first_mes: '你好', mes_example: '<START>\ntest', tags: [], speechStyle: '平静' }] }) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        } }, agentDefaultModel: { 
          currentSelection: () => ({ provider: 'deepseek-official', model: 'muse-spark-1.3-contributor-free' }),
          saveSelection: async () => {} 
        } }
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
test('P6-6: lineage graph builds from novel->worldbook->card', async () => {
  const { dshHome, handler } = await boot()
  const created = await callRoute(handler, 'POST', '/plugins/creative-suite/resources/novels', { id: 'novel-1', name: 'demo novel', data: { text: 'a b' } })
  console.log('CREATE', created.status, JSON.stringify(created.payload).slice(0,500))
  assert.equal(created.status, 200)
  // import worldbook derived from novel (persisted path, writes derivedFrom)
  const wb = await callRoute(handler, 'POST', '/plugins/creative-suite/import/worldbook', { id: 'wb-1', name: 'demo wb', entries: [{ keys: ['a'], content: 'lore', comment: 'c' }], lineage: { derivedFrom: [{ kind: 'novels', id: 'novel-1' }] } })
  assert.equal(wb.status, 200)
  const wbId = wb.payload.resource.id
  // build card from inline character with worldbook binding (persisted path)
  // chain semantics: card derives from worldbook only (worldbook derives from novel),
  // so graph shows novel->worldbook->card with card at depth 2
  const card = await callRoute(handler, 'POST', '/plugins/creative-suite/generate/card', {
    character: { name: 'Hero', description: 'd', personality: 'p', scenario: 's', first_mes: 'hi' },
    worldbookId: wbId
  })
  assert.equal(card.status, 200)
  const cardId = card.payload.resource.id
  // fetch graph
  const graph = await callRoute(handler, 'GET', '/plugins/creative-suite/lineage/novels/novel-1/graph')
  assert.equal(graph.status, 200)
  const { nodes, edges } = graph.payload
  const nodeMap = new Map(nodes.map(n => [n.kind + ':' + n.id, n]))
  assert.ok(nodeMap.has('novels:novel-1'), 'root novel present')
  assert.ok(nodeMap.has('worldbooks:' + wbId), 'worldbook node present')
  assert.ok(nodeMap.has('cards:' + cardId), 'card node present')
  const edgeStrs = edges.map(e => e.from.kind + ':' + e.from.id + '->' + e.to.kind + ':' + e.to.id)
  assert.ok(edgeStrs.some(s => s.startsWith('novels:novel-1->worldbooks:' + wbId)), 'novel->worldbook edge')
  assert.ok(edgeStrs.some(s => s.startsWith('worldbooks:' + wbId + '->cards:' + cardId)), 'worldbook->card edge')
  // also check depth
  const novelNode = nodeMap.get('novels:novel-1')
  assert.equal(novelNode.depth, 0)
  assert.equal(novelNode.direction, 'root')
  // depth -1 for ancestors (none here), +1 for descendants
  const wbNode = nodeMap.get('worldbooks:' + wbId)
  assert.equal(wbNode.depth, 1)
  assert.equal(wbNode.direction, 'descendant')
  const cardNode = nodeMap.get('cards:' + cardId)
  assert.equal(cardNode.depth, 2)
  assert.equal(cardNode.direction, 'descendant')
})
test('P6-6: maxDepth truncation works', async () => {
  const { dshHome, handler } = await boot()
  const nov = await callRoute(handler, 'POST', '/plugins/creative-suite/resources/novels', { id: 'novel-2', name: 'nov2', data: { text: 'x' } })
  const wb = await callRoute(handler, 'POST', '/plugins/creative-suite/import/worldbook', { id: 'wb-2', name: 'nov2 wb', entries: [{ keys: ['x'], content: 'lore', comment: 'c' }], lineage: { derivedFrom: [{ kind: 'novels', id: 'novel-2' }] } })
  assert.equal(wb.status, 200)
  const wbId = wb.payload.resource.id
  const card = await callRoute(handler, 'POST', '/plugins/creative-suite/generate/card', { character: { name: 'Hero2', description: 'd' }, worldbookId: wbId })
  const cardId = card.payload.resource.id
  const graph = await callRoute(handler, 'GET', '/plugins/creative-suite/lineage/novels/novel-2/graph?maxDepth=1')
  assert.equal(graph.status, 200)
  assert.equal(graph.payload.truncated, true) // should be truncated because depth 2 > maxDepth 1
  const nodeMap2 = new Map(graph.payload.nodes.map(n => [n.kind + ':' + n.id, n]))
  assert.ok(nodeMap2.has('novels:novel-2'), 'novel present')
  assert.ok(nodeMap2.has('worldbooks:' + wbId), 'wb present')
  // maxDepth=1 truncates card (depth 2), so card must be absent and truncated=true
  assert.ok(!nodeMap2.has('cards:' + cardId), 'card truncated at maxDepth=1')
  assert.equal(nodeMap2.get('novels:novel-2').depth, 0)
  assert.equal(nodeMap2.get('worldbooks:' + wbId).depth, 1)
})
