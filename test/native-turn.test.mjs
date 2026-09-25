// N0: native tavern runtime — capabilities 本地化 / worldbook keys 激活 / native turn 闭环。
// TDD: 先断言后实现。运行: node --test test/native-turn.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { apply, activateWorldbookEntries, buildMuseSystem } from '../lib/index.js'

function okStream(text = '你好') {
  return (_args) => (async function * () {
    yield { type: 'text-delta', text }
    yield { type: 'finish', reason: { kind: 'ok' } }
  })()
}

function errorStream(message = 'bad request upstream') {
  return (_args) => (async function * () {
    yield { type: 'finish', reason: { kind: 'error', failure: { message } } }
  })()
}

async function boot({ stream } = {}) {
  const dshHome = await mkdtemp(path.join(os.tmpdir(), 'n0-native-'))
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
            listModels: async () => [{ id: 'mock-model', name: 'mock-model' }],
            stream: stream || okStream()
          },
          agentDefaultModel: {
            currentSelection: () => ({ provider: 'test', model: 'test-model' }),
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

const NATIVE_HINT = 'native engine N0未覆盖'

// ---- N0-1: capabilities 本地化 ----
test('N0-1: capabilities 本地返回，不依赖 tavern.log', async () => {
  const { dshHome, handler } = await boot()
  // 新建 tmpdir 下不存在 logs/tavern.log；若仍走透传会抛“找不到正在运行的 DSH Tavern 服务”
  const { existsSync } = await import('node:fs')
  assert.equal(existsSync(path.join(dshHome, 'logs', 'tavern.log')), false)
  const res = await callRoute(handler, 'GET', '/plugins/creative-suite/tavern/gameplay/capabilities')
  assert.equal(res.status, 200)
  assert.equal(res.payload.ok, true)
  assert.equal(res.payload.version, 1)
  assert.equal(res.payload.transport, 'native-helper-runtime')
  assert.equal(res.payload.browserScriptRuntime, false)
  assert.equal(res.payload.native, true)
  assert.equal(res.payload.deprecated, false)
})

test('N0-1: 其它 gameplay 透传失败错误追加 native hint', async () => {
  const { handler } = await boot()
  const res = await callRoute(handler, 'GET', '/plugins/creative-suite/tavern/gameplay/cards')
  assert.equal(res.status, 500)
  assert.ok(String(res.payload.error).includes(NATIVE_HINT), `应追加 hint，实际: ${res.payload.error}`)
  assert.ok(String(res.payload.error).includes('/native/turn'), `应指引 native/turn，实际: ${res.payload.error}`)
})

// ---- N0-2: worldbook keys 激活 ----
function fixtureEntries() {
  return [
    { keys: ['龙'], content: 'disabled lore', comment: 'off', enabled: false },
    { keys: ['酒馆'], content: 'constant lore', comment: 'const-entry', enabled: true, constant: true },
    { keys: ['巨龙', 'dragon'], content: 'dragon lore', comment: 'dragon-entry', enabled: true },
    { keys: ['精灵'], content: 'elf lore', comment: 'elf-entry', enabled: true },
    { keys: [], content: 'keyless lore', comment: 'keyless-entry', enabled: true }
  ]
}

test('N0-2: activateWorldbookEntries 剔除禁用 / 常开 constant / keys 命中（大小写不敏感）', () => {
  const active = activateWorldbookEntries(fixtureEntries(), '昨晚在酒馆遇到了一头巨龙 DRAGON')
  assert.deepEqual(active.map((e) => e.content), ['constant lore', 'dragon lore'])
})

test('N0-2: buildMuseSystem tavern 模式只注入激活条目', () => {
  const context = {
    card: {
      name: '艾莉',
      description: '酒馆老板娘',
      personality: '热情',
      scenario: '灯火酒馆',
      first_mes: '欢迎来到灯火酒馆！'
    },
    companions: [],
    worldbook: { id: 'wb-1', name: 'test-wb', entries: fixtureEntries() }
  }
  const system = buildMuseSystem(context, 'tavern', { recentText: '巨龙出现了' })
  assert.ok(system.includes('constant lore'), '应注入 constant 条目')
  assert.ok(system.includes('dragon lore'), '应注入命中条目')
  assert.ok(!system.includes('elf lore'), '不应注入未命中条目')
  assert.ok(!system.includes('disabled lore'), '不应注入禁用条目')
  assert.ok(!system.includes('keyless lore'), '无 keys 非 constant 条目不应注入')
  assert.ok(system.includes('艾莉'), '应包含角色名')
  assert.ok(system.includes('欢迎来到灯火酒馆'), '应参考 first_mes')
})

// ---- N0-3: native turn 最小闭环 ----
async function seedCardWorldbook(handler) {
  const wb = await callRoute(handler, 'POST', '/plugins/creative-suite/resources/worldbooks', {
    id: 'n0-wb', name: 'n0 wb', data: { raw: { entries: [{ keys: ['巨龙'], content: 'dragon lore', comment: 'd' }] } }
  })
  assert.equal(wb.status, 200)
  const card = await callRoute(handler, 'POST', '/plugins/creative-suite/resources/cards', {
    id: 'n0-card',
    name: '艾莉',
    data: {
      raw: { name: '艾莉', description: '酒馆老板娘', personality: '热情', scenario: '灯火酒馆', first_mes: '欢迎来到灯火酒馆！' },
      worldbookIds: ['n0-wb']
    }
  })
  assert.equal(card.status, 200)
}

test('N0-3: 正常 turn 返回 text/model/native', async () => {
  const { handler } = await boot()
  await seedCardWorldbook(handler)
  const res = await callRoute(handler, 'POST', '/plugins/creative-suite/tavern/native/turn', {
    cardId: 'n0-card',
    input: '你好，老板娘',
    history: [{ role: 'user', content: '听说这里有巨龙的消息' }]
  })
  assert.equal(res.status, 200)
  assert.equal(res.payload.ok, true)
  assert.equal(res.payload.text, '你好')
  assert.equal(res.payload.native, true)
  assert.deepEqual(res.payload.model, { provider: 'test', model: 'test-model' })
})

test('N0-3: 空 input 400 / 缺 cardId 400 / 无效 cardId 404', async () => {
  const { handler } = await boot()
  await seedCardWorldbook(handler)
  const empty = await callRoute(handler, 'POST', '/plugins/creative-suite/tavern/native/turn', { cardId: 'n0-card', input: '   ' })
  assert.equal(empty.status, 400)
  const noCard = await callRoute(handler, 'POST', '/plugins/creative-suite/tavern/native/turn', { input: 'hi' })
  assert.equal(noCard.status, 400)
  const missing = await callRoute(handler, 'POST', '/plugins/creative-suite/tavern/native/turn', { cardId: 'no-such-card', input: 'hi' })
  assert.equal(missing.status, 404)
})

test('N0-3: llm 异常透传 500 + 错误信息', async () => {
  const { handler } = await boot({ stream: errorStream() })
  await seedCardWorldbook(handler)
  const res = await callRoute(handler, 'POST', '/plugins/creative-suite/tavern/native/turn', { cardId: 'n0-card', input: 'hi' })
  assert.equal(res.status, 500)
  assert.ok(String(res.payload.error).includes('bad request upstream'), `应透传 llm 错误，实际: ${res.payload.error}`)
})
