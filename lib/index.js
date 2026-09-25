import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { gunzipSync, inflateSync } from 'node:zlib'
import { createHelperRuntime, deleteHelperRuntime, getHelperRuntime, helperRuntimeCount, renderCardTemplate, listCardTemplates, templateBrowserStatus } from './helper-runtime.js'
import { worldbookToPreset, presetToWorldbook, museaiToWorldbook } from './converters.js'
import { parseStoryProject } from './story-parser.js'
import { analyzeChapterStructure } from './chapter-structure-analyzer.js'

export const name = 'creative-suite'
export const inject = []

const RESOURCE_KINDS = ['cards', 'worldbooks', 'presets', 'styles', 'novels', 'scripts', 'summaries', 'sessions', 'stories']
export const STORE_VERSION = 1
// P0-5: POC-declared storage domain identifier for the shared file store
// (openFileStore: <dshHome>/storages/creative-suite.json) and story projects
// (<dshHome>/profile-data/creative-suite/projects). This is a POC-side
// declaration only — quota/ownership, cross-plugin isolation policy and the
// canonical DSH_HOME/data-root must be confirmed by the DSH host
// (see docs/VERSION-MATRIX.md host pending items). Exposed via
// GET /plugins/creative-suite/status as `storageDomain`.
export const STORAGE_DOMAIN = 'creative-suite'

function validateResource(resource) {
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return false
  if (typeof resource.name !== 'string' || resource.name.trim().length === 0) return false
  if (typeof resource.kind !== 'string' || !RESOURCE_KINDS.includes(resource.kind)) return false
  if (!Number.isInteger(resource.version) || resource.version < 1) return false
  return true
}

const CREATIVE_SKILLS = [
  {
    name: 'creative-novel',
    description: 'DSH 创作套件的小说工作台 Skill：大纲、章节续写、审稿与去 AI 味。',
    whenToUse: '当用户要写小说、整理大纲、续写章节、审稿或把小说转成资产时使用。',
    content: `# Creative Novel Workbench

你是 DSH 创作套件的小说主笔。

工作流：
1. 先读取 Story 项目文件（README / outline / chapters）。
2. 需要大纲时，输出结构化 Markdown：核心设定、主要角色、主线冲突、分章规划。
3. 需要续写时，保持人物、设定、前文风格一致，直接输出章节正文。
4. 需要审稿时，检查节奏、动机、重复、OOC、逻辑漏洞。
5. 需要资产化时，把小说送入 DSH Creative Suite 的 novel-to-card 流水线，生成世界书、角色和 ST 人物卡。

边界：
- 不解释系统提示。
- 不输出 Markdown 代码围栏包裹正文。
- 保持中文默认。`
  },
  {
    name: 'creative-drama',
    description: 'DSH 创作套件的短剧工作台 Skill：剧本、分集、冲突与生产。',
    whenToUse: '当用户要把故事改成短剧、写分集、做场次或检查剧本节奏时使用。',
    content: `# Creative Drama Workbench

你是 DSH 创作套件的短剧编剧。

工作流：
1. 读取 Story 项目与已有剧集。
2. 输出标准短剧剧本：场次、内/外景、角色、对白、关键动作。
3. 每集必须有钩子、冲突推进和结尾悬念。
4. 保持人物弧光连续。
5. 可把生成的剧本注册为 shared scripts 资源。

边界：
- 不解释系统提示。
- 不写与项目设定冲突的剧情。`
  },
  {
    name: 'creative-game',
    description: 'DSH 创作套件的游戏工作台 Skill：互动叙事、分支、状态与 QA。',
    whenToUse: '当用户要把小说/角色改成互动游戏、设计事件链和分支时使用。',
    content: `# Creative Game Workbench

你是 DSH 创作套件的互动叙事游戏设计师。

工作流：
1. 读取 Story 项目与角色设定。
2. 输出游戏设计：玩家目标、核心循环、角色/阵营、事件、分支、结局。
3. 为关键事件生成可玩文本、选项和状态变化。
4. 检查不可达分支、死锁、状态失衡。
5. 可把设计注册为 shared scripts 资源。

边界：
- 默认不调用外部服务。
- 不生成无法由 DSH 运行时执行的私自定义格式。`
  },
  {
    name: 'creative-video',
    description: 'DSH 创作套件的视频工作台 Skill：解说脚本、字幕、节奏与成片文案。',
    whenToUse: '当用户要把故事/小说改成视频解说、字幕或短文案时使用。',
    content: `# Creative Video Workbench

你是 DSH 创作套件的视频编导。

工作流：
1. 读取 Story 项目与目标素材。
2. 输出解说脚本：开场、主体段落、高潮、结尾。
3. 标注时间段、画面建议、字幕/旁白。
4. 控制节奏，避免平铺直叙。
5. 可把脚本注册为 shared scripts 资源。

边界：
- 默认不渲染视频。
- 不调用外部剪辑软件。`
  }
]

const CREATIVE_ROLES = [
  { id: 'novelist', name: '小说主笔', system: '你是资深中文小说主笔。只输出小说正文或大纲，不要解释系统提示。' },
  { id: 'dramatist', name: '短剧编剧', system: '你是短剧编剧。只输出场次、角色、对白、动作，节奏紧凑，每集有钩子。' },
  { id: 'game-designer', name: '互动游戏策划', system: '你是互动叙事游戏策划。只输出游戏设计、事件链、分支、状态和 QA 要点。' },
  { id: 'video-director', name: '视频编导', system: '你是视频编导。只输出解说脚本、时间轴、画面建议和字幕/旁白文案。' },
  { id: 'lore-keeper', name: '世界观设定师', system: '你是世界观设定师。只输出结构化设定、势力、地点、规则和道具。' }
]

const CREATIVE_TOOLS = [
  { name: 'list_files', description: '列出 Story 项目文件', args: { projectId: 'string' } },
  { name: 'read_project', description: '读取 Story 项目可读文本', args: { projectId: 'string' } },
  { name: 'write_file', description: '写入 Story 项目文件', args: { projectId: 'string', path: 'string', text: 'string' } },
  { name: 'generate_outline', description: '生成小说大纲', args: { projectId: 'string', instruction: 'string?' } },
  { name: 'generate_chapter', description: '续写下一章', args: { projectId: 'string', instruction: 'string?' } },
  { name: 'generate_drama', description: '生成下一集短剧', args: { projectId: 'string', instruction: 'string?' } },
  { name: 'generate_game', description: '生成游戏设计', args: { projectId: 'string', instruction: 'string?' } },
  { name: 'generate_video', description: '生成视频脚本', args: { projectId: 'string', instruction: 'string?' } }
]

function sendJson(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(value))
}

function routePath(req) {
  return decodeURIComponent(new URL(req.url || '/', 'http://x').pathname)
}

function readJsonBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    req.on('data', chunk => {
      bytes += chunk.length
      if (bytes > limit) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.trim() === '') return resolve({})
      try { resolve(JSON.parse(raw)) } catch (error) { reject(new Error('bad json')) }
    })
    req.on('error', reject)
  })
}

function emptyStore() {
  return {
    version: STORE_VERSION,
    resources: Object.fromEntries(RESOURCE_KINDS.map(kind => [kind, {}])),
    resourceHistories: Object.fromEntries(RESOURCE_KINDS.map(kind => [kind, {}])),
    updatedAt: 0
  }
}

function normalizeStore(value) {
  const store = emptyStore()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return store
  if (value.version !== STORE_VERSION) return store
  if (!value.resources || typeof value.resources !== 'object') return store
  for (const kind of RESOURCE_KINDS) {
    const table = value.resources[kind]
    if (table && typeof table === 'object' && !Array.isArray(table)) store.resources[kind] = table
  }
  if (value.resourceHistories && typeof value.resourceHistories === 'object') {
    for (const kind of RESOURCE_KINDS) {
      const htable = value.resourceHistories[kind]
      if (htable && typeof htable === 'object' && !Array.isArray(htable)) store.resourceHistories[kind] = htable
    }
  }
  store.updatedAt = Number(value.updatedAt) || 0
  return store
}

function cloneResourceValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value))
}

function historyTable(store, kind) {
  if (!store.data.resourceHistories || typeof store.data.resourceHistories !== 'object') store.data.resourceHistories = {}
  if (!store.data.resourceHistories[kind] || typeof store.data.resourceHistories[kind] !== 'object') store.data.resourceHistories[kind] = {}
  return store.data.resourceHistories[kind]
}

function historyListFor(store, kind, id) {
  const table = historyTable(store, kind)
  if (!Array.isArray(table[id])) table[id] = []
  return table[id]
}

function snapshotResource(record) {
  return {
    version: Number(record.version) || 1,
    name: record.name,
    data: cloneResourceValue(record.data),
    updatedAt: record.updatedAt,
    savedAt: Date.now()
  }
}

function resourceValueAtVersion(store, kind, id, version) {
  const record = store.data.resources[kind] && store.data.resources[kind][id]
  if (!record) return null
  const target = Number(version)
  if (!Number.isFinite(target)) return null
  if (Number(record.version) === target) {
    return { version: Number(record.version), name: record.name, data: cloneResourceValue(record.data), updatedAt: record.updatedAt, current: true }
  }
  const list = historyListFor(store, kind, id)
  const found = list.find(item => Number(item.version) === target)
  return found ? Object.assign({}, found, { current: false }) : null
}

function diffResourceValues(fromValue, toValue, basePath = '') {
  const diffs = []
  const fromIsObj = fromValue && typeof fromValue === 'object'
  const toIsObj = toValue && typeof toValue === 'object'
  if (Array.isArray(fromValue) || Array.isArray(toValue)) {
    if (JSON.stringify(fromValue) !== JSON.stringify(toValue)) {
      diffs.push({ path: basePath || '/', op: 'changed', from: cloneResourceValue(fromValue), to: cloneResourceValue(toValue) })
    }
    return diffs
  }
  if (fromIsObj && toIsObj && !Array.isArray(fromValue) && !Array.isArray(toValue)) {
    const keys = [...new Set([...Object.keys(fromValue), ...Object.keys(toValue)])].sort()
    for (const key of keys) {
      const childPath = basePath ? basePath + '.' + key : key
      const hasFrom = Object.prototype.hasOwnProperty.call(fromValue, key)
      const hasTo = Object.prototype.hasOwnProperty.call(toValue, key)
      if (!hasFrom && hasTo) {
        diffs.push({ path: childPath, op: 'added', from: undefined, to: cloneResourceValue(toValue[key]) })
      } else if (hasFrom && !hasTo) {
        diffs.push({ path: childPath, op: 'removed', from: cloneResourceValue(fromValue[key]), to: undefined })
      } else {
        diffs.push(...diffResourceValues(fromValue[key], toValue[key], childPath))
      }
    }
    return diffs
  }
  if (JSON.stringify(fromValue) !== JSON.stringify(toValue)) {
    diffs.push({ path: basePath || '/', op: 'changed', from: cloneResourceValue(fromValue), to: cloneResourceValue(toValue) })
  }
  return diffs
}

async function openFileStore(dshHome) {
  const root = path.join(dshHome, 'storages')
  const file = path.join(root, 'creative-suite.json')
  await mkdir(root, { recursive: true })
  let data = emptyStore()
  try {
    data = normalizeStore(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    if (error && error.code !== 'ENOENT') console.warn('creative-suite: store read failed:', error.message)
  }
  async function save() {
    data.updatedAt = Date.now()
    const temp = file + '.tmp-' + randomUUID()
    await writeFile(temp, JSON.stringify(data, null, 2), 'utf8')
    await rename(temp, file)
  }
  return { file, data, save }
}

function resourceSummary(store) {
  return Object.fromEntries(RESOURCE_KINDS.map(kind => {
    const table = store.data.resources[kind] || {}
    return [kind, { count: Object.keys(table).length }]
  }))
}

function readBufferBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    req.on('data', chunk => {
      bytes += chunk.length
      if (bytes > limit) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function readPngTextChunks(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(signature)) throw new Error('不是有效的 PNG 文件')
  const texts = {}
  let offset = 8
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length
    if (type === 'tEXt') {
      const zero = data.indexOf(0)
      if (zero > 0) texts[data.toString('latin1', 0, zero)] = data.toString('utf8', zero + 1)
    } else if (type === 'zTXt') {
      const zero = data.indexOf(0)
      if (zero > 0) {
        try { texts[data.toString('latin1', 0, zero)] = inflateSync(data.subarray(zero + 2)).toString('utf8') } catch (_error) {}
      }
    } else if (type === 'iTXt') {
      const zero = data.indexOf(0)
      if (zero > 0) {
        const keyword = data.toString('latin1', 0, zero)
        const compressionFlag = data[zero + 1]
        const compressionMethod = data[zero + 2]
        const langEnd = data.indexOf(0, zero + 3)
        if (langEnd > 0) {
          const translatedEnd = data.indexOf(0, langEnd + 1)
          if (translatedEnd > 0) {
            const textBytes = data.subarray(translatedEnd + 1)
            try {
              const text = compressionFlag === 1 && compressionMethod === 0 ? inflateSync(textBytes) : textBytes
              texts[keyword] = text.toString('utf8')
            } catch (_error) {}
          }
        }
      }
    } else if (type === 'IEND') {
      break
    }
  }
  return texts
}

function parsePngCard(buffer) {
  const texts = readPngTextChunks(buffer)
  for (const key of ['ccv3', 'chara']) {
    const encoded = texts[key]
    if (!encoded) continue
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8')
      const card = JSON.parse(decoded)
      if (card && typeof card === 'object') return card
    } catch (_error) {}
  }
  throw new Error('PNG 中没有可识别的 chara / ccv3 人物卡数据')
}

function unwrapStCard(value, fallbackName) {
  let root = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  if (root.kind === 'dsh-tavern-character-workspace' && root.raw && typeof root.raw === 'object') root = root.raw.data || root.raw
  if (root.card && typeof root.card === 'object') root = root.card
  if (root.data && typeof root.data === 'object' && (root.spec || root.spec_version)) root = root.data
  const card = root && typeof root === 'object' && !Array.isArray(root) ? root : {}
  const name = String(card.name || fallbackName || '未命名人物卡').trim() || '未命名人物卡'
  return {
    name,
    description: String(card.description || ''),
    personality: String(card.personality || ''),
    scenario: String(card.scenario || ''),
    first_mes: String(card.first_mes || card.first_message || ''),
    mes_example: String(card.mes_example || card.example_dialogue || ''),
    creator_notes: String(card.creator_notes || ''),
    system_prompt: String(card.system_prompt || ''),
    post_history_instructions: String(card.post_history_instructions || ''),
    tags: Array.isArray(card.tags) ? card.tags.map(String) : [],
    alternate_greetings: Array.isArray(card.alternate_greetings) ? card.alternate_greetings.map(String) : [],
    character_book: card.character_book && typeof card.character_book === 'object' ? card.character_book : null,
    extensions: card.extensions && typeof card.extensions === 'object' ? card.extensions : {}
  }
}

function countNestedHelperScripts(value) {
  let count = 0
  const visit = (node, depth = 0) => {
    if (!node || depth > 8) return
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return }
    if (typeof node !== 'object') return
    if (String(node.type || '') === 'script') count += 1
    if (Array.isArray(node.scripts)) for (const item of node.scripts) visit(item, depth + 1)
    if (Array.isArray(node.children)) for (const item of node.children) visit(item, depth + 1)
  }
  visit(value)
  return count
}

function inspectCardRuntime(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const data = value.data && typeof value.data === 'object' ? value.data : value
  const extensions = data.extensions && typeof data.extensions === 'object' && !Array.isArray(data.extensions) ? data.extensions : {}
  const tavernHelper = extensions.tavern_helper && typeof extensions.tavern_helper === 'object' ? extensions.tavern_helper : {}
  const nativeRegex = Array.isArray(extensions.regex_scripts) ? extensions.regex_scripts : []
  const bindingRegex = extensions.SPreset && extensions.SPreset.RegexBinding && Array.isArray(extensions.SPreset.RegexBinding.regexes) ? extensions.SPreset.RegexBinding.regexes : []
  const regexScripts = nativeRegex.length > 0 ? nativeRegex : bindingRegex
  const helperScripts = countNestedHelperScripts(tavernHelper.scripts || tavernHelper)
  const mvuKeys = Object.keys(extensions).filter(key => /mvu/i.test(key))
  return {
    name: String(data.name || ''),
    helperScripts,
    hasHelper: helperScripts > 0,
    regexScripts: regexScripts.length,
    regexEnabled: regexScripts.filter(script => script && script.disabled !== true).length,
    mvuKeys,
    hasMvu: mvuKeys.length > 0 || Boolean(tavernHelper.mvu),
    extensionKeys: Object.keys(extensions)
  }
}

function normalizeCardUpdateFields(input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const source = body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields) ? body.fields : body
  const fields = {}
  for (const key of ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions']) {
    if (source[key] !== undefined) fields[key] = String(source[key] == null ? '' : source[key])
  }
  if (source.tags !== undefined) {
    fields.tags = Array.isArray(source.tags)
      ? source.tags.map(String).map(value => value.trim()).filter(Boolean)
      : String(source.tags).split(/[,，\n]/).map(value => value.trim()).filter(Boolean)
  }
  if (source.alternate_greetings !== undefined) {
    fields.alternate_greetings = Array.isArray(source.alternate_greetings)
      ? source.alternate_greetings.map(String).map(value => value.trim()).filter(Boolean)
      : String(source.alternate_greetings).split(/\n---\n/).map(value => value.trim()).filter(Boolean)
  }
  return fields
}

function applyCardFieldsToRaw(raw, fields) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  if (value.kind === 'dsh-tavern-character-workspace' && value.raw && typeof value.raw === 'object') {
    if (value.raw.data && typeof value.raw.data === 'object') value.raw.data = Object.assign({}, value.raw.data, fields)
    else value.raw = Object.assign({}, value.raw, fields)
    return value
  }
  if (value.data && typeof value.data === 'object' && !Array.isArray(value.data) && (value.spec || value.spec_version || value.data.name !== undefined)) {
    value.data = Object.assign({}, value.data, fields)
    return value
  }
  return Object.assign(value, fields)
}

function stripJsonFence(text) {
  const value = String(text || '').trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(value)
  return fenced ? fenced[1].trim() : value
}

export const ALTERNATE_GREETING_COUNT = 3

export function generateAlternateGreetings(character, options = {}) {
  const source = character && typeof character === 'object' && !Array.isArray(character) ? character : {}
  const opts = options && typeof options === 'object' ? options : {}
  const name = String(source.name || opts.name || '').trim()
  const personality = String(source.personality || '').trim()
  const scenario = String(source.scenario || '').trim()
  const firstMes = String(source.first_mes || '').trim()
  const speechStyle = String(source.speechStyle || '').trim()
  const count = Math.max(1, Math.min(6, Number(options.count) || ALTERNATE_GREETING_COUNT))
  const styleHint = speechStyle ? `，说话风格：${speechStyle.slice(0, 120)}` : ''
  const personaHint = personality ? `（${name || '角色'}${personality.slice(0, 80)}）` : ''
  const sceneHint = scenario ? scenario.slice(0, 80) : ''
  const templates = [
    () => `*${sceneHint ? sceneHint + '，' : ''}${name || '我'}缓步走近，目光落在你身上*${personaHint ? '\n' + personaHint.replace(/^（|）$/g, '') : ''}\n“你来了${styleHint ? '。' + speechStyle.slice(0, 40) : '。'}”`,
    () => `${firstMes ? `延续初见的气氛——${firstMes.slice(0, 60)}……\n` : ''}*换一个时间、换一种心情，${name || '角色'}再次开口*${styleHint}\n“如果是现在的你，会怎么回答我？”`,
    () => `*${name || '角色'}${personaHint}，在${sceneHint || '熟悉的场景'}里等你*\n“说吧，这一次，你想从哪里开始？”`
  ]
  const out = []
  for (let index = 0; index < count; index += 1) {
    const make = templates[index % templates.length]
    let greeting = String(make()).trim()
    if (greeting.length > 1200) greeting = greeting.slice(0, 1200)
    if (!out.includes(greeting)) out.push(greeting)
  }
  let suffix = 2
  while (out.length < count) {
    out.push(`${out[out.length % Math.max(1, out.length)]}（变体 ${suffix}）`)
    suffix += 1
  }
  return out
}

export function ensureAlternateGreetings(cardData, character, options = {}) {
  const data = cardData && typeof cardData === 'object' && !Array.isArray(cardData) ? cardData : {}
  const existing = Array.isArray(data.alternate_greetings)
    ? data.alternate_greetings.map(String).map(value => value.trim()).filter(Boolean)
    : []
  if (existing.length > 0 && options.overwrite !== true) return { greetings: existing, generated: false }
  const greetings = generateAlternateGreetings(character || data, options)
  data.alternate_greetings = greetings
  return { greetings, generated: true }
}

export async function generateAlternateGreetingsWithLlm(routeCtx, character, options = {}) {
  const source = character && typeof character === 'object' && !Array.isArray(character) ? character : {}
  const opts = options && typeof options === 'object' ? options : {}
  const count = Math.max(1, Math.min(6, Number(opts.count) || ALTERNATE_GREETING_COUNT))
  const name = String(source.name || opts.name || '未命名角色')
  const brief = [
    `角色名：${name}`,
    source.description ? `设定：${String(source.description).slice(0, 800)}` : '',
    source.personality ? `性格：${String(source.personality).slice(0, 600)}` : '',
    source.scenario ? `场景：${String(source.scenario).slice(0, 600)}` : '',
    source.first_mes ? `主开场白：${String(source.first_mes).slice(0, 600)}` : '',
    source.speechStyle ? `说话风格：${String(source.speechStyle).slice(0, 200)}` : ''
  ].filter(Boolean).join('\n')
  const result = await generateJson(routeCtx, {
    maxTokens: 2000,
    system: '你是角色扮演开场白作者。只输出严格 JSON，不要解释，不要 Markdown 代码围栏。',
    prompt: `为下面的角色生成 ${count} 条风格各异、但都符合人设的备选开场白（alternate greetings）。\n每条 60-300 字，包含动作/神态描写与一句台词，保持第一人称或第三人称叙述+引号台词的 ST 开场白风格，不要重复主开场白。\n输出格式：{"greetings":["开场白1","开场白2",...]}\n\n${brief}`
  })
  const list = result.value && Array.isArray(result.value.greetings) ? result.value.greetings : []
  const seen = new Set()
  const unique = []
  for (const item of list) {
    const value = String(item).trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    unique.push(value)
    if (unique.length >= count) break
  }
  if (unique.length === 0) throw new Error('模型没有返回可用的备选开场白')
  if (unique.length < count) {
    const filler = generateAlternateGreetings({ ...source, name }, { count: count * 2 })
    for (const candidate of filler) {
      if (unique.length >= count) break
      if (!seen.has(candidate)) { seen.add(candidate); unique.push(candidate) }
    }
    let suffix = 2
    while (unique.length < count) {
      const variant = `${unique[unique.length % Math.max(1, unique.length)]}（变体 ${suffix}）`
      if (!seen.has(variant)) { seen.add(variant); unique.push(variant) }
      suffix += 1
    }
  }
  return { greetings: unique, model: result.model, rawText: result.rawText }
}

function buildStCard(character, options = {}) {
  const source = character && typeof character === 'object' && !Array.isArray(character) ? character : {};
  // Ensure name uses options.name/body.name as fallback per defect 2
  const nameSource = source.name || options.name || (options.body && options.body.name) || '未命名角色';
  const name = String(nameSource).trim() || '未命名角色';

  // Generate alternate greetings if not provided, ensure 3 unique per defect 1
  let alternateGreetings = Array.isArray(source.alternate_greetings)
    ? [...new Set(source.alternate_greetings.map(value => String(value).trim()).filter(Boolean))]
    : [];
  if (alternateGreetings.length === 0) {
    alternateGreetings = generateAlternateGreetings({ ...source, name }, { count: ALTERNATE_GREETING_COUNT });
  } else if (alternateGreetings.length < ALTERNATE_GREETING_COUNT) {
    // Top up 1-2 existing greetings to 3 unique using fallback templates, skipping duplicates
    const filler = generateAlternateGreetings({ ...source, name }, { count: ALTERNATE_GREETING_COUNT * 2 });
    for (const candidate of filler) {
      if (alternateGreetings.length >= ALTERNATE_GREETING_COUNT) break;
      if (!alternateGreetings.includes(candidate)) alternateGreetings.push(candidate);
    }
    let suffix = 2;
    while (alternateGreetings.length < ALTERNATE_GREETING_COUNT) {
      const variant = `${alternateGreetings[alternateGreetings.length % alternateGreetings.length]}（变体 ${suffix}）`;
      if (!alternateGreetings.includes(variant)) alternateGreetings.push(variant);
      suffix += 1;
    }
  }

  const raw = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name,
      description: String(source.description || ''),
      personality: String(source.personality || ''),
      scenario: String(source.scenario || ''),
      first_mes: String(source.first_mes || ''),
      mes_example: String(source.mes_example || `<START>\n{{user}}: 你好。\n{{char}}: 你好。`),
      creator_notes: String(source.creator_notes || '由 DSH Creative Suite 从小说角色生成'),
      system_prompt: String(source.system_prompt || ''),
      post_history_instructions: String(source.post_history_instructions || ''),
      tags: Array.isArray(source.tags) ? source.tags.map(String) : [],
      alternate_greetings: alternateGreetings,
      character_book: options.character_book && typeof options.character_book === 'object' ? options.character_book : null,
      extensions: {
        dsh_creative_suite: {
          generated: true,
          speechStyle: String(source.speechStyle || ''),
          source: String(options.source || 'character-json')
        }
      }
    }
  };
  return raw;
}

function validateStCardValue(value) {
  const normalized = unwrapStCard(value)
  const errors = []
  const warnings = []
  if (!normalized.name || normalized.name === '未命名人物卡' || normalized.name === '未命名角色') errors.push('缺少有效人物卡名称')
  if (!normalized.description.trim()) warnings.push('缺少 description')
  if (!normalized.personality.trim()) warnings.push('缺少 personality')
  if (!normalized.scenario.trim()) warnings.push('缺少 scenario')
  if (!normalized.first_mes.trim()) warnings.push('缺少 first_mes，无法直接开局')
  if (!normalized.mes_example.trim()) warnings.push('缺少 mes_example，角色对白风格可能不稳定')
  if (!normalized.tags.length) warnings.push('没有 tags')
  if (normalized.first_mes.length > 4000) warnings.push('first_mes 超过 4000 字，可能影响开局体验')
  const stats = {
    descriptionChars: normalized.description.length,
    personalityChars: normalized.personality.length,
    scenarioChars: normalized.scenario.length,
    firstMesChars: normalized.first_mes.length,
    mesExampleChars: normalized.mes_example.length,
    tagCount: normalized.tags.length,
    alternateGreetingCount: normalized.alternate_greetings.length,
    hasCharacterBook: Boolean(normalized.character_book)
  }
  return { valid: errors.length === 0, errors, warnings, stats }
}

function resourceKey(kind, id) {
  return String(kind) + ':' + String(id)
}

function briefOf(store, kind, id) {
  const record = store.data.resources[kind] && store.data.resources[kind][id]
  if (!record) return { kind, id, missing: true }
  return { kind, id, name: record.name, source: record.source, version: Number(record.version) || 1, updatedAt: record.updatedAt }
}

function lineageRefsOf(record) {
  const lineage = record && record.lineage && typeof record.lineage === 'object' ? record.lineage : {}
  const refs = []
  for (const [field, edgeType] of [['derivedFrom', 'derived-from'], ['basedOn', 'based-on']]) {
    const values = Array.isArray(lineage[field]) ? lineage[field] : []
    for (const ref of values) {
      if (!ref || typeof ref !== 'object' || !ref.kind || ref.id === undefined) continue
      refs.push({ kind: String(ref.kind), id: String(ref.id), edgeType, relation: field, version: ref.version === undefined ? null : Number(ref.version), derivation: String(ref.derivation || lineage.derivation || '') })
    }
  }
  return refs
}

function derivedFromOf(store, kind, id) {
  const record = store.data.resources[kind] && store.data.resources[kind][id]
  return lineageRefsOf(record).filter(ref => ref.edgeType === 'derived-from').map(({ kind: refKind, id: refId }) => ({ kind: refKind, id: refId }))
}

function directChildrenOf(store, kind, id) {
  const out = []
  for (const [childKind, table] of Object.entries(store.data.resources || {})) {
    if (!table || typeof table !== 'object') continue
    for (const candidate of Object.values(table)) {
      if (!candidate || candidate.id === undefined) continue
      if (lineageRefsOf(candidate).some(ref => String(ref.kind) === String(kind) && String(ref.id) === String(id))) {
        out.push({ kind: String(childKind), id: String(candidate.id) })
      }
    }
  }
  return out
}

function lineageFor(store, kind, id) {
  const resource = store.data.resources[kind] && store.data.resources[kind][id]
  if (!resource) return null
  const derived = []
  for (const [derivedKind, table] of Object.entries(store.data.resources)) {
    for (const candidate of Object.values(table)) {
      const refs = candidate && candidate.lineage && Array.isArray(candidate.lineage.derivedFrom) ? candidate.lineage.derivedFrom : []
      if (refs.some(ref => ref && ref.kind === kind && ref.id === id)) {
        derived.push({ kind: derivedKind, id: candidate.id, name: candidate.name, derivation: candidate.lineage?.derivation || '' })
      }
    }
  }
  return {
    resource: { kind, id: resource.id, name: resource.name, source: resource.source },
    lineage: resource.lineage || null,
    derived
  }
}

function lineageGraphFor(store, kind, id, options = {}) {
  const rootKind = String(kind)
  const rootId = String(id)
  const root = store.data.resources[rootKind] && store.data.resources[rootKind][rootId]
  if (!root) return null
  const maxDepth = Math.max(1, Math.min(50, Number(options.maxDepth) || 6))
  const nodes = new Map()
  const edges = []
  const edgeSeen = new Set()
  const cycleEdges = []
  let truncated = false
  const nodeFor = (nkind, nid, depth, direction) => {
    const key = resourceKey(nkind, nid)
    if (!nodes.has(key)) {
      const record = store.data.resources[nkind] && store.data.resources[nkind][nid]
      nodes.set(key, { ...briefOf(store, nkind, nid), nodeType: record ? 'resource' : 'missing', depth, direction })
    } else if (depth === 0) {
      nodes.get(key).depth = 0
      nodes.get(key).direction = 'root'
    } else if (depth >= 0 && (nodes.get(key).depth < 0 || nodes.get(key).depth > depth)) {
      nodes.get(key).depth = depth
      nodes.get(key).direction = depth === 0 ? 'root' : 'descendant'
    }
    return nodes.get(key)
  }
  const addEdge = (from, to, meta = {}) => {
    const key = `${from.kind}:${from.id}->${to.kind}:${to.id}:${meta.edgeType || 'lineage'}`
    if (edgeSeen.has(key)) return
    edgeSeen.add(key)
    const edge = { from: { kind: String(from.kind), id: String(from.id) }, to: { kind: String(to.kind), id: String(to.id) }, edgeType: meta.edgeType || 'lineage', relation: meta.relation || null, derivation: meta.derivation || '' }
    if (meta.missing) edge.missingParent = true
    if (meta.cycle) { edge.cycle = true; cycleEdges.push(edge) }
    edges.push(edge)
  }
  const visit = (ckind, cid, depth, path) => {
    const key = resourceKey(ckind, cid)
    if (path.includes(key)) return
    if (depth > maxDepth) { truncated = true; return }
    const record = store.data.resources[ckind] && store.data.resources[ckind][cid]
    nodeFor(ckind, cid, depth, depth === 0 ? 'root' : (depth < 0 ? 'ancestor' : 'descendant'))
    if (!record) return
    for (const ref of lineageRefsOf(record)) {
      const parentKey = resourceKey(ref.kind, ref.id)
      const parent = store.data.resources[ref.kind] && store.data.resources[ref.kind][ref.id]
      if (path.includes(parentKey) || parentKey === key) {
        continue
      }
      nodeFor(ref.kind, ref.id, -(Math.abs(depth) + 1), 'ancestor')
      addEdge({ kind: ref.kind, id: ref.id }, { kind: ckind, id: cid }, { ...ref, missing: !parent })
      if (parent) visit(ref.kind, ref.id, depth + 1, [...path, key])
    }
    for (const [childKind, table] of Object.entries(store.data.resources || {})) {
      for (const child of Object.values(table || {})) {
        if (!child || child.id === undefined) continue
        for (const ref of lineageRefsOf(child)) {
          if (ref.kind !== ckind || ref.id !== cid) continue
          const childKey = resourceKey(childKind, child.id)
          if (path.includes(childKey)) {
            addEdge({ kind: ckind, id: cid }, { kind: childKind, id: child.id }, { ...ref, cycle: true })
            continue
          }
          if (depth + 1 > maxDepth) { truncated = true; continue }
          nodeFor(childKind, child.id, depth + 1, 'descendant')
          addEdge({ kind: ckind, id: cid }, { kind: childKind, id: child.id }, ref)
          visit(childKind, String(child.id), depth + 1, [...path, key])
        }
      }
    }
  }
  visit(rootKind, rootId, 0, [])
  const adjacency = new Map()
  for (const edge of edges) {
    const fromKey = resourceKey(edge.from.kind, edge.from.id)
    const toKey = resourceKey(edge.to.kind, edge.to.id)
    if (!adjacency.has(fromKey)) adjacency.set(fromKey, [])
    adjacency.get(fromKey).push({ toKey, edge })
  }
  const visiting = new Set()
  const visited = new Set()
  const cycleEdgeSet = new Set()
  const detectCycles = key => {
    if (visiting.has(key)) return true
    if (visited.has(key)) return false
    visiting.add(key)
    for (const item of adjacency.get(key) || []) {
      if (detectCycles(item.toKey)) cycleEdgeSet.add(item.edge)
    }
    visiting.delete(key)
    visited.add(key)
    return false
  }
  for (const key of adjacency.keys()) detectCycles(key)
  for (const edge of cycleEdgeSet) { edge.cycle = true; cycleEdges.push(edge) }
  const list = [...nodes.values()].sort((a, b) => (a.depth - b.depth) || String(a.kind).localeCompare(String(b.kind)) || String(a.id).localeCompare(String(b.id)))
  return {
    root: { kind: rootKind, id: rootId },
    mode: options.mode || 'full',
    nodeCount: list.length,
    edgeCount: edges.length,
    maxDepth,
    truncated,
    cycleDetected: cycleEdges.length > 0,
    cycleCount: cycleEdges.length,
    nodes: list,
    edges: edges.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
}

function extractRegexScriptsFromPreset(record) {
  const raw = record && record.data && record.data.raw
  const extensions = raw && raw.extensions && typeof raw.extensions === 'object' ? raw.extensions : {}
  const binding = extensions.SPreset && extensions.SPreset.RegexBinding && Array.isArray(extensions.SPreset.RegexBinding.regexes)
    ? extensions.SPreset.RegexBinding.regexes
    : []
  const scripts = Array.isArray(extensions.regex_scripts) && extensions.regex_scripts.length > 0
    ? extensions.regex_scripts
    : binding
  return scripts
    .filter(script => script && typeof script === 'object' && !Array.isArray(script))
    .map((script, index) => ({
      id: String(script.id || script.uuid || 'regex-' + (index + 1)),
      name: String(script.scriptName || script.name || script.comment || 'regex-' + (index + 1)),
      find: String(script.findRegex || script.find_regex || script.find || ''),
      replace: String(script.replaceString || script.replace_string || script.replace || ''),
      disabled: script.disabled === true,
      placement: Array.isArray(script.placement) ? script.placement.map(Number) : (script.placement === undefined ? null : [Number(script.placement)]),
      markdownOnly: script.markdownOnly === true,
      promptOnly: script.promptOnly === true
    }))
}

function compileRegexScript(script) {
  const find = String(script && script.find || '')
  if (!find) throw new Error('空的 find regex')
  const literal = /^\/([\s\S]*)\/([a-z]*)$/i.exec(find)
  if (literal) return new RegExp(literal[1], literal[2])
  return new RegExp(find, 'g')
}

function applyRegexScripts(scripts, text, options = {}) {
  let output = String(text == null ? '' : text)
  const applied = []
  const skipped = []
  const placement = options.placement
  for (const script of Array.isArray(scripts) ? scripts : []) {
    if (!script || script.disabled) { skipped.push({ id: script && script.id, name: script && script.name, reason: 'disabled' }); continue }
    if (script.promptOnly && options.forDisplay !== false) { skipped.push({ id: script.id, name: script.name, reason: 'promptOnly' }); continue }
    if (placement !== undefined && placement !== null && Array.isArray(script.placement) && script.placement.length > 0 && !script.placement.includes(Number(placement))) {
      skipped.push({ id: script.id, name: script.name, reason: 'placement' }); continue
    }
    try {
      const regex = compileRegexScript(script)
      output = output.replace(regex, script.replace)
      applied.push({ id: script.id, name: script.name })
    } catch (error) {
      skipped.push({ id: script.id, name: script.name, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return { text: output, applied, skipped }
}

function textFromMessageContent(content) {
  if (!Array.isArray(content)) return ''
  return content.map(block => {
    if (!block || typeof block !== 'object') return ''
    if (block.type === 'text') return String(block.text || '')
    if (block.type === 'reasoning') return ''
    return ''
  }).filter(Boolean).join('\n')
}

async function composeSnapshotTranscript(dshHome, chatId, maxChars) {
  const safeChat = safeTavernChatId(chatId)
  const snapshotDir = path.join(dshHome, 'profile-data', 'tavern', 'data', 'chats', safeChat, 'snapshots')
  let names = []
  try { names = (await readdir(snapshotDir)).filter(name => name.endsWith('.json.gz')).sort() } catch (error) { return '' }
  if (names.length === 0) return ''
  const file = path.join(snapshotDir, names[names.length - 1])
  let data
  try { data = JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) } catch (error) { return '' }
  const messages = Array.isArray(data.messages) ? data.messages : []
  const lines = []
  for (const message of messages) {
    const role = message && message.role
    if (role !== 'user' && role !== 'assistant') continue
    let text = String(message.text || message.message || '')
    if (!text.trim() && Array.isArray(message.content)) text = textFromMessageContent(message.content)
    if (!text.trim()) continue
    lines.push(`${role === 'assistant' ? '角色/正文' : '玩家'}: ${text.trim()}`)
  }
  return lines.join('\n\n').slice(-Math.max(2000, Number(maxChars) || 16000))
}

async function composeTavernTranscript(dshHome, chatId, maxChars) {
  const snapshotTranscript = await composeSnapshotTranscript(dshHome, chatId, maxChars)
  if (snapshotTranscript.trim()) return snapshotTranscript
  const root = path.join(dshHome, 'profile-data', 'tavern', 'data', 'model-requests', String(chatId))
  const index = JSON.parse(await readFile(path.join(root, 'index.json'), 'utf8'))
  const requests = Array.isArray(index.requests) ? index.requests : []
  if (requests.length === 0) throw new Error('该 Tavern 会话没有模型请求记录')
  const latest = requests.reduce((best, item) => (Number(item.createdAt) || 0) > (Number(best.createdAt) || 0) ? item : best, requests[0])
  const payload = JSON.parse(await readFile(path.join(root, latest.id + '.json'), 'utf8'))
  const messages = payload && payload.request && Array.isArray(payload.request.messages) ? payload.request.messages : []
  const lines = []
  for (const message of messages) {
    const role = message && message.role
    if (role !== 'user' && role !== 'assistant') continue
    const text = textFromMessageContent(message.content).trim()
    if (!text) continue
    lines.push(`${role === 'assistant' ? '角色/正文' : '玩家'}: ${text}`)
  }
  const transcript = lines.join('\n\n')
  if (!transcript) throw new Error('该 Tavern 会话没有可分析的正文内容')
  return transcript.slice(-Math.max(2000, Number(maxChars) || 16000))
}

function heuristicFeedback(transcript) {
  const text = String(transcript || '').trim()
  const questions = (text.match(/[^\n。！？?]*(?:为什么|怎么|是否|难道|秘密|真相|失踪|没有|会不会)[^\n。！？?]*[？?]/g) || []).map(value => value.trim()).slice(0, 5)
  return {
    summary: text.slice(-500),
    relationshipChanges: [],
    characterGrowth: [],
    unresolvedHooks: questions,
    playerPreferences: [],
    continuationOutline: [{ title: '继续推进', summary: '根据记录最后一段场景，推进下一轮剧情。' }],
    newCharacterCandidates: []
  }
}

function storyProjectsRoot(dshHome) {
  return path.join(dshHome, 'profile-data', 'creative-suite', 'projects')
}

function safeStoryId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) throw new Error('项目 ID 必须是 1-64 位小写字母、数字、点、下划线或连字符')
  if (id.includes('..')) throw new Error('项目 ID 不允许 ..')
  return id
}

function safeTavernChatId(value) {
  const id = String(value || '').trim()
  if (!id) throw new Error('chatId 不能为空')
  if (id.includes(' ')) throw new Error('chatId 不合法')
  if (id === '.' || id === '..') throw new Error('chatId 不合法')
  if (id.includes('/') || id.includes('\\')) throw new Error('chatId 不合法')
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(id)) throw new Error('chatId 不合法')
  return id
}

function safeProjectPath(projectRoot, relative) {
  const raw = String(relative || '')
  if (raw.includes(' ')) throw new Error('文件路径不合法')
  const value = raw.replace(/\\/g, '/').replace(/^\/+/, '')
  if (value.split('/').some(part => part === '..' || part === '.' || part === '')) throw new Error('文件路径不合法')
  const resolved = path.resolve(projectRoot, value)
  const root = path.resolve(projectRoot)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('文件路径越界')
  return resolved
}

function isProtectedProjectFile(relative) {
  const value = String(relative || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = value.split('/').filter(part => part !== '' && part !== '.')
  return parts.length === 1 && parts[0] === '.project.json'
}

function safeExportFilename(id) {
  return String(id == null ? 'card' : id).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 64) || 'card'
}

async function walkStoryFiles(root, current = '') {
  const dir = current === '' ? root : path.join(root, current)
  const entries = await readdir(dir, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    const rel = current === '' ? entry.name : current + '/' + entry.name
    if (entry.isDirectory()) {
      result.push({ type: 'dir', path: rel })
      result.push(...(await walkStoryFiles(root, rel)))
    } else if (entry.isFile()) {
      const buffer = await readFile(path.join(root, rel))
      result.push({ type: 'file', path: rel, bytes: buffer.length })
    }
  }
  return result
}

async function listStoryProjects(dshHome) {
  const root = storyProjectsRoot(dshHome)
  await mkdir(root, { recursive: true })
  const entries = await readdir(root, { withFileTypes: true })
  const projects = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const projectRoot = path.join(root, entry.name)
    let meta = { id: entry.name, name: entry.name, kind: 'story' }
    try { meta = Object.assign(meta, JSON.parse(await readFile(path.join(projectRoot, '.project.json'), 'utf8'))) } catch (error) {}
    projects.push(meta)
  }
  return projects.sort((left, right) => String(left.name).localeCompare(String(right.name), 'zh-CN'))
}

function storyTemplateFiles(kind, name) {
  const safeTitle = String(name || '未命名项目').trim() || '未命名项目'
  const common = {
    'README.md': `# ${safeTitle}\n\n`,
    'outline.md': `# ${safeTitle} · 大纲\n\n## 核心设定\n\n\n## 主要角色\n\n\n## 分章/分集规划\n\n`
  }
  if (kind === 'drama') {
    return {
      ...common,
      'episodes/第01集.md': '# 第01集\n\n## 场次 1\n\n【内景/外景】\n\n角色：\n\n对白：\n'
    }
  }
  if (kind === 'game') {
    return {
      ...common,
      'design/game-design.md': `# ${safeTitle} · 游戏设计\n\n## 玩家目标\n\n## 核心循环\n\n## 角色/阵营\n\n## 事件与结局\n`,
      'cards/角色卡.md': '# 角色卡\n\n'
    }
  }
  if (kind === 'video') {
    return {
      ...common,
      'script/解说脚本.md': `# ${safeTitle} · 视频解说脚本\n\n## 00:00 开场\n\n## 00:15 主体\n\n## 结尾\n`
    }
  }
  return {
    ...common,
    'chapters/第01章.md': '# 第01章\n\n'
  }
}

async function createStoryProject(dshHome, body) {
  const name = String(body.name || '').trim()
  if (!name) throw new Error('项目名称不能为空')
  const kind = ['novel', 'drama', 'game', 'video'].includes(String(body.kind)) ? String(body.kind) : 'novel'
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  let id = safeStoryId(body.id || slug || 'project-' + randomUUID().slice(0, 8))
  const root = storyProjectsRoot(dshHome)
  let projectRoot = path.join(root, id)
  if (!body.id && existsSync(projectRoot)) id = safeStoryId(slug ? slug + '-' + randomUUID().slice(0, 6) : 'project-' + randomUUID().slice(0, 8))
  projectRoot = path.join(root, id)
  await mkdir(projectRoot, { recursive: true })
  const meta = { id, name, kind, createdAt: Date.now(), updatedAt: Date.now() }
  await writeFile(path.join(projectRoot, '.project.json'), JSON.stringify(meta, null, 2), 'utf8')
  const files = storyTemplateFiles(kind, name)
  for (const [relative, text] of Object.entries(files)) {
    const file = safeProjectPath(projectRoot, relative)
    await mkdir(path.dirname(file), { recursive: true })
    try { await readFile(file) } catch (error) { await writeFile(file, text, 'utf8') }
  }
  return meta
}

async function readStoryProjectMeta(dshHome, projectId) {
  const id = safeStoryId(projectId)
  const projectRoot = path.join(storyProjectsRoot(dshHome), id)
  const meta = Object.assign({ id }, JSON.parse(await readFile(path.join(projectRoot, '.project.json'), 'utf8')))
  const files = await walkStoryFiles(projectRoot)
  return { meta, files }
}

async function updateStoryProject(dshHome, projectId, body) {
  const id = safeStoryId(projectId)
  const projectRoot = path.join(storyProjectsRoot(dshHome), id)
  const metaPath = path.join(projectRoot, '.project.json')
  const current = JSON.parse(await readFile(metaPath, 'utf8'))
  const next = Object.assign({}, current, { id })
  if (body.name !== undefined) {
    const name = String(body.name || '').trim()
    if (!name) throw new Error('项目名称不能为空')
    next.name = name
  }
  if (body.kind !== undefined) {
    if (!['novel', 'drama', 'game', 'video'].includes(String(body.kind))) throw new Error('不支持的项目类型')
    next.kind = String(body.kind)
  }
  next.updatedAt = Date.now()
  await writeFile(metaPath, JSON.stringify(next, null, 2), 'utf8')
  return next
}

async function deleteStoryProject(dshHome, projectId) {
  const id = safeStoryId(projectId)
  const projectRoot = path.join(storyProjectsRoot(dshHome), id)
  if (!existsSync(projectRoot)) throw new Error('项目不存在')
  await rm(projectRoot, { recursive: true, force: true })
  return id
}

async function readStoryProjectSource(dshHome, projectId, maxChars = 14000) {
  const projectRoot = path.join(storyProjectsRoot(dshHome), safeStoryId(projectId))
  const entries = await walkStoryFiles(projectRoot)
  const parts = []
  for (const entry of entries.filter(item => item.type === 'file' && /\.(md|txt|html|json)$/i.test(item.path)).slice(0, 40)) {
    const file = safeProjectPath(projectRoot, entry.path)
    const buffer = await readFile(file)
    if (buffer.length > 512 * 1024) continue
    parts.push(`# ${entry.path}

${buffer.toString('utf8')}`)
    if (parts.join('\n\n').length >= maxChars) break
  }
  return parts.join('\n\n---\n\n').slice(0, maxChars)
}

function nextStoryNumberedPath(files, directory, head, tail, extension) {
  const pattern = new RegExp('^' + head + '([0-9]+)' + tail + '\\.' + extension + '$')
  const existing = files
    .filter(file => file.type === 'file' && file.path.startsWith(directory + '/'))
    .map(file => {
      const name = file.path.split('/').pop()
      const match = pattern.exec(name)
      return match ? Number(match[1]) : NaN
    })
    .filter(Number.isFinite)
  const next = (existing.length > 0 ? Math.max(...existing) : 0) + 1
  return `${directory}/${head}${String(next).padStart(2, '0')}${tail}.${extension}`
}

async function generateStoryWorkbench(routeCtx, dshHome, store, projectId, body) {
  const kind = ['outline', 'chapter', 'drama', 'game', 'video'].includes(String(body.kind)) ? String(body.kind) : ''
  if (!kind) throw new Error('不支持的 Story 工作台生成类型')
  const storyId = safeStoryId(projectId)
  const projectRoot = path.join(storyProjectsRoot(dshHome), storyId)
  const projectMeta = JSON.parse(await readFile(path.join(projectRoot, '.project.json'), 'utf8'))
  const now = Date.now()
  let storyRecord = store.data.resources.stories[storyId]
  if (!storyRecord) {
    storyRecord = {
      id: storyId,
      kind: 'stories',
      name: projectMeta.name || storyId,
      source: 'story-project',
      version: 1,
      createdAt: now,
      updatedAt: now,
      lineage: { derivedFrom: [], derivation: 'story-project' },
      data: { format: 'story-project', projectId: storyId }
    }
    store.data.resources.stories[storyId] = storyRecord
  }
  storyRecord.name = projectMeta.name || storyRecord.name
  storyRecord.updatedAt = now
  const files = await walkStoryFiles(projectRoot)
  const source = await readStoryProjectSource(dshHome, projectId, 14000)
  if (!source.trim()) throw new Error('Story 项目缺少可读取的文本内容')
  const configs = {
    outline: {
      target: 'outline.md',
      system: '你是专业小说策划，只输出 Markdown 正文，不要解释。',
      prompt: `根据以下 Story 项目资料，整理一份完整的小说大纲，包含核心设定、主要角色、主线冲突、分章规划。\n\n资料：\n${source}`
    },
    chapter: {
      target: nextStoryNumberedPath(files, 'chapters', '第', '章', 'md'),
      system: '你是中文小说作者，只输出本章小说正文，不要解释，不要 Markdown 代码围栏。',
      prompt: `根据以下 Story 项目资料，续写下一章正文。保持人物、设定和前文一致，直接输出完整章节。\n\n资料：\n${source}`
    },
    drama: {
      target: nextStoryNumberedPath(files, 'episodes', '第', '集', 'md'),
      system: '你是短剧编剧，只输出标准短剧剧本，不要解释。包含场景、角色、对白和关键动作。',
      prompt: `根据以下 Story 项目资料，生成下一集短剧剧本。\n\n资料：\n${source}`
    },
    game: {
      target: 'design/game-design.md',
      system: '你是互动叙事游戏设计师，只输出 Markdown 游戏设计文档，不要解释。',
      prompt: `根据以下 Story 项目资料，生成互动游戏设计：玩家目标、核心循环、角色、事件、分支与结局。\n\n资料：\n${source}`
    },
    video: {
      target: 'script/解说脚本.md',
      system: '你是视频解说稿编剧，只输出 Markdown 解说脚本，不要解释。',
      prompt: `根据以下 Story 项目资料，生成视频解说脚本，包含开场、主体段落、高潮、结尾。\n\n资料：\n${source}`
    }
  }
  const config = configs[kind]
  const extra = String(body.instruction || '').trim()
  const result = await generateTextWithRetry(routeCtx, {
    maxTokens: Math.max(800, Math.min(5000, Number(body.maxTokens) || 2200)),
    system: config.system,
    prompt: extra ? `${config.prompt}\n\n额外要求：${extra}` : config.prompt
  }, Number(body.attempts) || 3)
  const text = String(result.text || '').trim()
  if (!text) throw new Error('模型没有返回可用内容')
  const targetPath = String(body.targetPath || config.target).replace(/\\/g, '/')
  if (isProtectedProjectFile(targetPath)) throw new Error('不能覆盖项目元数据文件')
  const outFile = safeProjectPath(projectRoot, targetPath)
  await mkdir(path.dirname(outFile), { recursive: true })
  await writeFile(outFile, text + '\n', 'utf8')
  const labels = { outline: '大纲', chapter: '章节', drama: '短剧', game: '游戏设计', video: '视频脚本' }
  const resourceId = randomUUID()
  const resource = {
    id: resourceId,
    kind: 'scripts',
    name: `${projectMeta.name || storyId} · ${labels[kind] || kind}`,
    source: 'story-workbench',
    version: 1,
    createdAt: now,
    updatedAt: Date.now(),
    lineage: { derivedFrom: [{ kind: 'stories', id: storyId }], derivation: 'story-workbench-' + kind, path: targetPath },
    data: { format: 'story-workbench-output', kind, projectId: storyId, path: targetPath, text: text.slice(0, 20000) }
  }
  store.data.resources.scripts[resourceId] = resource
  await store.save()
  return { kind, path: targetPath, text, model: result.model, attempts: result.attempts || 1, project: projectMeta, resource }
}

async function migrateTavernCards(dshHome, store) {
  const root = path.join(dshHome, 'profile-data', 'tavern', 'data', 'resources', 'cards')
  let names = []
  try { names = await readdir(root) } catch (error) { return { imported: 0, skipped: 0, errors: [{ file: root, message: error instanceof Error ? error.message : String(error) }] } }
  let imported = 0
  let skipped = 0
  const errors = []
  const resources = []
  for (const name of names.sort()) {
    const file = path.join(root, name)
    try {
      let raw
      let sourceFormat = 'unknown'
      if (/\.png$/i.test(name)) {
        raw = parsePngCard(await readFile(file))
        sourceFormat = 'sillytavern-png'
      } else if (/\.json$/i.test(name)) {
        raw = JSON.parse(await readFile(file, 'utf8'))
        sourceFormat = 'sillytavern-json'
      } else {
        skipped += 1
        continue
      }
      const normalized = unwrapStCard(raw, name)
      if (!normalized.name) { skipped += 1; continue }
      const id = 'tavern-' + name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      if (store.data.resources.cards[id]) { skipped += 1; continue }
      const now = Date.now()
      const record = {
        id,
        kind: 'cards',
        name: normalized.name,
        source: 'migrated-tavern',
        version: 1,
        createdAt: now,
        updatedAt: now,
        lineage: { derivedFrom: [], derivation: 'migrated-from-tavern', sourceFile: name },
        data: {
          format: sourceFormat,
          normalized,
          raw,
          sourcePath: path.join('cards', name)
        }
      }
      store.data.resources.cards[id] = record
      imported += 1
      resources.push({ id, name: normalized.name, file: name, sourceFormat })
    } catch (error) {
      errors.push({ file: name, message: error instanceof Error ? error.message : String(error) })
    }
  }
  await store.save()
  return { imported, skipped, errors, resources }
}

async function migrateTavernPresets(dshHome, store) {
  const root = path.join(dshHome, 'profile-data', 'tavern', 'data', 'resources', 'presets')
  let names = []
  try { names = (await readdir(root)).filter(name => /\.json$/i.test(name)).sort() } catch (error) { return { imported: 0, skipped: 0, errors: [], resources: [] } }
  let imported = 0
  let skipped = 0
  const errors = []
  const resources = []
  for (const name of names) {
    try {
      const raw = JSON.parse(await readFile(path.join(root, name), 'utf8'))
      const { normalized } = normalizePresetInput({ preset: raw, name })
      const id = 'tavern-preset-' + name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      if (store.data.resources.presets[id]) { skipped += 1; continue }
      const now = Date.now()
      const record = {
        id, kind: 'presets', name: normalized.name, source: 'migrated-tavern', version: 1, createdAt: now, updatedAt: now,
        lineage: { derivedFrom: [], derivation: 'migrated-from-tavern', sourceFile: name },
        data: { format: 'sillytavern-preset-json', promptCount: normalized.promptCount, enabledPromptCount: normalized.enabledPromptCount, regexCount: normalized.regexCount, enabledRegexCount: normalized.enabledRegexCount, normalized, raw }
      }
      store.data.resources.presets[id] = record
      imported += 1
      resources.push({ id, name: normalized.name, file: name })
    } catch (error) {
      errors.push({ file: name, message: error instanceof Error ? error.message : String(error) })
    }
  }
  await store.save()
  return { imported, skipped, errors, resources }
}

async function migrateTavernWorldbooks(dshHome, store) {
  const root = path.join(dshHome, 'profile-data', 'tavern', 'data', 'resources', 'worldbooks')
  let names = []
  try { names = (await readdir(root)).filter(name => /\.json$/i.test(name)).sort() } catch (error) { return { imported: 0, skipped: 0, errors: [], resources: [] } }
  let imported = 0
  let skipped = 0
  const errors = []
  const resources = []
  for (const name of names) {
    try {
      const raw = JSON.parse(await readFile(path.join(root, name), 'utf8'))
      const { normalized } = normalizeWorldbookInput({ worldbook: raw, name })
      const id = 'tavern-worldbook-' + name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      if (store.data.resources.worldbooks[id]) { skipped += 1; continue }
      const now = Date.now()
      const record = {
        id, kind: 'worldbooks', name: normalized.name, source: 'migrated-tavern', version: 1, createdAt: now, updatedAt: now,
        lineage: { derivedFrom: [], derivation: 'migrated-from-tavern', sourceFile: name },
        data: { format: 'sillytavern-worldbook', entryCount: normalized.entryCount, normalized, raw }
      }
      store.data.resources.worldbooks[id] = record
      imported += 1
      resources.push({ id, name: normalized.name, file: name })
    } catch (error) {
      errors.push({ file: name, message: error instanceof Error ? error.message : String(error) })
    }
  }
  await store.save()
  return { imported, skipped, errors, resources }
}

async function importCardToTavern(dshHome, card) {
  const raw = card && card.data && card.data.raw
  if (!raw || typeof raw !== 'object') throw new Error('人物卡没有可导入的原始 ST JSON')
  const logPath = path.join(dshHome, 'logs', 'tavern.log')
  const log = await readFile(logPath, 'utf8')
  const matches = [...log.matchAll(/^dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)$/gm)]
  const url = matches.length > 0 ? matches[matches.length - 1][1] : ''
  if (!url) throw new Error('找不到正在运行的 DSH Tavern 服务')
  const auth = await fetch(url, { redirect: 'manual' })
  const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const origin = new URL(url).origin
  const response = await fetch(origin + '/api/dsh-tavern/importCard', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin },
    body: JSON.stringify({
      payload: {
        name: String(card.name || raw.data?.name || 'generated-card') + '.json',
        text: JSON.stringify(raw, null, 2)
      }
    })
  })
  const text = await response.text()
  let payload
  try { payload = JSON.parse(text) } catch { throw new Error('Tavern 返回不是 JSON: ' + text.slice(0, 300)) }
  if (!response.ok || payload.ok === false) throw new Error(payload.error || ('Tavern HTTP ' + response.status))
  return payload.card || payload
}

async function tavernServiceAuth(dshHome) {
  const logPath = path.join(dshHome, 'logs', 'tavern.log')
  let log = ''
  try { log = await readFile(logPath, 'utf8') } catch (error) {
    throw new Error('找不到正在运行的 DSH Tavern 服务：' + (error instanceof Error ? error.message : String(error)))
  }
  const matches = [...log.matchAll(/^dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)$/gm)]
  const url = matches.length > 0 ? matches[matches.length - 1][1] : ''
  if (!url) throw new Error('找不到正在运行的 DSH Tavern 服务')
  const auth = await fetch(url, { redirect: 'manual' })
  const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  return { origin: new URL(url).origin, cookie }
}

const TAVERN_RPC_TIMEOUT_MS = Math.max(1000, Math.min(15000, Number(process.env.DSH_TAVERN_RPC_TIMEOUT_MS) || 5000))

async function tavernRpcRequest(dshHome, method, args = {}) {
  const { origin, cookie } = await tavernServiceAuth(dshHome)
  // 超时守护：外部 Tavern 无响应时快速失败，不锁死调用线程（子代理 600s 超时根因）。
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Tavern RPC 超时（${method}，${TAVERN_RPC_TIMEOUT_MS}ms）：外部 Tavern 服务无响应`)), TAVERN_RPC_TIMEOUT_MS)
  let response
  try {
    response = await fetch(origin + '/api/dsh-tavern/' + method, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        origin
      },
      body: JSON.stringify(args && typeof args === 'object' ? args : {}),
      signal: controller.signal
    })
  } catch (error) {
    throw withNativeHint(error)
  } finally { clearTimeout(timer) }
  const text = await response.text()
  let payload
  try { payload = JSON.parse(text) } catch {
    throw withNativeHint(new Error('Tavern RPC 返回不是 JSON: ' + text.slice(0, 300)))
  }
  if (!response.ok || payload.ok === false) throw withNativeHint(new Error(payload.error || ('Tavern RPC HTTP ' + response.status)))
  return payload
}

async function tavernGameplayRequest(dshHome, method, args = {}) {
  return tavernRpcRequest(dshHome, 'gameplay.' + method, args)
}

const NATIVE_TAVERN_HINT = '（native engine N0未覆盖，建议走POST /plugins/creative-suite/tavern/native/turn）'

function withNativeHint(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('native engine N0')) return error
  const hinted = new Error(message + NATIVE_TAVERN_HINT)
  if (error && typeof error === 'object') {
    for (const key of ['mvuTransient', 'mvuAttempts', 'code', 'status']) {
      try { if (error[key] !== undefined) hinted[key] = error[key] } catch (_ignored) {}
    }
  }
  return hinted
}

async function ensureTavernSessionPatch(dshHome) {
  const status = await tavernRpcRequest(dshHome, 'getSessionPatchStatus', {})
  const patch = status && status.patch ? status.patch : null
  if (!patch) throw new Error('Tavern 未返回 session patch 状态')
  if (patch.serverReady && !patch.clientReady) {
    await tavernRpcRequest(dshHome, 'confirmSessionPatch', { protocol: 1, installed: true, via: 'dsh-creative-suite-poc' })
    const next = await tavernRpcRequest(dshHome, 'getSessionPatchStatus', {})
    return next.patch || null
  }
  return patch
}

async function tavernLaunchUrl(dshHome) {
  const logPath = path.join(dshHome, 'logs', 'tavern.log')
  let log = ''
  try { log = await readFile(logPath, 'utf8') } catch (error) {
    throw new Error('找不到正在运行的 DSH Tavern 服务：' + (error instanceof Error ? error.message : String(error)))
  }
  const matches = [...log.matchAll(/^dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)$/gm)]
  const url = matches.length > 0 ? matches[matches.length - 1][1] : ''
  if (!url) throw new Error('找不到正在运行的 DSH Tavern 服务')
  return url
}

function storyProjectResources(store, storyId) {
  const story = store.data.resources.stories && store.data.resources.stories[storyId]
  if (!story) return null
  const direct = new Set([storyId])
  const collect = (kind) => Object.values(store.data.resources[kind] || {}).filter(resource => {
    const refs = resource && resource.lineage && Array.isArray(resource.lineage.derivedFrom) ? resource.lineage.derivedFrom : []
    return refs.some(ref => ref && ref.kind === 'stories' && ref.id === storyId)
  })
  const novels = collect('novels')
  const worldbooks = collect('worldbooks')
  const scripts = collect('scripts')
  for (const resource of novels) direct.add('novels:' + resource.id)
  const collectByNovel = (kind) => Object.values(store.data.resources[kind] || {}).filter(resource => {
    const refs = resource && resource.lineage && Array.isArray(resource.lineage.derivedFrom) ? resource.lineage.derivedFrom : []
    return refs.some(ref => ref && ref.kind === 'novels' && novels.some(novel => novel.id === ref.id))
  })
  const worldbooksByNovel = collectByNovel('worldbooks')
  for (const resource of worldbooksByNovel) if (!worldbooks.some(item => item.id === resource.id)) worldbooks.push(resource)
  const worldbookIds = new Set(worldbooks.map(item => item.id))
  const cards = Object.values(store.data.resources.cards || {}).filter(resource => {
    const refs = resource && resource.lineage && Array.isArray(resource.lineage.derivedFrom) ? resource.lineage.derivedFrom : []
    return refs.some(ref => ref && ((ref.kind === 'stories' && ref.id === storyId) || (ref.kind === 'novels' && novels.some(novel => novel.id === ref.id)) || (ref.kind === 'worldbooks' && worldbookIds.has(ref.id))))
  })
  return {
    story: { id: story.id, kind: story.kind, name: story.name, source: story.source, lineage: story.lineage, data: story.data },
    novels: novels.map(item => ({ id: item.id, name: item.name, kind: item.kind })),
    worldbooks: worldbooks.map(item => ({ id: item.id, name: item.name, kind: item.kind, entryCount: item.data && item.data.entryCount })),
    scripts: scripts.map(item => ({ id: item.id, name: item.name, kind: item.kind, source: item.source, format: item.data && item.data.format, path: item.data && item.data.path, lineage: item.lineage })),
    cards: cards.map(item => ({ id: item.id, name: item.name, kind: item.kind, source: item.source, tavern: item.data && item.data.tavernCard || null, tavernError: item.data && item.data.tavernError || null, lineage: item.lineage }))
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

async function waitForNoRunningCandidate(dshHome, sessionId, maxWaitMs = 12000) {
  const startedAt = Date.now()
  const deadline = startedAt + Math.max(1500, Number(maxWaitMs) || 12000)
  while (Date.now() < deadline) {
    await delay(500)
    try {
      const payload = await tavernGameplayRequest(dshHome, 'requests', { sessionId })
      const requests = Array.isArray(payload.requests) ? payload.requests : []
      const active = requests.filter(request => request && request.task === 'candidate' && ['pending', 'queued', 'running'].includes(String(request.status || '')))
      if (active.length === 0 && Date.now() - startedAt >= 1500) return true
    } catch (_error) {}
  }
  return false
}

async function runCandidateTask(dshHome, body) {
  const sessionId = String(body && body.sessionId || '').trim()
  if (!sessionId) throw new Error('sessionId 不能为空')
  const requested = Number(body && body.timeoutMs)
  const timeoutMs = Math.max(1000, Math.min(180000, Number.isFinite(requested) && requested > 0 ? requested : 60000))
  let previousRequestId = ''
  try {
    const before = await tavernGameplayRequest(dshHome, 'state', { sessionId })
    previousRequestId = String(before && before.chat && before.chat.candidates && before.chat.candidates.requestId || '')
  } catch (_error) {}
  let submit
  try {
    submit = await tavernGameplayRequest(dshHome, 'candidates', { sessionId, requestId: body.requestId || undefined })
  } catch (error) {
    return {
      ok: true,
      timedOut: false,
      failed: true,
      phase: 'submit',
      cancelled: false,
      candidates: null,
      error: error instanceof Error ? error.message : String(error),
      fallback: { mode: 'manual-input', message: '候选任务提交失败，已回退到手动输入' }
    }
  }

  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  let lastStateError = ''
  while (Date.now() < deadline) {
    await delay(Math.min(1000, Math.max(100, deadline - Date.now())))
    try {
      const state = await tavernGameplayRequest(dshHome, 'state', { sessionId })
      const candidates = state && state.chat && state.chat.candidates
      const isNewCandidateSet = !previousRequestId || (candidates && candidates.requestId && candidates.requestId !== previousRequestId)
      if (isNewCandidateSet && candidates && Array.isArray(candidates.choices) && candidates.choices.length > 0) {
        return {
          ok: true,
          timedOut: false,
          failed: false,
          cancelled: false,
          candidates,
          submit,
          elapsedMs: Date.now() - startedAt
        }
      }
    } catch (error) {
      lastStateError = error instanceof Error ? error.message : String(error)
    }
  }

  let cancelled = false
  let cancelError = ''
  try {
    await tavernGameplayRequest(dshHome, 'cancel', { sessionId })
    cancelled = true
  } catch (error) {
    cancelError = error instanceof Error ? error.message : String(error)
  }
  let taskStopped = false
  if (cancelled) {
    taskStopped = await waitForNoRunningCandidate(dshHome, sessionId, 12000)
    if (taskStopped) await delay(800)
  }

  return {
    ok: true,
    timedOut: true,
    failed: true,
    phase: 'timeout',
    cancelled,
    cancelError,
    taskStopped,
    candidates: null,
    elapsedMs: Date.now() - startedAt,
    timeoutMs,
    error: lastStateError || `候选生成超时（${Math.round(timeoutMs / 1000)} 秒）`,
    fallback: { mode: 'manual-input', message: '候选生成超时，已自动取消任务，已回退到手动输入' }
  }
}

async function generateText(routeCtx, { system = '', prompt, maxTokens = 2000, temperature, topP }) {
  const selection = routeCtx.agentDefaultModel?.currentSelection?.()
  if (!selection || !selection.provider || !selection.model) throw new Error('DSH 未配置默认模型')
  const message = {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: String(prompt || '') }],
    source: { kind: 'user' }
  }
  let text = ''
  let finish = null
  const stream = routeCtx.llm.stream({
    provider: selection.provider,
    model: selection.model,
    system: String(system || ''),
    messages: [message],
    maxTokens,
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(typeof topP === 'number' ? { topP } : {})
  })
  for await (const chunk of stream) {
    if (!chunk || typeof chunk !== 'object') continue
    if (chunk.type === 'text-delta') text += chunk.text || ''
    else if (chunk.type === 'finish') {
      finish = chunk.reason || null
      if (chunk.reason?.kind === 'error') throw new Error(chunk.reason.failure?.message || '模型生成失败')
      if (chunk.reason?.kind === 'aborted') throw new Error('模型生成已取消')
    }
  }
  return { text: text.trim(), finish, model: selection }
}

function isTransientLlmError(error) {
  const message = String(error?.message ?? error ?? '')
  if (!message) return true
  if (/已取消|aborted by user|cancelled by user/i.test(message)) return false
  if (/未配置默认模型|no model|model not found|unauthorized|forbidden|invalid api key|invalid request|bad request|\b400\b|\b401\b|\b403\b|\b404\b/i.test(message)) return false
  return true
}
async function generateTextWithRetry(routeCtx, options, attempts = 3) {
  let lastError = null
  let lastTransient = true
  const maxAttempts = Math.max(1, Math.min(5, Number(attempts) || 3))
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await generateText(routeCtx, options)
      if (String(result.text || '').trim()) return Object.assign({}, result, { attempts: attempt, transient: false })
      lastError = new Error('模型返回空内容')
      lastTransient = true
    } catch (error) {
      lastError = error
      lastTransient = isTransientLlmError(error)
      if (!lastTransient) {
        if (error && typeof error === 'object') { try { error.mvuTransient = false } catch (_ignored) {} }
        break
      }
    }
    if (attempt < maxAttempts) await delay(Math.min(8000, 600 * (2 ** (attempt - 1))))
  }
  if (lastError && typeof lastError === 'object') { try { lastError.mvuAttempts = maxAttempts; lastError.mvuTransient = lastTransient } catch (_ignored) {} }
  throw lastError || new Error('模型生成失败')
}

async function generateJson(routeCtx, options) {
  const result = await generateText(routeCtx, options)
  const jsonText = stripJsonFence(result.text)
  let value
  try { value = JSON.parse(jsonText) } catch (error) {
    throw new Error('模型没有返回合法 JSON: ' + jsonText.slice(0, 500))
  }
  return { value, rawText: result.text, model: result.model }
}

function splitNovelChapters(text) {
  const lines = String(text || '').split(/\r?\n/)
  const heading = /^(?:#{1,6}\s+.*|第[0-9一二三四五六七八九十百千万零两]+[章节回卷集部篇][^\n]*|chapter\s+\d+[^\n]*)$/i
  const chapters = []
  let current = { title: '正文', lines: [] }
  function push() {
    const content = current.lines.join('\n').trim()
    if (current.title !== '正文' || content !== '') chapters.push({ title: current.title, content })
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (heading.test(trimmed)) {
      push()
      current = { title: trimmed.replace(/^#{1,6}\s+/, '').trim() || '未命名章节', lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  push()
  return chapters.map((chapter, index) => ({
    index: index + 1,
    title: chapter.title,
    content: chapter.content,
    charCount: [...chapter.content.replace(/\s/g, '')].length,
    preview: chapter.content.slice(0, 200)
  }))
}

function extractNovelCharacters(text) {
  const counts = new Map()
  const stop = new Set(['他', '她', '我', '你', '我们', '你们', '他们', '大家', '众人', '旁白', '系统', '作者', '如果', '于是', '但是', '因为', '所以', '然后', '可是', '不过', '忽然', '突然', '此时', '这里', '那里'])
  const dialogue = /^[　\t ]*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_·]{1,11})[：:]/gm
  let match
  while ((match = dialogue.exec(String(text || '')))) {
    const name = match[1]
    if (stop.has(name) || name.length < 2) continue
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 30)
    .map(([name, mentions]) => ({ name, mentions }))
}

function normalizeNovelInput(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const text = String(input.text || input.content || '')
  if (text.trim() === '') throw new Error('小说内容为空')
  const chapters = splitNovelChapters(text)
  const characters = extractNovelCharacters(text)
  return {
    name: String(input.name || '未命名小说').trim() || '未命名小说',
    text,
    charCount: [...text.replace(/\s/g, '')].length,
    lineCount: text.split(/\r?\n/).length,
    chapterCount: chapters.length,
    chapters,
    characters
  }
}

function unwrapWorldbookInput(value, fallbackName) {
  let root = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  if (root.kind === 'dsh-tavern-character-workspace' && root.raw && typeof root.raw === 'object') root = root.raw.data || root.raw
  if (root.character_book && typeof root.character_book === 'object') root = root.character_book
  if (root.data && typeof root.data === 'object' && root.data.character_book) root = root.data.character_book
  const sourceEntries = root.entries
  const rawEntries = Array.isArray(sourceEntries)
    ? sourceEntries
    : sourceEntries && typeof sourceEntries === 'object'
      ? Object.values(sourceEntries)
      : []
  const entries = rawEntries.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry)).map((entry, index) => {
    const keys = Array.isArray(entry.keys)
      ? entry.keys.map(String).filter(Boolean)
      : entry.key !== undefined
        ? [String(entry.key)]
        : entry.keys !== undefined
          ? String(entry.keys).split(',').map(value => value.trim()).filter(Boolean)
          : []
    const content = String(entry.content || '')
    return {
      id: String(entry.id || entry.uid || index),
      keys,
      secondaryKeys: Array.isArray(entry.secondary_keys) ? entry.secondary_keys.map(String) : [],
      comment: String(entry.comment || entry.name || '').trim(),
      contentPreview: content.slice(0, 240),
      contentLength: content.length,
      enabled: entry.enabled !== false && entry.disable !== true,
      constant: entry.constant === true,
      selective: entry.selective === true,
      insertionOrder: Number(entry.insertion_order ?? entry.order ?? 0) || 0,
      position: entry.position === undefined ? null : Number(entry.position),
      depth: entry.depth === undefined ? null : Number(entry.depth),
      probability: entry.probability === undefined ? null : Number(entry.probability),
      useProbability: entry.useProbability !== false,
      group: String(entry.group || '')
    }
  })
  const name = String(root.name || root.bookName || root.book_name || fallbackName || '未命名世界书').trim() || '未命名世界书'
  return { name, entryCount: entries.length, entries }
}

function unwrapPresetInput(value, fallbackName) {
  let root = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  if (root.kind === 'dsh-tavern-character-workspace' && root.raw && typeof root.raw === 'object') root = root.raw.data || root.raw
  const prompts = Array.isArray(root.prompts) ? root.prompts : []
  const normalizedPrompts = prompts.filter(prompt => prompt && typeof prompt === 'object' && !Array.isArray(prompt)).map((prompt, index) => ({
    identifier: String(prompt.identifier || prompt.id || 'prompt-' + (index + 1)),
    name: String(prompt.name || prompt.identifier || 'prompt-' + (index + 1)),
    role: ['user', 'assistant', 'system'].includes(String(prompt.role)) ? String(prompt.role) : 'system',
    enabled: prompt.enabled !== false,
    marker: prompt.marker === true,
    systemPrompt: prompt.system_prompt === true,
    injectionPosition: prompt.injection_position === undefined ? null : Number(prompt.injection_position),
    injectionDepth: prompt.injection_depth === undefined ? null : Number(prompt.injection_depth),
    injectionOrder: prompt.injection_order === undefined ? null : Number(prompt.injection_order),
    contentPreview: String(prompt.content || '').slice(0, 240),
    contentLength: String(prompt.content || '').length
  }))
  const orders = Array.isArray(root.prompt_order) ? root.prompt_order : []
  const orderGroup = orders.find(group => group && Number(group.character_id) === 100001 && Array.isArray(group.order))
    || orders.find(group => group && Array.isArray(group.order))
    || null
  const order = orderGroup && Array.isArray(orderGroup.order) ? orderGroup.order : []
  const extensions = root.extensions && typeof root.extensions === 'object' && !Array.isArray(root.extensions) ? root.extensions : {}
  const nativeRegex = Array.isArray(extensions.regex_scripts) ? extensions.regex_scripts : []
  const bindingRegex = extensions.SPreset && extensions.SPreset.RegexBinding && Array.isArray(extensions.SPreset.RegexBinding.regexes)
    ? extensions.SPreset.RegexBinding.regexes
    : []
  const regexScripts = nativeRegex.length > 0 ? nativeRegex : bindingRegex
  const enabledPrompts = normalizedPrompts.filter(prompt => prompt.enabled)
  const enabledRegexes = regexScripts.filter(script => script && typeof script === 'object' && script.disabled !== true)
  const name = String(root.name || root.preset_name || root.title || fallbackName || '未命名预设').trim() || '未命名预设'
  return {
    name,
    promptCount: normalizedPrompts.length,
    enabledPromptCount: enabledPrompts.length,
    orderedPromptCount: order.length,
    orderGroupIndex: orders.indexOf(orderGroup),
    orderCharacterId: orderGroup && Number(orderGroup.character_id) || null,
    prompts: normalizedPrompts,
    regexCount: regexScripts.length,
    enabledRegexCount: enabledRegexes.length,
    rootKeys: Object.keys(root),
    sampling: {
      temperature: root.temperature ?? null,
      frequencyPenalty: root.frequency_penalty ?? null,
      presencePenalty: root.presence_penalty ?? null,
      topP: root.top_p ?? null,
      topK: root.top_k ?? null,
      maxContext: root.openai_max_context ?? null,
      maxTokens: root.openai_max_tokens ?? null
    }
  }
}

function normalizePresetInput(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  let value = input.preset
  if (value === undefined && typeof input.text === 'string' && input.text.trim() !== '') {
    try { value = JSON.parse(input.text) } catch (error) { throw new Error('预设不是有效的 JSON') }
  }
  if (value === undefined) value = input
  const normalized = unwrapPresetInput(value, input.name)
  return { normalized, raw: value && typeof value === 'object' ? value : {}, name: normalized.name }
}

function normalizeWorldbookInput(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  let value = input.worldbook
  if (value === undefined && typeof input.text === 'string' && input.text.trim() !== '') {
    try { value = JSON.parse(input.text) } catch (error) { throw new Error('世界书不是有效的 JSON') }
  }
  if (value === undefined) value = input
  const normalized = unwrapWorldbookInput(value, input.name)
  return { normalized, raw: value && typeof value === 'object' ? value : {}, name: normalized.name }
}

function normalizeStCardInput(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  let value = input.card
  if (value === undefined && typeof input.text === 'string' && input.text.trim() !== '') {
    try { value = JSON.parse(input.text) } catch (error) { throw new Error('人物卡不是有效的 JSON') }
  }
  if (value === undefined) value = input
  const normalized = unwrapStCard(value, input.name)
  const raw = value && typeof value === 'object' ? value : {}
  return { normalized, raw, name: normalized.name }
}

async function modelCatalog(ctx) {
  const providers = ctx.llm.listProviders()
  const groups = []
  const failures = []
  for (const provider of providers) {
    try {
      const models = await ctx.llm.listModels(provider.id)
      groups.push({
        provider: provider.id,
        name: provider.name || provider.id,
        models: models.map(model => ({
          id: model.id,
          name: model.name || model.id,
          description: model.description || ''
        }))
      })
    } catch (error) {
      failures.push({
        provider: provider.id,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return {
    groups,
    failures,
    defaultSelection: ctx.agentDefaultModel?.currentSelection?.() || null
  }
}

function resourceList(store, kind) {
  const table = store.data.resources[kind] || {}
  return Object.values(table).sort((left, right) => (Number(right.updatedAt) || 0) - (Number(left.updatedAt) || 0))
}

function resourceBrief(record) {
  if (!record) return null
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    source: record.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lineage: record.lineage || null
  }
}

function worldbookEntriesFromRaw(raw) {
  const root = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const source = root.entries || (root.data && root.data.entries) || (root.character_book && root.character_book.entries) || {}
  const list = Array.isArray(source) ? source : Object.values(source)
  return list
    .filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map(entry => ({
      keys: Array.isArray(entry.keys) ? entry.keys.map(String) : entry.key !== undefined ? [String(entry.key)] : [],
      comment: String(entry.comment || entry.name || '').trim(),
      content: String(entry.content || ''),
      enabled: entry.enabled !== false && entry.disable !== true
    }))
}

function normalizeMuseIdList(value, max = 4) {
  const rawList = Array.isArray(value) ? value : (value === undefined || value === null || value === '' ? [] : [value])
  const out = []
  for (const item of rawList) {
    const id = String(item && typeof item === 'object' ? (item.id || '') : (item == null ? '' : item)).trim()
    if (!id || out.includes(id)) continue
    out.push(id)
    if (out.length >= max) break
  }
  return out
}

function buildMuseContext(store, body) {
  const input = body && typeof body === 'object' ? body : {}
  const cardId = input.cardId ? String(input.cardId) : ''
  const cardRecord = cardId ? store.data.resources.cards[cardId] : null
  let card = null
  if (cardRecord) {
    const raw = cardRecord.data && cardRecord.data.raw
    card = unwrapStCard(raw, cardRecord.name)
    card.id = cardRecord.id
  }
  const companionIds = normalizeMuseIdList(input.companionIds || input.castIds || input.extraCardIds)
    .filter(id => id && id !== cardId)
  const companions = []
  for (const id of companionIds) {
    const record = store.data.resources.cards[id]
    if (!record) continue
    const item = unwrapStCard(record.data && record.data.raw, record.name)
    item.id = record.id
    companions.push(item)
  }
  const fallbackWorldbookIds = cardRecord && cardRecord.data && Array.isArray(cardRecord.data.worldbookIds)
    ? cardRecord.data.worldbookIds
    : []
  const worldbookId = input.worldbookId ? String(input.worldbookId) : (fallbackWorldbookIds[0] || '')
  const worldbookRecord = worldbookId ? store.data.resources.worldbooks[worldbookId] : null
  const worldbook = worldbookRecord
    ? {
        id: worldbookRecord.id,
        name: worldbookRecord.name,
        entries: worldbookEntriesFromRaw(worldbookRecord.data && worldbookRecord.data.raw)
      }
    : null
  return { card, companions, companionIds: companions.map(item => item.id), worldbook }
}

function parseAdventureChoices(text) {
  const lines = String(text == null ? '' : text).split(/\r?\n/)
  const choices = []
  const seen = new Set()
  const pendingContinuation = []
  const flushContinuation = () => {
    if (choices.length > 0 && pendingContinuation.length > 0) {
      const extra = pendingContinuation.join(' ').trim()
      if (extra) choices[choices.length - 1] = (choices[choices.length - 1] + ' ' + extra).trim()
    }
    pendingContinuation.length = 0
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { flushContinuation(); continue }
    // Match: 选项1：xxx / 选项A: xxx / 1. xxx / 1、xxx / - xxx / A) xxx / 【选项】xxx / 可选行动：xxx
    const match = /^(?:(?:选项|选择|可选行动|行动选项)?\s*[A-Ea-e1-5]\s*[:：.)、\-]\s*|(?:选项|选择|可选行动|行动选项)\s*\d+\s*[:：]\s*|[-*•・]\s+|【(?:选项|选择|行动)\s*[A-Ea-e1-5]?\s*】\s*)(.+)$/.exec(trimmed)
    // Also catch explicit "A. xxx" (1-2 chars label) without keyword.
    const shortMatch = match ? null : /^([A-Ea-e1-5])\s*[.)）:：、\-]\s*(.{2,})$/u.exec(trimmed)
    const labelText = match ? match[1] : (shortMatch ? shortMatch[2] : '')
    if (labelText) {
      flushContinuation()
      const value = labelText.trim()
      if (value.length >= 2 && value.length <= 120 && !seen.has(value)) {
        seen.add(value)
        choices.push(value)
        if (choices.length >= 5) break
      }
      continue
    }
    // A continuation line (long narration after choice list) appends to last choice; capped.
    if (choices.length > 0 && choices.length < 6 && trimmed.length >= 4 && trimmed.length <= 160
      && /[，。！？、”"』）】]$/.test(trimmed) === false
      && pendingContinuation.join(' ').length + trimmed.length <= 160) {
      pendingContinuation.push(trimmed)
      continue
    }
    flushContinuation()
  }
  flushContinuation()
  return choices.slice(0, 5)
}

function splitAdventureNarration(text) {
  const raw = String(text == null ? '' : text).trim()
  if (!raw) return { narration: '', choices: [] }
  const lines = raw.split(/\r?\n/)
  // Find the first line that starts a choice block; everything before is narration.
  let choiceStart = -1
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    // Explicit choice-list headers also start the choice block.
    if (/^(?:可选行动|行动选项|你的选择|接下来你可以|请选择|选项如下|分支选项)\s*[:：]?$/.test(trimmed)) { choiceStart = i + 1; break }
    const isBullet = /^(?:(?:选项|选择|可选行动|行动选项)?\s*[A-Ea-e1-51-5]\s*[:：.)、\-]|[-*•・]\s+|【(?:选项|选择|行动)\s*[A-Ea-e1-5]?\s*】)/.test(trimmed)
      || /^[A-Ea-e1-5]\s*[.)）:：、\-]\s*.{2,}$/u.test(trimmed)
    if (isBullet) { choiceStart = i; break }
  }
  if (choiceStart < 0) {
    // Fallback: trailing choice-like lines at the end still count.
    const choices = parseAdventureChoices(raw)
    return { narration: raw, choices }
  }
  const narration = lines.slice(0, choiceStart).join('\n').replace(/\s+$/u, '')
  const choices = parseAdventureChoices(lines.slice(choiceStart).join('\n'))
  return { narration: narration.trim() || raw, choices }
}

function buildMuseSystem(context, mode, opts = {}) {
  const lines = []
  if (mode === 'adventure') {
    lines.push('你是 DSH Creative Suite 的 MuseAI 冒险叙事引擎（GM / 游戏主持人）。当前为冒险模式：以 GM 口吻推动剧情、描写环境与 NPC 行动、裁决玩家行动结果，并在每轮结尾给出 3-5 个编号候选行动供玩家选择。')
    lines.push('GM 结构要求：【旁白】推进剧情与环境描写；【角色】用多角色口吻演出（主角卡 + 同伴卡），每个出场角色用「角色名：台词/动作」分行；【选项】结尾固定输出候选行动编号列表。')
  } else if (mode === 'tavern') {
    lines.push('你是 DSH Creative Suite 的 Tavern 角色扮演引擎。当前为酒馆模式：以 ST 人物卡身份与玩家对话，保持性格、场景与关系一致，沉浸式演出。')
  } else {
    lines.push('你是 DSH Creative Suite 的 MuseAI 角色陪伴引擎。当前为聊天模式：以角色身份自然对话，保持长期关系与性格一致。')
  }
  if (context.card) {
    const card = context.card
    lines.push('')
    lines.push(mode === 'adventure' ? `主角卡：${card.name}` : `角色名：${card.name}`)
    if (card.description) lines.push(`角色设定：${card.description.slice(0, 2400)}`)
    if (card.personality) lines.push(`性格：${card.personality.slice(0, 1200)}`)
    if (card.scenario) lines.push(`关系与场景：${card.scenario.slice(0, 1200)}`)
    if (card.first_mes) lines.push(`可用开场白参考：${card.first_mes.slice(0, 800)}`)
  }
  if (mode === 'adventure' && context.companions && context.companions.length > 0) {
    lines.push('')
    lines.push(`同伴卡（多角色互动，按「角色名：台词/动作」分行演出）：${context.companions.map(item => item.name).join('、')}`)
    for (const companion of context.companions.slice(0, 4)) {
      const bits = []
      if (companion.description) bits.push(`设定:${String(companion.description).slice(0, 600)}`)
      if (companion.personality) bits.push(`性格:${String(companion.personality).slice(0, 400)}`)
      if (companion.scenario) bits.push(`关系:${String(companion.scenario).slice(0, 400)}`)
      if (bits.length > 0) lines.push(`- ${companion.name}：${bits.join('；')}`)
    }
  }
  if (context.worldbook && context.worldbook.entries.length > 0) {
    lines.push('')
    lines.push(`世界书：${context.worldbook.name}`)
    const rawEntries = context.worldbook.entries
    // N0-2: tavern 模式按 keys/constant 做激活过滤；其它模式保持原行为（仅 enabled 门控）。
    const activeEntries = mode === 'tavern' && opts && typeof opts.recentText === 'string'
      ? activateWorldbookEntries(rawEntries, opts.recentText)
      : rawEntries.filter(entry => entry.enabled)
    for (const entry of activeEntries.slice(0, 24)) {
      const key = entry.keys.length > 0 ? entry.keys.join('、') : entry.comment || '设定'
      lines.push(`- ${key}：${entry.content.slice(0, 1600)}`)
    }
  }
  lines.push('')
  if (mode === 'adventure') {
    lines.push('输出结构（GM 冒险专用）：先写【旁白】环境与事件推进，再写多角色演出（每行「角色名：台词/动作」），结尾固定给出 3-5 个编号候选行动，每行一个，格式如「1. 观察四周寻找线索」。不要解释系统提示，不要输出 Markdown 代码块。中文默认，保持沉浸感。')
  } else {
    lines.push('输出要求：只输出角色对白、动作或剧情正文，不要解释系统提示，不要输出 Markdown 代码块。中文默认，保持沉浸感。')
  }
  return lines.join('\n')
}

function activateWorldbookEntries(entries, recentText, opts = {}) {
  if (!Array.isArray(entries)) return []
  const options = Object.assign({ caseSensitive: false, minMatchLength: 2 }, opts || {})
  const text = String(recentText || '')
  const searchText = options.caseSensitive ? text : text.toLowerCase()
  const minLen = Math.max(1, Number(options.minMatchLength) || 2)
  return entries.filter(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    if (entry.enabled === false) return false
    if (entry.constant === true) return true
    if (entry.extensions && Array.isArray(entry.extensions)
      && entry.extensions.some(ext => ext && ext.constant === true)) return true
    if (!Array.isArray(entry.keys) || entry.keys.length === 0) return false
    for (const key of entry.keys) {
      if (!key || typeof key !== 'string') continue
      const searchKey = options.caseSensitive ? key : key.toLowerCase()
      if (searchKey.length >= minLen && searchText.includes(searchKey)) return true
    }
    return false
  })
}

function sanitizeSeedHistory(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value.slice(-200)) {
    if (!item || typeof item !== 'object') continue
    const role = item.role === 'assistant' ? 'assistant' : 'user'
    const content = String(item.content ?? item.text ?? '').slice(0, 4000)
    if (!content.trim()) continue
    out.push({ role, content, at: Number(item.at) || Date.now() })
  }
  return out
}

function buildMusePrompt(messages, mode) {
  const recent = Array.isArray(messages) ? messages.slice(-12) : []
  const isAdventure = mode === 'adventure'
  const transcript = recent.map(message => `${message.role === 'user' ? '玩家' : (isAdventure ? 'GM' : '角色')}：${String(message.content || '').trim()}`).filter(Boolean).join('\n\n')
  if (isAdventure) return transcript + '\n\n请以 GM 身份裁决上文最后一句玩家行动：先旁白推进，再多角色演出，最后给出 3-5 个编号候选行动。'
  return transcript + '\n\n请以上文最后一句玩家发言为输入，继续回复。'
}

function createMuseSession(store, body) {
  const input = body && typeof body === 'object' ? body : {}
  const now = Date.now()
  const mode = input.mode === 'adventure' ? 'adventure' : 'chat'
  const cardId = input.cardId ? String(input.cardId) : ''
  const card = cardId ? store.data.resources.cards[cardId] : null
  const worldbookId = input.worldbookId
    ? String(input.worldbookId)
    : card && card.data && Array.isArray(card.data.worldbookIds) && card.data.worldbookIds[0]
      ? String(card.data.worldbookIds[0])
      : ''
  const id = randomUUID()
  const record = {
    id,
    kind: 'sessions',
    name: String(input.name || (card ? card.name + (mode === 'adventure' ? ' · 冒险' : ' · 聊天') : 'MuseAI 会话')).trim(),
    source: 'museai',
    version: 1,
    createdAt: now,
    updatedAt: now,
    data: {
      mode,
      cardId: card ? card.id : cardId || null,
      companionIds: mode === 'adventure' ? normalizeMuseIdList(input.companionIds || input.castIds || input.extraCardIds).filter(id => id && id !== (card ? card.id : cardId)) : [],
      worldbookId: worldbookId || null,
      storyProjectId: input.storyProjectId ? String(input.storyProjectId) : null,
      messages: sanitizeSeedHistory(input.history || input.messages || input.seedMessages),
      model: null
    }
  }
  store.data.resources.sessions[id] = record
  return record
}

function summarizeMuseSession(record) {
  if (!record) return null
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    source: record.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    mode: record.data && record.data.mode || 'chat',
    cardId: record.data && record.data.cardId || null,
    companionIds: Array.isArray(record.data && record.data.companionIds) ? record.data.companionIds : [],
    worldbookId: record.data && record.data.worldbookId || null,
    storyProjectId: record.data && record.data.storyProjectId || null,
    messageCount: record.data && Array.isArray(record.data.messages) ? record.data.messages.length : 0,
    model: record.data && record.data.model || null,
    lastError: record.data && record.data.lastError || null
  }
}

function museBonds(store) {
  const cards = resourceList(store, 'cards').map(card => ({
    ...resourceBrief(card),
    description: String((card.data && card.data.normalized && card.data.normalized.description) || '').slice(0, 240)
  }))
  const relationships = []
  const hooks = []
  const summaries = []
  for (const summary of resourceList(store, 'summaries')) {
    const feedback = summary.data && summary.data.feedback ? summary.data.feedback : {}
    const summaryText = String(feedback.summary || summary.data && summary.data.summary || '').slice(0, 500)
    const sessionId = String((summary.data && summary.data.sessionId) || (summary.lineage && summary.lineage.sessionId) || '')
    const sessionLink = sessionId ? `/plugins/creative-suite/museai/sessions/${encodeURIComponent(sessionId)}` : null
    const entry = { id: summary.id, name: summary.name, summary: summaryText, updatedAt: summary.updatedAt, createdAt: summary.createdAt, sessionId: sessionId || null, sessionLink }
    summaries.push(entry)
    for (const item of Array.isArray(feedback.relationshipChanges) ? feedback.relationshipChanges : []) {
      if (typeof item === 'string' && item.trim()) relationships.push({ summaryId: summary.id, sessionId: entry.sessionId, sessionLink, text: item.trim(), at: summary.updatedAt })
      else if (item && typeof item === 'object') relationships.push({ summaryId: summary.id, sessionId: entry.sessionId, sessionLink, text: String(item.summary || item.change || item.description || JSON.stringify(item)).slice(0, 500), at: summary.updatedAt })
    }
    for (const item of Array.isArray(feedback.unresolvedHooks) ? feedback.unresolvedHooks : []) {
      const text = typeof item === 'string' ? item.trim() : item && typeof item === 'object' ? String(item.summary || item.title || JSON.stringify(item)) : ''
      if (text) hooks.push({ summaryId: summary.id, sessionId: entry.sessionId, sessionLink, text: text.slice(0, 500), at: summary.updatedAt })
    }
  }
  const byTime = (left, right) => (Number(right.at || right.updatedAt || 0) - Number(left.at || left.updatedAt || 0))
  relationships.sort(byTime)
  hooks.sort(byTime)
  return { cards, relationships, hooks, summaries }
}

export async function apply(ctx, config = {}) {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const store = await openFileStore(dshHome)
  ctx.logger.info('creative-suite: host row mounted; store=%s', store.file)
  ctx.provide('creativeSuiteStore', store)

  ctx.inject(['skills'], skillCtx => {
    const disposers = CREATIVE_SKILLS.map(skill => skillCtx.skills.register(skill))
    skillCtx.effect(() => () => {
      for (const dispose of disposers) dispose()
    }, 'creative-suite: story skills')
  })

  ctx.inject(['subagents'], subagentCtx => {
    if (!subagentCtx.subagents || typeof subagentCtx.subagents.register !== 'function') {
      ctx.logger.info('creative-suite: host does not provide subagents service, role bridge skipped')
      return
    }
    const disposers = CREATIVE_ROLES.map(role => subagentCtx.subagents.register({
      id: 'creative-' + role.id,
      name: role.name,
      system: role.system
    }))
    subagentCtx.effect(() => () => {
      for (const dispose of disposers) {
        try { dispose() } catch (_error) {}
      }
    }, 'creative-suite: story role bridge')
  })

  ctx.inject(['tools'], toolCtx => {
    if (!toolCtx.tools || typeof toolCtx.tools.register !== 'function') {
      ctx.logger.info('creative-suite: host does not provide tools service, tool bridge skipped')
      return
    }
    const disposers = CREATIVE_TOOLS.map(tool => toolCtx.tools.register({
      name: 'creative-story-' + tool.name,
      description: tool.description
    }))
    toolCtx.effect(() => () => {
      for (const dispose of disposers) {
        try { dispose() } catch (_error) {}
      }
    }, 'creative-suite: story tool bridge')
  })

  ctx.effect(() => {
    ctx.logger.info('creative-suite: host row active')
    return () => ctx.logger.info('creative-suite: host row disposed')
  }, 'creative-suite: host row lifecycle')

  ctx.inject(['webServer', 'llm', 'agentDefaultModel'], routeCtx => {
    routeCtx.effect(() => routeCtx.webServer.register({
      kind: 'prefix',
      path: '/plugins/creative-suite',
      handler: async (req, res) => {
        const pathname = routePath(req)
        try {
          if (req.method === 'GET' && pathname === '/plugins/creative-suite/skills') {
            const skills = ctx.get('skills')
            const list = skills && typeof skills.list === 'function' ? await skills.list({}) : null
            sendJson(res, 200, { ok: true, skills: list ? (list.skills || list) : CREATIVE_SKILLS.map(skill => ({ name: skill.name, description: skill.description, whenToUse: skill.whenToUse })) })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/story/roles') {
            sendJson(res, 200, { ok: true, roles: CREATIVE_ROLES.map(role => ({ id: role.id, name: role.name })) })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/story/tools') {
            sendJson(res, 200, { ok: true, tools: CREATIVE_TOOLS })
            return
          }

          const storyRoleRunMatch = /^\/plugins\/creative-suite\/story\/roles\/([^/]+)\/run$/.exec(pathname)
          if (req.method === 'POST' && storyRoleRunMatch) {
            const body = await readJsonBody(req, 4 * 1024 * 1024)
            const role = CREATIVE_ROLES.find(item => item.id === storyRoleRunMatch[1])
            if (!role) throw new Error('未知 Story 角色')
            const source = body.projectId ? await readStoryProjectSource(dshHome, body.projectId, 14000) : String(body.text || '')
            if (!source.trim()) throw new Error('缺少项目文本或 text')
            const result = await generateTextWithRetry(routeCtx, {
              maxTokens: Math.max(800, Math.min(5000, Number(body.maxTokens) || 2200)),
              system: role.system,
              prompt: `${String(body.instruction || '请基于以下项目资料继续创作。')}\n\n资料：\n${source}`
            }, Number(body.attempts) || 2)
            sendJson(res, 200, { ok: true, role: role.id, name: role.name, text: result.text, model: result.model, attempts: result.attempts || 1 })
            return
          }

          const storyToolRunMatch = /^\/plugins\/creative-suite\/story\/tools\/([^/]+)\/run$/.exec(pathname)
          if (req.method === 'POST' && storyToolRunMatch) {
            const body = await readJsonBody(req, 4 * 1024 * 1024)
            const name = decodeURIComponent(storyToolRunMatch[1])
            const projectId = String(body.projectId || '').trim()
            if (name === 'list_files') {
              const projectRoot = path.join(storyProjectsRoot(dshHome), safeStoryId(projectId))
              const files = await walkStoryFiles(projectRoot)
              sendJson(res, 200, { ok: true, tool: name, files })
              return
            }
            if (name === 'read_project') {
              const text = await readStoryProjectSource(dshHome, projectId, Number(body.maxChars) || 14000)
              sendJson(res, 200, { ok: true, tool: name, text })
              return
            }
            if (name === 'write_file') {
              const projectRoot = path.join(storyProjectsRoot(dshHome), safeStoryId(projectId))
              const relative = String(body.path || '')
              if (isProtectedProjectFile(relative)) throw new Error('不能覆盖项目元数据文件')
              const file = safeProjectPath(projectRoot, relative)
              await mkdir(path.dirname(file), { recursive: true })
              await writeFile(file, String(body.text || ''), 'utf8')
              sendJson(res, 200, { ok: true, tool: name, projectId, path: relative, bytes: Buffer.byteLength(String(body.text || '')) })
              return
            }
            const kinds = { generate_outline: 'outline', generate_chapter: 'chapter', generate_drama: 'drama', generate_game: 'game', generate_video: 'video' }
            const kind = kinds[name]
            if (!kind) throw new Error('未知 Story 工具: ' + name)
            const result = await generateStoryWorkbench(routeCtx, dshHome, store, projectId, Object.assign({}, body, { kind }))
            sendJson(res, 200, { ok: true, tool: name, ...result })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/status') {
            sendJson(res, 200, {
              ok: true,
              name: 'DSH Creative Suite POC',
              version: '0.17.1',
              storageDomain: STORAGE_DOMAIN,
              modes: ['coding', 'tavern', 'museai', 'story'],
              store: { file: store.file, resources: resourceSummary(store) }
            })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/models') {
            sendJson(res, 200, { ok: true, ...(await modelCatalog(routeCtx)) })
            return
          }

          if (req.method === 'GET' && pathname.startsWith('/plugins/creative-suite/regex/scripts/')) {
            const presetId = decodeURIComponent(pathname.slice('/plugins/creative-suite/regex/scripts/'.length))
            const preset = store.data.resources.presets[presetId]
            if (!preset) { sendJson(res, 404, { ok: false, error: 'preset not found' }); return }
            sendJson(res, 200, { ok: true, presetId, scripts: extractRegexScriptsFromPreset(preset) })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/regex/apply') {
            const body = await readJsonBody(req, 4 * 1024 * 1024)
            const text = String(body.text || '')
            let scripts = Array.isArray(body.scripts) ? body.scripts : null
            if (!scripts && body.presetId) {
              const preset = store.data.resources.presets[String(body.presetId)]
              if (!preset) throw new Error('preset not found')
              scripts = extractRegexScriptsFromPreset(preset)
            }
            const result = applyRegexScripts(scripts || [], text, { placement: body.placement, forDisplay: body.forDisplay })
            sendJson(res, 200, { ok: true, ...result })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/import/card') {
            const body = await readJsonBody(req, 8 * 1024 * 1024)
            const { normalized, raw, name } = normalizeStCardInput(body)
            const id = String(body.id || randomUUID())
            const now = Date.now()
            
            // Materialize inline character_book into a real worldbooks resource
            let worldbookIds = []
            if (normalized.character_book && typeof normalized.character_book === 'object') {
              const cb = normalized.character_book
              const bookEntries = Array.isArray(cb.entries)
                ? cb.entries
                : cb.entries && typeof cb.entries === 'object'
                  ? Object.values(cb.entries)
                  : []
              const wbId = randomUUID()
              const wbRecord = {
                id: wbId,
                kind: 'worldbooks',
                name: cb.name || 'Imported Character Book',
                source: 'imported-from-card',
                version: 1,
                createdAt: now,
                updatedAt: now,
                lineage: { derivedFrom: [{ kind: 'cards', id: id }], derivation: 'imported-character-book' },
                data: {
                  format: 'sillytavern-worldbook',
                  entryCount: bookEntries.length,
                  normalized: { 
                    name: cb.name || 'Imported Character Book', 
                    entryCount: bookEntries.length, 
                    entries: bookEntries 
                  },
                  raw: cb
                }
              }
              store.data.resources.worldbooks[wbId] = wbRecord
              worldbookIds = [wbId]
            }
            
            const record = {
              id,
              kind: 'cards',
              name,
              source: 'sillytavern-json',
              version: 1,
              createdAt: now,
              updatedAt: now,
              data: {
                format: 'sillytavern-json',
                normalized,
                raw,
                worldbookIds
              }
            }
            store.data.resources.cards[id] = record
            await store.save()
            sendJson(res, 200, { ok: true, resource: record })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/import/worldbook') {
            const body = await readJsonBody(req, 8 * 1024 * 1024)
            const { normalized, raw, name } = normalizeWorldbookInput(body)
            const id = String(body.id || randomUUID())
            const now = Date.now()
            const record = {
              id,
              kind: 'worldbooks',
              name,
              source: 'sillytavern-json',
              version: 1,
              createdAt: now,
              updatedAt: now,
              lineage: {
                derivedFrom: Array.isArray(body.lineage?.derivedFrom) ? body.lineage.derivedFrom : [],
                derivation: 'imported-worldbook'
              },
              data: {
                format: 'sillytavern-worldbook',
                entryCount: normalized.entryCount,
                normalized,
                raw
              }
            }
            store.data.resources.worldbooks[id] = record
            await store.save()
            sendJson(res, 200, { ok: true, resource: record })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/import/preset') {
            const body = await readJsonBody(req, 8 * 1024 * 1024)
            const { normalized, raw, name } = normalizePresetInput(body)
            const id = String(body.id || randomUUID())
            const now = Date.now()
            const record = {
              id,
              kind: 'presets',
              name,
              source: 'sillytavern-preset-json',
              version: 1,
              createdAt: now,
              updatedAt: now,
              data: {
                format: 'sillytavern-preset-json',
                promptCount: normalized.promptCount,
                enabledPromptCount: normalized.enabledPromptCount,
                regexCount: normalized.regexCount,
                enabledRegexCount: normalized.enabledRegexCount,
                normalized,
                raw
              }
            }
            store.data.resources.presets[id] = record
            await store.save()
            sendJson(res, 200, { ok: true, resource: record })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/import/card-png') {
            const buffer = await readBufferBody(req, 16 * 1024 * 1024)
            let cardValue
            let name = '未命名人物卡'
            let pngBytes = buffer
            if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
              cardValue = parsePngCard(buffer)
            } else {
              let body
              try { body = JSON.parse(buffer.toString('utf8')) } catch (error) { throw new Error('PNG 请求不是有效的 PNG 或 JSON') }
              name = String(body.name || name)
              if (typeof body.fileB64 === 'string') pngBytes = Buffer.from(body.fileB64.replace(/\s+/g, ''), 'base64')
              if (body.card !== undefined) cardValue = body.card
              else cardValue = parsePngCard(pngBytes)
            }
            const normalizedInput = normalizeStCardInput({ card: cardValue, name })
            const id = String((buffer.length >= 8 ? randomUUID() : JSON.parse(buffer.toString('utf8')).id) || randomUUID())
            const now = Date.now()
            const record = {
              id,
              kind: 'cards',
              name: normalizedInput.name,
              source: 'sillytavern-png',
              version: 1,
              createdAt: now,
              updatedAt: now,
              data: {
                format: 'sillytavern-png',
                normalized: normalizedInput.normalized,
                raw: normalizedInput.raw,
                pngBytes: pngBytes.length
              }
            }
            store.data.resources.cards[id] = record
            await store.save()
            sendJson(res, 200, { ok: true, resource: record })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/import/novel') {
            const body = await readJsonBody(req, 16 * 1024 * 1024)
            const normalized = normalizeNovelInput(body)
            const id = String(body.id || randomUUID())
            const now = Date.now()
            const record = {
              id,
              kind: 'novels',
              name: normalized.name,
              source: 'novel-text',
              version: 1,
              createdAt: now,
              updatedAt: now,
              data: {
                format: 'novel-text',
                charCount: normalized.charCount,
                lineCount: normalized.lineCount,
                chapterCount: normalized.chapterCount,
                chapters: normalized.chapters,
                characters: normalized.characters
              }
            }
            store.data.resources.novels[id] = record
            await store.save()
            sendJson(res, 200, { ok: true, resource: record })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/generate/worldbook') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const source = String(body.text || '').slice(0, 12000)
            const result = await generateJson(routeCtx, {
              maxTokens: 3000,
              system: '你是网文设定提取器。只输出严格 JSON，不要解释，不要 Markdown 代码围栏。',
              prompt: `从下面的小说片段中提取世界书条目。\n输出格式：{"name":"世界书名","entries":[{"keys":["触发词"],"content":"设定内容","comment":"条目标题","enabled":true}]}\n小说片段：\n${source}`
            })
            sendJson(res, 200, { ok: true, model: result.model, worldbook: result.value, rawText: result.rawText })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/generate/characters') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const source = String(body.text || '').slice(0, 12000)
            const result = await generateJson(routeCtx, {
              maxTokens: 4000,
              system: '你是网文角色提取器。只输出严格 JSON，不要解释，不要 Markdown 代码围栏。',
              prompt: `从下面的小说片段中提取主要角色。\n输出格式：{"characters":[{"name":"角色名","description":"外貌与身份","personality":"性格","scenario":"与主角关系","first_mes":"一句可用的开场白","mes_example":"<START>\\n{{user}}: ...\\n{{char}}: ...","tags":["标签"],"speechStyle":"说话风格"}]}\n小说片段：\n${source}`
            })
            sendJson(res, 200, { ok: true, model: result.model, characters: result.value.characters || [], rawText: result.rawText })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/generate/card') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const character = body.character || body
            
            // Resolve worldbookId from body and copy entries into character_book
            let worldbookIds = []
            let character_book = null
            let worldbookRecord = null
            if (body.worldbookId) {
              worldbookRecord = store.data.resources.worldbooks[String(body.worldbookId)] || null
              if (worldbookRecord) {
                worldbookIds = [String(worldbookRecord.id)]
                character_book = { name: worldbookRecord.name, description: '', entries: worldbookEntriesFromRaw(worldbookRecord.data && worldbookRecord.data.raw) }
              }
            }
            
            const raw = buildStCard(character, { name: body.name, source: body.source || 'character-json', character_book })
            const normalized = unwrapStCard(raw, body.name)
            const resourceId = String(body.id || randomUUID())
            const now = Date.now()
            const record = {
              id: resourceId,
              kind: 'cards',
              name: normalized.name,
              source: 'generated-from-character',
              version: 1,
              createdAt: now,
              updatedAt: now,
              lineage: {
                derivedFrom: [],
                derivation: 'character-to-card',
                generatedAt: now
              },
              data: {
                format: 'sillytavern-json',
                normalized,
                raw,
                worldbookIds
              }
            }
            if (body.characterResourceId) {
              record.lineage.derivedFrom.push({ kind: 'novels', id: String(body.characterResourceId) })
            }
            if (worldbookRecord) {
              record.lineage.derivedFrom.push({ kind: 'worldbooks', id: String(worldbookRecord.id) })
            }
            store.data.resources.cards[resourceId] = record
            await store.save()
            sendJson(res, 200, { ok: true, resource: record })
            return
          }

          const exportCardMatch = /^\/plugins\/creative-suite\/export\/card\/([^/]+)$/.exec(pathname)
          if (req.method === 'GET' && exportCardMatch) {
            const card = store.data.resources.cards[exportCardMatch[1]]
            if (!card) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            const raw = card.data && card.data.raw && typeof card.data.raw === 'object' ? card.data.raw : null
            if (!raw) { sendJson(res, 400, { ok: false, error: 'card has no raw st data' }); return }
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="card-${card.id}.json"` })
            res.end(JSON.stringify(raw, null, 2))
            return
          }

          const validateCardMatch = /^\/plugins\/creative-suite\/validate\/card\/([^/]+)$/.exec(pathname)
          if (req.method === 'GET' && validateCardMatch) {
            const card = store.data.resources.cards[validateCardMatch[1]]
            if (!card) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            const validation = validateStCardValue(card.data && card.data.raw)
            sendJson(res, 200, { ok: true, validation })
            return
          }

          const cardUpdateMatch = /^\/plugins\/creative-suite\/card\/([^/]+)$/.exec(pathname)
          if ((req.method === 'PUT' || req.method === 'POST') && cardUpdateMatch) {
            const card = store.data.resources.cards[cardUpdateMatch[1]]
            if (!card) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            const body = await readJsonBody(req, 4 * 1024 * 1024)
            const fields = normalizeCardUpdateFields(body)
            if (Object.keys(fields).length === 0) throw new Error('没有可更新的字段')
            const nextRaw = applyCardFieldsToRaw(card.data && card.data.raw, fields)
            const normalized = unwrapStCard(nextRaw, fields.name || card.name)
            card.name = normalized.name
            card.data = Object.assign({}, card.data, { raw: nextRaw, normalized })
            card.updatedAt = Date.now()
            await store.save()
            sendJson(res, 200, { ok: true, resource: card, validation: validateStCardValue(nextRaw) })
            return
          }

          const cardRuntimeMatch = /^\/plugins\/creative-suite\/card\/([^/]+)\/runtime$/.exec(pathname)
          if (req.method === 'GET' && cardRuntimeMatch) {
            const card = store.data.resources.cards[cardRuntimeMatch[1]]
            if (!card) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            const runtime = inspectCardRuntime(card.data && card.data.raw)
            sendJson(res, 200, { ok: true, cardId: card.id, runtime })
            return
          }

          const cardTemplateMatch = /^\/plugins\/creative-suite\/card\/([^/]+)\/template$/.exec(pathname)
          if (req.method === 'GET' && cardTemplateMatch) {
            const card = store.data.resources.cards[cardTemplateMatch[1]]
            if (!card) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            sendJson(res, 200, { ok: true, cardId: card.id, templates: listCardTemplates(card.data && card.data.raw), browser: templateBrowserStatus() })
            return
          }

          const cardRenderMatch = /^\/plugins\/creative-suite\/card\/([^/]+)\/render$/.exec(pathname)
          if (req.method === 'POST' && cardRenderMatch) {
            const card = store.data.resources.cards[cardRenderMatch[1]]
            if (!card) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            try {
              const result = await renderCardTemplate({
                rawCard: card.data && card.data.raw,
                variables: body.variables || {},
                messages: Array.isArray(body.messages) ? body.messages : [],
                cardName: body.cardName || card.name || '',
                userName: body.userName || '你',
                templateIndex: body.templateIndex || 0,
                timeoutMs: Math.max(1000, Math.min(60000, Number(body.timeoutMs) || 15000))
              })
              sendJson(res, 200, { ok: true, cardId: card.id, ...result })
            } catch (error) {
              if (error && error.code === 'NO_TEMPLATE') { sendJson(res, 400, { ok: false, error: error.message }); return }
              throw error
            }
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/helper/runtime') {
            sendJson(res, 200, { ok: true, count: helperRuntimeCount() })
            return
          }

          if (req.method === 'DELETE' && pathname.startsWith('/plugins/creative-suite/helper/runtime/')) {
            const id = pathname.substring('/plugins/creative-suite/helper/runtime/'.length);
            if (id) {
              const success = deleteHelperRuntime(id);
              if (success) {
                sendJson(res, 200, { ok: true, message: `Helper runtime ${id} deleted` });
              } else {
                sendJson(res, 404, { ok: false, error: `Helper runtime not found: ${id}` });
              }
            } else {
              sendJson(res, 400, { ok: false, error: 'Missing runtime ID' });
            }
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/helper/runtime/start') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const cardId = String(body.cardId || '').trim()
            const sharedCard = cardId ? store.data.resources.cards[cardId] : null
            let rawCard = sharedCard && sharedCard.data ? sharedCard.data.raw : null
            if (!rawCard && body.sourceCard) {
              const sourceCard = String(body.sourceCard || '').replace(/^cards\//, '').trim()
              if (!sourceCard || /[/\\]/.test(sourceCard)) throw new Error('sourceCard 必须是 Tavern 卡文件名')
              const cardFile = path.join(dshHome, 'profile-data', 'tavern', 'data', 'resources', 'cards', sourceCard)
              rawCard = JSON.parse(await readFile(cardFile, 'utf8'))
            }
            if (!rawCard && body.rawCard && typeof body.rawCard === 'object') rawCard = body.rawCard
            if (!rawCard) throw new Error('card not found')
            let messages = Array.isArray(body.messages) ? body.messages : []
            let tavernChat = null
            const sessionId = String(body.sessionId || '').trim()
            if (sessionId) {
              try {
                const state = await tavernGameplayRequest(dshHome, 'state', { sessionId })
                tavernChat = state && state.chat ? state.chat : null
                if (messages.length === 0 && tavernChat && Array.isArray(tavernChat.messages)) messages = tavernChat.messages
              } catch (_error) {}
            }
            const runtime = createHelperRuntime({
              cardId: cardId || 'tavern:' + String(body.sourceCard || ''),
              rawCard,
              variables: body.variables,
              messages,
              sessionId,
              chatId: tavernChat && tavernChat.id || body.chatId || '',
              cardName: tavernChat && tavernChat.cardName || sharedCard && sharedCard.name || body.cardName || '',
              userName: tavernChat && tavernChat.macroState && tavernChat.macroState.userName || body.userName || '你',
              extensionSettings: body.extensionSettings,
              worldbook: body.worldbook
            })
            sendJson(res, 200, { ok: true, runtime: runtime.snapshot() })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/helper/runtime/tool') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const runtime = getHelperRuntime(body.runtimeId)
            if (!runtime) throw new Error('helper runtime not found')
            const result = await runtime.callTool(body.name, body.args || {})
            sendJson(res, 200, { ok: true, result, runtime: runtime.snapshot() })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/helper/runtime/event') {
            const body = await readJsonBody(req, 4 * 1024 * 1024)
            const runtime = getHelperRuntime(body.runtimeId)
            if (!runtime) throw new Error('helper runtime not found')
            const snapshot = await runtime.emit(body.event, body.payload || {})
            sendJson(res, 200, { ok: true, runtime: snapshot })
            return
          }

          const helperRuntimeFromTavernMatch = /^\/plugins\/creative-suite\/helper\/runtime\/([^/]+)\/from-tavern$/.exec(pathname)
          if (req.method === 'POST' && helperRuntimeFromTavernMatch) {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const runtime = getHelperRuntime(decodeURIComponent(helperRuntimeFromTavernMatch[1]))
            if (!runtime) throw new Error('helper runtime not found')
            const sessionId = String(body.sessionId || runtime.sessionId || '').trim()
            if (!sessionId) throw new Error('from-tavern 需要 sessionId')
            const state = await tavernGameplayRequest(dshHome, 'state', { sessionId })
            const chat = state && state.chat ? state.chat : null
            if (!chat) throw new Error('Tavern 会话不存在')
            runtime.sessionId = sessionId
            runtime.chatId = String(chat.id || sessionId)
            runtime.cardName = String(chat.cardName || runtime.cardName || '')
            runtime.userName = String(chat.macroState && chat.macroState.userName || runtime.userName || '你')
            runtime.messages = JSON.parse(JSON.stringify(Array.isArray(chat.messages) ? chat.messages : []))
            runtime.variables = JSON.parse(JSON.stringify(chat.variables && typeof chat.variables === 'object' ? chat.variables : {}))
            runtime.updatedAt = Date.now()
            sendJson(res, 200, { ok: true, runtime: runtime.snapshot() })
            return
          }

          const helperRuntimeSyncMatch = /^\/plugins\/creative-suite\/helper\/runtime\/([^/]+)\/sync$/.exec(pathname)
          if (req.method === 'POST' && helperRuntimeSyncMatch) {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const runtime = getHelperRuntime(decodeURIComponent(helperRuntimeSyncMatch[1]))
            if (!runtime) throw new Error('helper runtime not found')
            const sessionId = String(body.sessionId || runtime.sessionId || '').trim()
            if (!sessionId) throw new Error('sync 需要 sessionId')
            await ensureTavernSessionPatch(dshHome)
            const result = { sessionId, variables: null, prompts: null, messagesUpdated: null, messagesCreated: null }
            result.variables = await tavernRpcRequest(dshHome, 'updateTavernHelperVariables', {
              sessionId,
              option: { type: 'chat' },
              variables: runtime.variables || {}
            })
            if (Array.isArray(runtime.injections) && runtime.injections.length > 0) {
              const prompts = runtime.injections.map(item => ({
                id: String(item.id || 'prompt-' + Math.random().toString(36).slice(2)),
                content: String(item.prompt || ''),
                position: item.options && item.options.position === 'none' ? 'none' : 'in_chat',
                role: item.options && ['system', 'user', 'assistant'].includes(item.options.role) ? item.options.role : 'system',
                depth: item.options && Number.isSafeInteger(Number(item.options.depth)) ? Number(item.options.depth) : 0
              })).filter(item => item.id && item.content.trim() !== '')
              if (prompts.length > 0) {
                result.prompts = await tavernRpcRequest(dshHome, 'updateTavernHelperPrompts', { sessionId, operation: { kind: 'inject', prompts } })
              }
            }
            const state = await tavernGameplayRequest(dshHome, 'state', { sessionId })
            const currentMessages = state && state.chat && Array.isArray(state.chat.messages) ? state.chat.messages : []
            const runtimeMessages = Array.isArray(runtime.messages) ? runtime.messages : []
            const textOf = message => String(message && (message.message !== undefined ? message.message : (message.text !== undefined ? message.text : message.content)) || '')
            const patches = []
            for (let index = 0; index < Math.min(currentMessages.length, runtimeMessages.length); index += 1) {
              const nextText = textOf(runtimeMessages[index])
              const currentText = textOf(currentMessages[index])
              if (nextText !== currentText) patches.push({ message_id: index, message: nextText })
            }
            if (patches.length > 0) {
              result.messagesUpdated = await tavernRpcRequest(dshHome, 'updateTavernHelperMessages', { sessionId, messages: patches })
            }
            if (runtimeMessages.length > currentMessages.length) {
              const newMessages = runtimeMessages.slice(currentMessages.length).map(message => ({
                role: message && ['system', 'assistant', 'user'].includes(String(message.role)) ? String(message.role) : 'assistant',
                message: textOf(message),
                data: message && message.data && typeof message.data === 'object' ? message.data : {},
                name: message && message.name ? String(message.name) : undefined,
                is_hidden: message && message.isHidden === true
              })).filter(message => message.message.trim() !== '')
              if (newMessages.length > 0) {
                result.messagesCreated = await tavernRpcRequest(dshHome, 'createTavernHelperMessages', { sessionId, messages: newMessages, option: { insert_before: 'end' } })
              }
            }
            sendJson(res, 200, { ok: true, runtime: runtime.snapshot(), sync: result })
            return
          }

          const helperRuntimeLifecycleMatch = /^\/plugins\/creative-suite\/helper\/runtime\/([^/]+)\/(stop|unregister-tool|list-tools)$/.exec(pathname)
          if (req.method === 'POST' && helperRuntimeLifecycleMatch) {
            const runtimeId = decodeURIComponent(helperRuntimeLifecycleMatch[1])
            const action = helperRuntimeLifecycleMatch[2]
            const runtime = getHelperRuntime(runtimeId)
            if (!runtime) { sendJson(res, 404, { ok: false, error: 'helper runtime not found' }); return }
            if (action === 'stop') {
              const body = await readJsonBody(req, 2 * 1024 * 1024)
              const reason = (body && body.reason) ? String(body.reason) : 'stopped'
              const snapped = runtime.stop(reason)
              sendJson(res, 200, { ok: true, runtime: snapped })
              return
            }
            if (action === 'unregister-tool') {
              const body = await readJsonBody(req, 2 * 1024 * 1024)
              const toolName = String(body && body.toolName || '').trim()
              if (!toolName) { sendJson(res, 400, { ok: false, error: 'toolName required' }); return }
              const existed = runtime.unregisterTool(toolName)
              sendJson(res, 200, { ok: true, unregistered: existed, toolsUnregistered: runtime.toolsUnregistered.slice(-10) })
              return
            }
            if (action === 'list-tools') {
              const tools = runtime.listTools()
              sendJson(res, 200, { ok: true, tools, count: tools.length })
              return
            }
            sendJson(res, 405, { ok: false, error: 'method not allowed' })
            return
          }


          const helperRuntimeMatch = /^\/plugins\/creative-suite\/helper\/runtime\/([^/]+)$/.exec(pathname)
          if (helperRuntimeMatch) {
            const id = decodeURIComponent(helperRuntimeMatch[1])
            if (req.method === 'GET') {
              const runtime = getHelperRuntime(id)
              if (!runtime) { sendJson(res, 404, { ok: false, error: 'helper runtime not found' }); return }
              sendJson(res, 200, { ok: true, runtime: runtime.snapshot() })
              return
            }
          }

          const importTavernCardMatch = /^\/plugins\/creative-suite\/import\/tavern\/card\/([^/]+)$/.exec(pathname)
          if (req.method === 'POST' && importTavernCardMatch) {
            const card = store.data.resources.cards[importTavernCardMatch[1]]
            if (!card) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            const validation = validateStCardValue(card.data && card.data.raw)
            if (!validation.valid) {
              sendJson(res, 400, { ok: false, error: '人物卡未通过静态校验', validation })
              return
            }
            const imported = await importCardToTavern(dshHome, card)
            card.data.tavernCard = imported
            card.updatedAt = Date.now()
            await store.save()
            sendJson(res, 200, { ok: true, card, validation, tavern: imported })
            return
          }

          const lineageGraphMatch = /^\/plugins\/creative-suite\/lineage\/([^/]+)\/([^/]+)\/graph$/.exec(pathname)
          if (req.method === 'GET' && lineageGraphMatch) {
            const query = new URL(req.url || '/', 'http://x').searchParams
            const graph = lineageGraphFor(store, lineageGraphMatch[1], decodeURIComponent(lineageGraphMatch[2]), { maxDepth: query.get('maxDepth'), mode: query.get('mode') || 'full' })
            if (!graph) { sendJson(res, 404, { ok: false, error: 'resource not found' }); return }
            sendJson(res, 200, { ok: true, ...graph })
            return
          }

          const lineageMatch = /^\/plugins\/creative-suite\/lineage\/([^/]+)\/([^/]+)$/.exec(pathname)
          if (req.method === 'GET' && lineageMatch) {
            const lineage = lineageFor(store, lineageMatch[1], lineageMatch[2])
            if (!lineage) { sendJson(res, 404, { ok: false, error: 'resource not found' }); return }
            const query = new URL(req.url || '/', 'http://x').searchParams
            if (query.get('graph') === '1' || query.get('graph') === 'true') {
              const graph = lineageGraphFor(store, lineageMatch[1], decodeURIComponent(lineageMatch[2]), { maxDepth: query.get('maxDepth') })
              sendJson(res, 200, { ok: true, ...lineage, graph })
              return
            }
            sendJson(res, 200, { ok: true, ...lineage })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/pipeline/novel-to-card') {
            const body = await readJsonBody(req, 16 * 1024 * 1024)
            const novel = normalizeNovelInput(body)
            const now = Date.now()
            const storyProjectId = String(body.storyProjectId || '').trim()
            const storyProjectName = String(body.storyProjectName || body.name || '').trim()
            let storyRecord = null
            if (storyProjectId) {
              storyRecord = store.data.resources.stories[storyProjectId] || {
                id: storyProjectId,
                kind: 'stories',
                name: storyProjectName || storyProjectId,
                source: 'story-project',
                version: 1,
                createdAt: now,
                updatedAt: now,
                lineage: { derivedFrom: [], derivation: 'story-project' },
                data: { format: 'story-project', projectId: storyProjectId }
              }
              storyRecord.name = storyProjectName || storyRecord.name
              storyRecord.updatedAt = now
              store.data.resources.stories[storyProjectId] = storyRecord
            }
            const novelId = String(body.novelId || randomUUID())
            const maxCharacters = Math.max(1, Math.min(10, Number(body.maxCharacters) || 1))
            const shouldGenerateWorldbook = body.generateWorldbook !== false
            const shouldGenerateCharacters = body.generateCharacters !== false
            const shouldImportToTavern = body.importToTavern === true
            const novelRecord = {
              id: novelId,
              kind: 'novels',
              name: novel.name,
              source: 'novel-text',
              version: 1,
              createdAt: now,
              updatedAt: now,
              lineage: { derivedFrom: storyRecord ? [{ kind: 'stories', id: storyRecord.id }] : [], derivation: 'novel-import' },
              data: {
                format: 'novel-text',
                charCount: novel.charCount,
                lineCount: novel.lineCount,
                chapterCount: novel.chapterCount,
                chapters: novel.chapters,
                characters: novel.characters
              }
            }
            store.data.resources.novels[novelId] = novelRecord
            const sourceText = novel.text.slice(0, 12000)
            let worldbookRecord = null
            if (shouldGenerateWorldbook) {
              const generated = await generateJson(routeCtx, {
                maxTokens: 3000,
                system: '你是网文设定提取器。只输出严格 JSON，不要解释，不要 Markdown 代码围栏。',
                prompt: `从下面的小说片段中提取世界书条目。\n输出格式：{"name":"世界书名","entries":[{"keys":["触发词"],"content":"设定内容","comment":"条目标题","enabled":true}]}\n小说片段：\n${sourceText}`
              })
              const wb = generated.value && typeof generated.value === 'object' ? generated.value : {}
              const worldbookId = randomUUID()
              worldbookRecord = {
                id: worldbookId,
                kind: 'worldbooks',
                name: String(wb.name || novel.name + ' 世界书'),
                source: 'generated-from-novel',
                version: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lineage: { derivedFrom: [{ kind: 'novels', id: novelId }, ...(storyRecord ? [{ kind: 'stories', id: storyRecord.id }] : [])], derivation: 'llm-worldbook', model: generated.model },
                data: {
                  format: 'sillytavern-worldbook',
                  entryCount: Array.isArray(wb.entries) ? wb.entries.length : 0,
                  normalized: { name: String(wb.name || novel.name + ' 世界书'), entryCount: Array.isArray(wb.entries) ? wb.entries.length : 0, entries: Array.isArray(wb.entries) ? wb.entries : [] },
                  raw: wb
                }
              }
              store.data.resources.worldbooks[worldbookId] = worldbookRecord
            }
            const cards = []
            if (shouldGenerateCharacters) {
              const generated = await generateJson(routeCtx, {
                maxTokens: 4000,
                system: '你是网文角色提取器。只输出严格 JSON，不要解释，不要 Markdown 代码围栏。',
                prompt: `从下面的小说片段中提取主要角色。\n输出格式：{"characters":[{"name":"角色名","description":"外貌与身份","personality":"性格","scenario":"与主角关系","first_mes":"一句可用的开场白","mes_example":"<START>\\n{{user}}: ...\\n{{char}}: ...","tags":["标签"],"speechStyle":"说话风格"}]}\n小说片段：\n${sourceText}`
              })
              const list = generated.value && Array.isArray(generated.value.characters) ? generated.value.characters.slice(0, maxCharacters) : []
              for (const character of list) {
                const raw = buildStCard(character, {
                  name: character.name,
                  source: 'novel-pipeline',
                  character_book: worldbookRecord ? { name: worldbookRecord.name, description: '', entries: worldbookRecord.data.normalized.entries } : null
                })
                const normalized = unwrapStCard(raw, character.name)
                const validation = validateStCardValue(raw)
                const cardId = randomUUID()
                const cardRecord = {
                  id: cardId,
                  kind: 'cards',
                  name: normalized.name,
                  source: 'generated-from-novel',
                  version: 1,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  lineage: {
                    derivedFrom: [
                      { kind: 'novels', id: novelId },
                      ...(worldbookRecord ? [{ kind: 'worldbooks', id: worldbookRecord.id }] : []),
                      ...(storyRecord ? [{ kind: 'stories', id: storyRecord.id }] : [])
                    ],
                    derivation: 'novel-to-card',
                    characterName: normalized.name
                  },
                  data: { format: 'sillytavern-json', normalized, raw, validation }
                }
                if (shouldImportToTavern && validation.valid) {
                  try { cardRecord.data.tavernCard = await importCardToTavern(dshHome, cardRecord) } catch (error) { cardRecord.data.tavernError = error instanceof Error ? error.message : String(error) }
                }
                store.data.resources.cards[cardId] = cardRecord
                cards.push(cardRecord)
              }
            }
            await store.save()
            sendJson(res, 200, {
              ok: true,
              story: storyRecord ? { id: storyRecord.id, name: storyRecord.name, kind: storyRecord.kind, lineage: storyRecord.lineage } : null,
              novel: { id: novelId, name: novel.name, chapterCount: novel.chapterCount, charCount: novel.charCount, characters: novel.characters },
              worldbook: worldbookRecord ? { id: worldbookRecord.id, name: worldbookRecord.name, entryCount: worldbookRecord.data.entryCount, lineage: worldbookRecord.lineage } : null,
              cards: cards.map(card => ({
                id: card.id, name: card.name, valid: card.data.validation?.valid === true,
                warnings: card.data.validation?.warnings || [], tavern: card.data.tavernCard || null, tavernError: card.data.tavernError || null,
                lineage: card.lineage
              }))
            })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/feedback/session') {
            const body = await readJsonBody(req, 16 * 1024 * 1024)
            let transcript = String(body.text || '')
            let chatId = String(body.chatId || '')
            if (!transcript.trim() && chatId) transcript = await composeTavernTranscript(dshHome, chatId, body.maxChars)
            if (!transcript.trim()) throw new Error('需要提供 text 或有效的 chatId')
            let result
            let generationError = ''
            try {
              result = await generateJson(routeCtx, {
                maxTokens: 1800,
                system: '你是互动叙事分析器。只输出严格 JSON，不要解释，不要 Markdown 代码围栏。',
                prompt: `分析下面的角色扮演/互动叙事记录，输出续写和反馈所需信息。\n输出格式：{"summary":"","relationshipChanges":[{"character":"","from":"","to":"","reason":""}],"characterGrowth":[{"character":"","change":""}],"unresolvedHooks":[""],"playerPreferences":[""],"continuationOutline":[{"title":"","summary":""}],"newCharacterCandidates":[{"name":"","reason":""}]}\n记录：\n${transcript.slice(0, 8000)}`
              })
            } catch (error) {
              generationError = error instanceof Error ? error.message : String(error)
              result = { value: heuristicFeedback(transcript), rawText: '', model: null }
            }
            const feedback = result.value && typeof result.value === 'object' ? result.value : {}
            const id = randomUUID()
            const now = Date.now()
            const record = {
              id,
              kind: 'summaries',
              name: body.name || (chatId ? 'Tavern 会话反馈 · ' + chatId : 'Tavern 会话反馈'),
              source: 'tavern-session-feedback',
              version: 1,
              createdAt: now,
              updatedAt: now,
              lineage: { derivedFrom: chatId ? [{ kind: 'tavern-chats', id: chatId }] : [], derivation: 'tavern-feedback', model: result.model },
              data: {
                format: 'tavern-feedback',
                chatId,
                transcriptChars: transcript.length,
                feedback,
                rawText: result.rawText,
                generationError,
                sessionId: routeCtx.runtime.sessionId || ''
              }
            }
            store.data.resources.summaries[id] = record
            await store.save()
            sendJson(res, 200, { ok: true, model: result.model, summary: record })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/tavern/chats') {
            const indexPath = path.join(dshHome, 'profile-data', 'tavern', 'data', 'index.json')
            let chats = []
            try {
              const index = JSON.parse(await readFile(indexPath, 'utf8'))
              chats = Array.isArray(index.chats) ? index.chats : []
            } catch (error) {
              chats = []
            }
            const requestRoot = path.join(dshHome, 'profile-data', 'tavern', 'data', 'model-requests')
            const result = (await Promise.all(chats.map(async chat => {
              const id = String(chat.id || '')
              const requestDir = path.join(requestRoot, id)
              let requestCount = 0
              let latestRequestAt = 0
              try {
                const index = JSON.parse(await readFile(path.join(requestDir, 'index.json'), 'utf8'))
                const requests = Array.isArray(index.requests) ? index.requests : []
                requestCount = requests.length
                latestRequestAt = requests.reduce((max, item) => Math.max(max, Number(item.createdAt) || 0), 0)
              } catch (error) {}
              return {
                id,
                cardPath: String(chat.cardPath || ''),
                cardName: String(chat.cardName || ''),
                title: String(chat.title || ''),
                mode: String(chat.mode || ''),
                updatedAt: Number(chat.updatedAt) || 0,
                hasModelRequests: existsSync(path.join(requestDir, 'index.json')),
                requestCount,
                latestRequestAt
              }
            }))).filter(chat => chat.id !== '').sort((left, right) => right.updatedAt - left.updatedAt)
            sendJson(res, 200, { ok: true, chats: result })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/pipeline/feedback-to-content') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const summaryId = String(body.summaryId || '')
            const summary = store.data.resources.summaries[summaryId]
            if (!summary) { sendJson(res, 404, { ok: false, error: 'summary not found' }); return }
            const feedback = summary.data && summary.data.feedback && typeof summary.data.feedback === 'object' ? summary.data.feedback : {}
            const shouldImportToTavern = body.importToTavern === true
            const createdScripts = []
            const createdCards = []
            const now = Date.now()
            for (const item of Array.isArray(feedback.continuationOutline) ? feedback.continuationOutline : []) {
              const scriptId = randomUUID()
              const record = {
                id: scriptId,
                kind: 'scripts',
                name: String(item.title || '续写大纲'),
                source: 'generated-from-feedback',
                version: 1,
                createdAt: now,
                updatedAt: now,
                lineage: { derivedFrom: [{ kind: 'summaries', id: summaryId }], derivation: 'feedback-to-outline' },
                data: {
                  format: 'outline',
                  title: String(item.title || '续写大纲'),
                  summary: String(item.summary || ''),
                  sourceSummary: String(feedback.summary || '')
                }
              }
              store.data.resources.scripts[scriptId] = record
              createdScripts.push(record)
            }
            for (const candidate of Array.isArray(feedback.newCharacterCandidates) ? feedback.newCharacterCandidates : []) {
              const raw = buildStCard(candidate, { name: candidate.name, source: 'feedback-candidate' })
              const normalized = unwrapStCard(raw, candidate.name)
              const validation = validateStCardValue(raw)
              const cardId = randomUUID()
              const record = {
                id: cardId,
                kind: 'cards',
                name: normalized.name,
                source: 'generated-from-feedback',
                version: 1,
                createdAt: now,
                updatedAt: now,
                lineage: { derivedFrom: [{ kind: 'summaries', id: summaryId }], derivation: 'feedback-to-card', reason: String(candidate.reason || '') },
                data: { format: 'sillytavern-json', normalized, raw, validation }
              }
              if (shouldImportToTavern && validation.valid) {
                try { record.data.tavernCard = await importCardToTavern(dshHome, record) } catch (error) { record.data.tavernError = error instanceof Error ? error.message : String(error) }
              }
              store.data.resources.cards[cardId] = record
              createdCards.push(record)
            }
            await store.save()
            sendJson(res, 200, {
              ok: true,
              summary: { id: summary.id, name: summary.name },
              scripts: createdScripts.map(record => ({ id: record.id, name: record.name, title: record.data.title, summary: record.data.summary, lineage: record.lineage })),
              cards: createdCards.map(record => ({ id: record.id, name: record.name, valid: record.data.validation?.valid === true, tavern: record.data.tavernCard || null, tavernError: record.data.tavernError || null, lineage: record.lineage }))
            })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/drama/to-adventure') {
            const body = await readJsonBody(req, 4 * 1024 * 1024)
            const projectId = String(body.projectId || '').trim()
            const dramaPath = String(body.path || '').trim()
            const dramaText = String(body.text || '').trim()
            if (!projectId || !dramaPath || !dramaText) throw new Error('projectId, path he text buneng wei kong')
            const sourceSlice = dramaText.slice(0, 12000)
            const generated = await generateJson(routeCtx, {
              maxTokens: 3000,
              system: 'Ni shi wangwen sheding tiquqi. Zhi shuchu yange JSON, bu yao jieshi, bu yao Markdown daima weilan.',
              prompt: 'Cong xiamian de duanju pian duan zhong tiqu shijieshu tiaomu.\nShuchu geshi: {"name":"shijieshuming","entries":[{"keys":["chufaci"],"content":"sheding neirong","comment":"tiaomu biaoti","enabled":true}]}\nDuanju pian duan:\n' + sourceSlice
            })
            const wb = generated.value && typeof generated.value === 'object' ? generated.value : {}
            const scriptResource = Object.values(store.data.resources.scripts || {}).find(record => record && record.data && record.data.projectId === projectId && record.data.path === dramaPath) || null
            const deriveRefs = [{ kind: 'stories', id: projectId }]
            if (scriptResource) deriveRefs.push({ kind: 'scripts', id: scriptResource.id })
            const now = Date.now()
            const worldbookId = randomUUID()
            const worldbookEntries = Array.isArray(wb.entries) ? wb.entries : []
            const worldbookRecord = {
              id: worldbookId,
              kind: 'worldbooks',
              name: String(wb.name || projectId + ' juben shijieshu'),
              source: 'drama-to-adventure',
              version: 1,
              createdAt: now,
              updatedAt: now,
              lineage: { derivedFrom: deriveRefs, derivation: 'drama-to-adventure-worldbook', path: dramaPath, model: generated.model },
              data: {
                format: 'sillytavern-worldbook',
                entryCount: worldbookEntries.length,
                normalized: { name: String(wb.name || projectId + ' juben shijieshu'), entryCount: worldbookEntries.length, entries: worldbookEntries },
                raw: wb
              }
            }
            store.data.resources.worldbooks[worldbookId] = worldbookRecord
            const presetData = worldbookToPreset({ name: worldbookRecord.name, entries: worldbookEntries })
            const presetId = randomUUID()
            const presetRecord = {
              id: presetId,
              kind: 'presets',
              name: String(presetData.name || projectId + ' juben yushe'),
              source: 'drama-to-adventure',
              version: 1,
              createdAt: now,
              updatedAt: now,
              lineage: { derivedFrom: [{ kind: 'worldbooks', id: worldbookId }, ...deriveRefs], derivation: 'drama-to-adventure-preset', path: dramaPath },
              data: {
                format: 'sillytavern-preset-json',
                promptCount: Array.isArray(presetData.prompts) ? presetData.prompts.length : 0,
                enabledPromptCount: Array.isArray(presetData.prompts) ? presetData.prompts.filter(prompt => prompt && prompt.enabled !== false).length : 0,
                normalized: presetData,
                raw: presetData
              }
            }
            store.data.resources.presets[presetId] = presetRecord
            const openSessions = Object.values(store.data.resources.sessions || {}).filter(record => record && record.data && record.data.mode === 'adventure' && record.data.storyProjectId === projectId)
            let session = openSessions.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0] || null
            if (session) {
              session.data.worldbookId = worldbookId
              session.name = String(body.sessionName || session.name || projectId + ' maoxian')
              session.updatedAt = Date.now()
            } else {
              session = createMuseSession(store, {
                name: String(body.sessionName || projectId + ' maoxian'),
                mode: 'adventure',
                worldbookId,
                storyProjectId: projectId
              })
            }
            await store.save()
            sendJson(res, 200, {
              ok: true,
              projectId,
              path: dramaPath,
              worldbook: { id: worldbookRecord.id, name: worldbookRecord.name, entryCount: worldbookRecord.data.entryCount, lineage: worldbookRecord.lineage },
              preset: { id: presetRecord.id, name: presetRecord.name, promptCount: presetRecord.data.promptCount, lineage: presetRecord.lineage },
              session: summarizeMuseSession(session)
            })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/museai/settings') {
            const catalog = await modelCatalog(routeCtx)
            // Get MuseAI settings from store, or default if not found
            let museAiSettings = store.data.resources['museai-settings']?.[0] || null
            if (!museAiSettings) {
              // Default settings
              museAiSettings = {
                id: 'museai-settings-default', // temporary id, will be replaced when saved
                kind: 'museai-settings',
                name: 'MuseAI Settings',
                data: {
                  prompt: "",
                  sampling: {
                    temperature: 0.7,
                    top_p: 0.9
                  }
                }
              }
            }
            sendJson(res, 200, {
              ok: true,
              catalog,
              defaultSelection: routeCtx.agentDefaultModel.currentSelection(),
              resources: resourceSummary(store),
              museaiSettings: museAiSettings.data
            })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/museai/model') {
            const body = await readJsonBody(req)
            const provider = String(body.provider || '').trim()
            const model = String(body.model || '').trim()
            if (!provider || !model) throw new Error('provider 和 model 不能为空')
            await routeCtx.agentDefaultModel.saveSelection({ provider, model })
            sendJson(res, 200, { ok: true, defaultSelection: routeCtx.agentDefaultModel.currentSelection() })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/museai/settings') {
            const body = await readJsonBody(req)
            // Validate settings structure
            const { prompt, sampling } = body || {}
            if (typeof prompt !== 'string') throw new Error('prompt must be a string')
            if (sampling && typeof sampling !== 'object') throw new Error('sampling must be an object')
            // Validate sampling values if present
            if (sampling) {
              if (sampling.temperature !== undefined && (typeof sampling.temperature !== 'number' || sampling.temperature < 0 || sampling.temperature > 2)) {
                throw new Error('temperature must be a number between 0 and 2')
              }
              if (sampling.top_p !== undefined && (typeof sampling.top_p !== 'number' || sampling.top_p < 0 || sampling.top_p > 1)) {
                throw new Error('top_p must be a number between 0 and 1')
              }
            }
            // Create or update MuseAI settings resource
            const settingsId = 'museai-settings'
            const existingIdx = store.data.resources[settingsId]?.findIndex(r => r.kind === 'museai-settings') ?? -1
            const settingsResource = {
              id: settingsId,
              kind: 'museai-settings',
              name: 'MuseAI Settings',
              data: {
                prompt: prompt || '',
                sampling: {
                  temperature: sampling?.temperature ?? 0.7,
                  top_p: sampling?.top_p ?? 0.9
                }
              }
            }
            if (existingIdx >= 0) {
              store.data.resources[settingsId][existingIdx] = settingsResource
            } else {
              store.data.resources[settingsId] = [settingsResource]
            }
            await store.save()
            sendJson(res, 200, { ok: true, settings: settingsResource.data })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/museai/sessions') {
            sendJson(res, 200, {
              ok: true,
              sessions: resourceList(store, 'sessions').map(summarizeMuseSession)
            })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/museai/sessions') {
            const body = await readJsonBody(req)
            const session = createMuseSession(store, body)
            await store.save()
            sendJson(res, 200, { ok: true, session })
            return
          }

          const museaiSessionMatch = /^\/plugins\/creative-suite\/museai\/sessions\/([^/]+)$/.exec(pathname)
          if (museaiSessionMatch) {
            const session = store.data.resources.sessions[museaiSessionMatch[1]]
            if (!session) { sendJson(res, 404, { ok: false, error: 'MuseAI session not found' }); return }
            if (req.method === 'GET') {
              sendJson(res, 200, { ok: true, session, summary: summarizeMuseSession(session) })
              return
            }
            if (req.method === 'DELETE') {
              delete store.data.resources.sessions[museaiSessionMatch[1]]
              await store.save()
              sendJson(res, 200, { ok: true, deleted: museaiSessionMatch[1] })
              return
            }
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/museai/chat') {
            const body = await readJsonBody(req, 4 * 1024 * 1024)
            const text = String(body.message || body.text || '').trim()
            if (!text) throw new Error('消息不能为空')
            let session = body.sessionId ? store.data.resources.sessions[body.sessionId] : null
            if (!session) session = createMuseSession(store, body)
            // Persist companion cast on adventure sessions so later turns keep multi-character context.
            if (session.data && session.data.mode === 'adventure') {
              const nextCompanions = normalizeMuseIdList(
                body.companionIds !== undefined ? body.companionIds : (body.castIds !== undefined ? body.castIds : (body.extraCardIds !== undefined ? body.extraCardIds : session.data.companionIds))
              ).filter(id => id && id !== (body.cardId || session.data.cardId))
              session.data.companionIds = nextCompanions
            }
            const context = buildMuseContext(store, Object.assign({}, body, {
              cardId: body.cardId || (session.data && session.data.cardId),
              companionIds: session.data && session.data.mode === 'adventure'
                ? (session.data.companionIds || body.companionIds || body.castIds || body.extraCardIds)
                : [],
              worldbookId: body.worldbookId || (session.data && session.data.worldbookId)
            }))
            const choiceIndex = body.choiceIndex !== undefined && body.choiceIndex !== null && body.choiceIndex !== ''
              ? Math.max(0, Number(body.choiceIndex) || 0)
              : null
            // If the player picked a numbered GM choice, record it alongside the free-text action.
            const userMessage = choiceIndex === null
              ? { role: 'user', content: text, at: Date.now() }
              : { role: 'user', content: text, choiceIndex, at: Date.now() }
            session.data.messages = Array.isArray(session.data.messages) ? session.data.messages : []
            session.data.messages.push(userMessage)
            // Get MuseAI settings
            const museAiSettings = store.data.resources['museai-settings']?.[0]?.data || {}
            const settingsPrompt = museAiSettings.prompt || ''
            const { temperature = 0.7, top_p = 0.9 } = museAiSettings.sampling || {}
            let result
            try {
              result = await generateText(routeCtx, {
                maxTokens: Math.max(256, Math.min(4000, Number(body.maxTokens) || 1200)),
                system: buildMuseSystem(context, session.data.mode),
                prompt: settingsPrompt ? settingsPrompt + '\n\n' + buildMusePrompt(session.data.messages, session.data.mode) : buildMusePrompt(session.data.messages, session.data.mode),
                temperature,
                topP: top_p
              })
            } catch (error) {
              session.data.lastError = error instanceof Error ? error.message : String(error)
              session.updatedAt = Date.now()
              await store.save()
              throw error
            }
            const assistantMessage = {
              role: 'assistant',
              content: result.text || '（模型没有返回内容）',
              at: Date.now(),
              model: result.model || null
            }
            if (session.data.mode === 'adventure') {
              const split = splitAdventureNarration(assistantMessage.content)
              assistantMessage.narration = split.narration
              assistantMessage.choices = split.choices
            }
            session.data.messages.push(assistantMessage)
            session.data.lastError = ''
            session.data.model = result.model || session.data.model
            session.updatedAt = Date.now()
            await store.save()
            sendJson(res, 200, {
              ok: true,
              session,
              summary: summarizeMuseSession(session),
              reply: assistantMessage,
              model: result.model,
              context: {
                card: context.card ? { id: context.card.id, name: context.card.name } : null,
                companions: (context.companions || []).map(item => ({ id: item.id, name: item.name })),
                worldbook: context.worldbook ? { id: context.worldbook.id, name: context.worldbook.name, entryCount: context.worldbook.entries.length } : null
              }
            })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/museai/bonds') {
            sendJson(res, 200, { ok: true, ...museBonds(store) })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/tavern/transcript') {
            const query = new URL(req.url || '/', 'http://x').searchParams
            const chatId = String(query.get('chatId') || '').trim()
            if (!chatId) throw new Error('chatId 不能为空')
            const transcript = await composeTavernTranscript(dshHome, chatId, query.get('maxChars'))
            sendJson(res, 200, { ok: true, chatId, transcript, chars: transcript.length })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/tavern/launch') {
            const url = await tavernLaunchUrl(dshHome)
            sendJson(res, 200, { ok: true, url })
            return
          }

          if ((req.method === 'GET' || req.method === 'POST') && pathname === '/plugins/creative-suite/tavern/session-patch/ensure') {
            const patch = await ensureTavernSessionPatch(dshHome)
            sendJson(res, 200, { ok: true, patch })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/tavern/model-request') {
            const query = new URL(req.url || '/', 'http://x').searchParams
            const chatId = String(query.get('chatId') || '').trim()
            if (!chatId) throw new Error('chatId 不能为空')
            const root = path.join(dshHome, 'profile-data', 'tavern', 'data', 'model-requests', chatId)
            const index = JSON.parse(await readFile(path.join(root, 'index.json'), 'utf8'))
            const requests = Array.isArray(index.requests) ? index.requests : []
            if (requests.length === 0) throw new Error('该会话没有模型请求记录')
            const latest = requests.reduce((best, item) => (Number(item.createdAt) || 0) > (Number(best.createdAt) || 0) ? item : best, requests[0])
            const payload = JSON.parse(await readFile(path.join(root, latest.id + '.json'), 'utf8'))
            const messages = payload && payload.request && Array.isArray(payload.request.messages) ? payload.request.messages : []
            sendJson(res, 200, {
              ok: true,
              chatId,
              requestId: latest.id,
              task: latest.task || '',
              model: latest.model || null,
              messages: messages.map(message => ({
                role: message.role,
                text: textFromMessageContent(message.content),
                name: message.name || ''
              }))
            })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/tavern/gameplay/capabilities') {
            // N0-1: 本地化 capabilities，不再依赖外部 Tavern 服务。
            // 值与上游 gameplay-api.js:18 一致（version 1 / browserScriptRuntime false），
            // transport 标记为 native-helper-runtime 以区别于 production-session。
            sendJson(res, 200, { ok: true, version: 1, transport: 'native-helper-runtime', browserScriptRuntime: false, native: true, deprecated: false })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/tavern/gameplay/cards') {
            try {
              const result = await tavernGameplayRequest(dshHome, 'cards')
              sendJson(res, 200, result)
            } catch (error) { throw withNativeHint(error) }
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/tavern/gameplay/state') {
            const query = new URL(req.url || '/', 'http://x').searchParams
            const sessionId = String(query.get('sessionId') || '').trim()
            if (!sessionId) throw new Error('sessionId 不能为空')
            try {
              const result = await tavernGameplayRequest(dshHome, 'state', { sessionId })
              sendJson(res, 200, result)
            } catch (error) { throw withNativeHint(error) }
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/gameplay/create') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            if (!body.model || !body.model.provider || !body.model.model) {
              body.model = routeCtx.agentDefaultModel.currentSelection()
            }
            try {
              const result = await tavernGameplayRequest(dshHome, 'create', body)
              sendJson(res, 200, result)
            } catch (error) { throw withNativeHint(error) }
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/gameplay/send') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            try {
              const result = await tavernGameplayRequest(dshHome, 'send', body)
              sendJson(res, 200, result)
            } catch (error) { throw withNativeHint(error) }
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/gameplay/candidates') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            try {
              const result = await runCandidateTask(dshHome, body)
              sendJson(res, 200, result)
            } catch (error) { throw withNativeHint(error) }
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/gameplay/variables') {
            const body = await readJsonBody(req, 4 * 1024 * 1024)
            const sessionId = String(body.sessionId || '').trim()
            if (!sessionId) throw new Error('sessionId 不能为空')
            const variables = body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables) ? body.variables : {}
            const option = body.option && typeof body.option === 'object' ? body.option : { type: 'chat' }
            try {
              const result = await tavernRpcRequest(dshHome, 'updateTavernHelperVariables', { sessionId, option, variables })
              sendJson(res, 200, result)
            } catch (error) { throw withNativeHint(error) }
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/gameplay/cancel') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            try {
              const result = await tavernGameplayRequest(dshHome, 'cancel', body)
              sendJson(res, 200, result)
            } catch (error) { throw withNativeHint(error) }
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/native/turn') {
            // N0-3: native turn 最小闭环。卡字段→prompt（buildMuseContext/tavern system）→
            // worldbook keys 激活 → ctx.llm 正文生成 → helper runtime 挂载（失败不阻断）。
            // 全程不调外部 Tavern 服务。
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const cardId = String(body.cardId || '').trim()
            if (!cardId) { sendJson(res, 400, { ok: false, error: 'cardId 不能为空' }); return }
            const input = String(body.input ?? '')
            if (!input.trim()) { sendJson(res, 400, { ok: false, error: 'input 不能为空' }); return }
            const cardRecord = store.data.resources.cards && store.data.resources.cards[cardId]
            if (!cardRecord) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            const history = Array.isArray(body.history) ? body.history.slice(-12) : []
            const recentText = history.slice(-6)
              .map(message => String(message && (message.content ?? message.text ?? '') || ''))
              .join('\n').slice(0, 12000) + '\n' + input.slice(0, 4000)
            const context = buildMuseContext(store, Object.assign({}, body, { cardId }))
            if (context.worldbook && Array.isArray(context.worldbook.entries)) {
              context.worldbook = Object.assign({}, context.worldbook, {
                entries: activateWorldbookEntries(context.worldbook.entries, recentText)
              })
            }
            const system = buildMuseSystem(context, 'tavern', { recentText })
            const transcript = history
              .map(message => `${message && message.role === 'assistant' ? '角色' : '玩家'}：${String(message && (message.content ?? message.text ?? '') || '').trim()}`)
              .filter(Boolean).join('\n\n')
            const prompt = (transcript ? transcript + '\n\n' : '') + `玩家：${input.trim()}\n\n请以上文最后一句玩家发言为输入，继续回复。`
            const temperature = typeof body.temperature === 'number' ? body.temperature : undefined
            const maxTokens = Number.isFinite(Number(body.maxTokens)) ? Math.max(1, Math.min(8000, Number(body.maxTokens))) : 2000
            let generated
            try {
              generated = await generateTextWithRetry(routeCtx, Object.assign(
                { system, prompt, maxTokens },
                temperature !== undefined ? { temperature } : {}
              ))
            } catch (error) {
              sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
              return
            }
            const sessionId = String(body.sessionId || '').trim()
            let runtimeInfo = null
            if (sessionId) {
              try {
                const existing = getHelperRuntime(sessionId)
                const runtime = existing || createHelperRuntime({
                  id: sessionId,
                  cardId,
                  rawCard: cardRecord.data && cardRecord.data.raw,
                  variables: {},
                  messages: history.map(message => ({
                    role: message && message.role === 'assistant' ? 'assistant' : 'user',
                    message: String(message && (message.content ?? message.text ?? '') || '')
                  })),
                  sessionId,
                  cardName: cardRecord.name || '',
                  userName: '你'
                })
                runtimeInfo = { id: runtime.id }
              } catch (_error) { runtimeInfo = null }
            }
            sendJson(res, 200, Object.assign(
              { ok: true, text: generated.text, model: generated.model, native: true },
              runtimeInfo ? { runtime: runtimeInfo } : {}
            ))
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/chat/regen') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            await ensureTavernSessionPatch(dshHome)
            const result = await tavernRpcRequest(dshHome, 'regenBody', body)
            sendJson(res, 200, result)
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/chat/rollback') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            await ensureTavernSessionPatch(dshHome)
            const result = await tavernRpcRequest(dshHome, 'rollbackTurn', body)
            sendJson(res, 200, result)
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/chat/undo-rollback') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            await ensureTavernSessionPatch(dshHome)
            const result = await tavernRpcRequest(dshHome, 'undoRollbackTurn', body)
            sendJson(res, 200, result)
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/chat/retry-mvu') {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            await ensureTavernSessionPatch(dshHome)
            const result = await tavernRpcRequest(dshHome, 'retryMvuSettlement', body)
            sendJson(res, 200, result)
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/chat/delete') {
            const body = await readJsonBody(req)
            const chatId = String(body.chatId || '').trim()
            if (!chatId) throw new Error('chatId 不能为空')
            const result = await tavernRpcRequest(dshHome, 'deleteChat', { chatId })
            sendJson(res, 200, result)
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/tavern/gameplay/dispose') {
            const body = await readJsonBody(req)
            const sessionId = String(body.sessionId || '').trim()
            let chatId = String(body.chatId || '').trim()
            if (!sessionId && !chatId) throw new Error('sessionId 或 chatId 至少需要一个')
            if (!chatId && sessionId) {
              try {
                const state = await tavernGameplayRequest(dshHome, 'state', { sessionId })
                chatId = String(state.chat && state.chat.id || '')
              } catch (_error) {}
            }
            const result = { cancelled: false, taskStopped: false, deletedChat: false, deletedAutomation: false, deferred: false }
            if (sessionId) {
              try { await tavernGameplayRequest(dshHome, 'cancel', { sessionId }); result.cancelled = true } catch (_error) {}
              result.taskStopped = await waitForNoRunningCandidate(dshHome, sessionId, 12000)
              if (result.taskStopped) await delay(1000)
              if (/^test-[a-f0-9-]{36}$/.test(sessionId)) {
                const file = path.join(dshHome, 'profile-data', 'tavern', 'data', 'automation', sessionId + '.json')
                try { await unlink(file); result.deletedAutomation = true } catch (_error) {}
              }
            }
            if (chatId) {
              if (!sessionId || result.taskStopped) {
                try { await tavernRpcRequest(dshHome, 'deleteChat', { chatId }); result.deletedChat = true } catch (_error) {}
              } else {
                result.deferred = true
              }
            }
            sendJson(res, 200, { ok: true, ...result, sessionId: sessionId || null, chatId: chatId || null })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/migrate/tavern-cards') {
            const result = await migrateTavernCards(dshHome, store)
            sendJson(res, 200, { ok: true, ...result })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/migrate/all') {
            const cards = await migrateTavernCards(dshHome, store)
            const worldbooks = await migrateTavernWorldbooks(dshHome, store)
            const presets = await migrateTavernPresets(dshHome, store)
            sendJson(res, 200, { ok: true, cards, worldbooks, presets })
            return
          }

          if (req.method === 'POST' && pathname === '/plugins/creative-suite/migrate/all-v2') {
            const migrator = await import('./migrator.js')
            const legacyFile = path.join(dshHome, 'storages', 'creative-suite.json')
            try {
              const migratedData = await migrator.migrateStoreFromFile(legacyFile)
              migratedData.version = STORE_VERSION // normalizeStore drops non-numeric versions on next read
              // 写入当前运行中的文件存储并持久化
              store.data = migratedData
              await store.save()
              sendJson(res, 200, {
                ok: true,
                migrated: true,
                message: 'Migration completed successfully',
                stats: Object.fromEntries(Object.entries(migratedData.resources).map(([kind, table]) => [kind, Object.keys(table || {}).length]))
              })
            } catch (error) {
              sendJson(res, 500, { ok: false, error: `Migration failed: ${error.message}` })
            }
            return
          }

          const storyResourcesMatch = /^\/plugins\/creative-suite\/story\/projects\/([^/]+)\/resources$/.exec(pathname)
          if (req.method === 'GET' && storyResourcesMatch) {
            const id = safeStoryId(storyResourcesMatch[1])
            const resources = storyProjectResources(store, id)
            if (!resources) { sendJson(res, 404, { ok: false, error: 'story resource not found; run the story pipeline first' }); return }
            sendJson(res, 200, { ok: true, projectId: id, ...resources })
            return
          }

          if (pathname === '/plugins/creative-suite/story/projects') {
            if (req.method === 'GET') {
              sendJson(res, 200, { ok: true, projects: await listStoryProjects(dshHome) })
              return
            }
            if (req.method === 'POST') {
              const body = await readJsonBody(req)
              const project = await createStoryProject(dshHome, body)
              sendJson(res, 200, { ok: true, project })
              return
            }
          }

          const storyProjectMatch = /^\/plugins\/creative-suite\/story\/projects\/([^/]+)$/.exec(pathname)
          if (storyProjectMatch) {
            const id = safeStoryId(storyProjectMatch[1])
            if (req.method === 'GET') {
              const { meta, files } = await readStoryProjectMeta(dshHome, id)
              sendJson(res, 200, { ok: true, projectId: id, project: meta, files })
              return
            }
            if (req.method === 'PUT' || req.method === 'PATCH') {
              const body = await readJsonBody(req)
              const project = await updateStoryProject(dshHome, id, body)
              sendJson(res, 200, { ok: true, projectId: id, project })
              return
            }
            if (req.method === 'DELETE') {
              const removed = await deleteStoryProject(dshHome, id)
              sendJson(res, 200, { ok: true, projectId: removed, removed })
              return
            }
          }

          const storyFilesMatch = /^\/plugins\/creative-suite\/story\/projects\/([^/]+)\/files$/.exec(pathname)
          if (req.method === 'GET' && storyFilesMatch) {
            const id = safeStoryId(storyFilesMatch[1])
            const projectRoot = path.join(storyProjectsRoot(dshHome), id)
            const files = await walkStoryFiles(projectRoot)
            sendJson(res, 200, { ok: true, projectId: id, files })
            return
          }

          const storyStructureAnalyzeMatch = /^\/plugins\/creative-suite\/story\/projects\/([^/]+)\/structure\/analyze$/.exec(pathname)
          if (req.method === 'GET' && storyStructureAnalyzeMatch) {
            const id = safeStoryId(storyStructureAnalyzeMatch[1])
            const projectRoot = path.join(storyProjectsRoot(dshHome), id)
            const chapters = await parseStoryProject(projectRoot)
            const chaptersWithContent = await Promise.all(chapters.map(async chapter => {
              let content = ''
              try {
                content = await readFile(path.join(projectRoot, chapter.contentPath), 'utf8')
              } catch (_error) {}
              return { ...chapter, content }
            }))
            const analysis = analyzeChapterStructure(chaptersWithContent)
            sendJson(res, 200, { ok: true, projectId: id, ...analysis })
            return
          }

          const storyStructureMatch = /^\/plugins\/creative-suite\/story\/projects\/([^/]+)\/structure$/.exec(pathname)
          if (req.method === 'GET' && storyStructureMatch) {
            const id = safeStoryId(storyStructureMatch[1])
            const projectRoot = path.join(storyProjectsRoot(dshHome), id)
            const structure = await parseStoryProject(projectRoot)
            sendJson(res, 200, { ok: true, structure })
            return
          }

          const storyFileMatch = /^\/plugins\/creative-suite\/story\/projects\/([^/]+)\/file$/.exec(pathname)
          if (storyFileMatch) {
            const id = safeStoryId(storyFileMatch[1])
            const projectRoot = path.join(storyProjectsRoot(dshHome), id)
            const query = new URL(req.url || '/', 'http://x').searchParams
            if (req.method === 'GET') {
              const relative = query.get('path') || ''
              const file = safeProjectPath(projectRoot, relative)
              const buffer = await readFile(file)
              if (buffer.length > 2 * 1024 * 1024) throw new Error('文件超过 2MB')
              sendJson(res, 200, { ok: true, projectId: id, path: relative, text: buffer.toString('utf8'), bytes: buffer.length })
              return
            }
            if (req.method === 'POST') {
              const body = await readJsonBody(req, 2 * 1024 * 1024)
              const relative = String(body.path || '')
              if (isProtectedProjectFile(relative)) throw new Error('不能覆盖项目元数据文件')
              const file = safeProjectPath(projectRoot, relative)
              await mkdir(path.dirname(file), { recursive: true })
              await writeFile(file, String(body.text || ''), 'utf8')
              sendJson(res, 200, { ok: true, projectId: id, path: relative, bytes: Buffer.byteLength(String(body.text || '')) })
              return
            }
            if (req.method === 'PUT') {
              const body = await readJsonBody(req, 2 * 1024 * 1024)
              const relative = String(body.path || '')
              if (!relative) throw new Error('文件路径不能为空')
              if (isProtectedProjectFile(relative)) throw new Error('不能覆盖项目元数据文件')
              const file = safeProjectPath(projectRoot, relative)
              if (!existsSync(file)) { sendJson(res, 404, { ok: false, error: '文件不存在' }); return }
              await mkdir(path.dirname(file), { recursive: true })
              await writeFile(file, String(body.text || ''), 'utf8')
              sendJson(res, 200, { ok: true, projectId: id, path: relative, bytes: Buffer.byteLength(String(body.text || '')), updated: true })
              return
            }
            if (req.method === 'DELETE') {
              const queryPath = query.get('path') || ''
              let relative = String(queryPath || '')
              if (!relative) {
                try {
                  const body = await readJsonBody(req, 64 * 1024)
                  relative = String(body.path || '')
                } catch (_error) { relative = '' }
              }
              if (!relative) throw new Error('文件路径不能为空')
              if (isProtectedProjectFile(relative)) throw new Error('不能删除项目元数据文件')
              const file = safeProjectPath(projectRoot, relative)
              if (!existsSync(file)) { sendJson(res, 404, { ok: false, error: '文件不存在' }); return }
              await unlink(file)
              sendJson(res, 200, { ok: true, projectId: id, path: relative, removed: relative })
              return
            }
          }

          const storyGenerateMatch = /^\/plugins\/creative-suite\/story\/projects\/([^/]+)\/generate$/.exec(pathname)
          if (req.method === 'POST' && storyGenerateMatch) {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const result = await generateStoryWorkbench(routeCtx, dshHome, store, storyGenerateMatch[1], body)
            sendJson(res, 200, { ok: true, ...result })
            return
          }

          const storyBatchMatch = /^\/plugins\/creative-suite\/story\/projects\/([^/]+)\/generate-batch$/.exec(pathname)
          if (req.method === 'POST' && storyBatchMatch) {
            const body = await readJsonBody(req, 2 * 1024 * 1024)
            const kinds = Array.isArray(body.kinds) ? body.kinds.filter(kind => ['outline', 'chapter', 'drama', 'game', 'video'].includes(kind)) : ['outline', 'chapter']
            if (kinds.length === 0) throw new Error('generate-batch 需要至少一种生成类型')
            const results = []
            for (const kind of kinds) results.push(await generateStoryWorkbench(routeCtx, dshHome, store, storyBatchMatch[1], Object.assign({}, body, { kind })))
            sendJson(res, 200, { ok: true, results })
            return
          }

          const bindWorldbookMatch = /^\/plugins\/creative-suite\/resources\/cards\/([^/]+)\/bind-worldbook$/.exec(pathname)
          const cardBindingsMatch = /^\/plugins\/creative-suite\/resources\/cards\/([^/]+)\/bindings$/.exec(pathname)
          if (req.method === 'GET' && cardBindingsMatch) {
            const cardId = cardBindingsMatch[1]
            const card = store.data.resources.cards[cardId]
            if (!card) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            const ids = Array.isArray(card.data && card.data.worldbookIds) ? card.data.worldbookIds : []
            const worldbooks = ids.map(id => store.data.resources.worldbooks[id]).filter(Boolean)
            sendJson(res, 200, { ok: true, card: { id: card.id, name: card.name, source: card.source, worldbookIds: ids }, worldbooks })
            return
          }

          const unbindWorldbookMatch = /^\/plugins\/creative-suite\/resources\/cards\/([^/]+)\/bind-worldbook\/([^/]+)$/.exec(pathname)
          if (req.method === 'DELETE' && unbindWorldbookMatch) {
            const cardId = unbindWorldbookMatch[1]
            const worldbookId = unbindWorldbookMatch[2]
            const card = store.data.resources.cards[cardId]
            if (!card) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            const ids = Array.isArray(card.data && card.data.worldbookIds) ? card.data.worldbookIds : []
            card.data.worldbookIds = ids.filter(id => String(id) !== String(worldbookId))
            const remainingWorldbooks = card.data.worldbookIds.map(id => store.data.resources.worldbooks[id]).filter(Boolean)
            const characterBook = { name: remainingWorldbooks.map(item => item.name).join(', '), description: '', entries: remainingWorldbooks.flatMap(item => worldbookEntriesFromRaw(item.data && item.data.raw)) }
            if (card.data.normalized && typeof card.data.normalized === 'object') card.data.normalized.character_book = characterBook
            if (card.data.raw && typeof card.data.raw === 'object') {
              if (card.data.raw.data && typeof card.data.raw.data === 'object') card.data.raw.data.character_book = characterBook
              else card.data.raw.character_book = characterBook
            }
            card.updatedAt = Date.now()
            await store.save()
            sendJson(res, 200, { ok: true, card, removed: worldbookId })
            return
          }

          if (req.method === 'POST' && bindWorldbookMatch) {
            const cardId = bindWorldbookMatch[1]
            const card = store.data.resources.cards[cardId]
            if (!card) { sendJson(res, 404, { ok: false, error: 'card not found' }); return }
            const body = await readJsonBody(req)
            const worldbookId = String(body.worldbookId || body.id || '')
            const worldbook = store.data.resources.worldbooks[worldbookId]
            if (!worldbook) { sendJson(res, 404, { ok: false, error: 'worldbook not found' }); return }
            const ids = new Set(Array.isArray(card.data.worldbookIds) ? card.data.worldbookIds : [])
            ids.add(worldbookId)
            card.data.worldbookIds = [...ids]
            
            // Sync worldbook entries into card character_book (normalized and raw)
            const character_book = { name: worldbook.name, description: '', entries: worldbookEntriesFromRaw(worldbook.data && worldbook.data.raw) }
            if (card.data.normalized && typeof card.data.normalized === 'object') {
              card.data.normalized.character_book = character_book
            }
            if (card.data.raw && typeof card.data.raw === 'object') {
              if (card.data.raw.data && typeof card.data.raw.data === 'object') {
                card.data.raw.data.character_book = character_book
              } else {
                card.data.raw.character_book = character_book
              }
            }
            
            card.updatedAt = Date.now()
            await store.save()
            sendJson(res, 200, { ok: true, card, worldbook: { id: worldbook.id, name: worldbook.name, entryCount: worldbook.data.entryCount } })
            return
          }

          if (req.method === 'GET' && pathname === '/plugins/creative-suite/resources') {
            const query = new URL(req.url || '/', 'http://x').searchParams
            const kindFilter = query.get('kind')
            const search = query.get('search')
            const hasFilter = kindFilter !== null || search !== null || query.get('limit') !== null || query.get('offset') !== null
            if (!hasFilter) {
              sendJson(res, 200, {
                ok: true,
                resources: resourceSummary(store),
                updatedAt: store.data.updatedAt
              })
              return
            }
            const limit = Math.max(0, Number(query.get('limit')) || 50)
            const offset = Math.max(0, Number(query.get('offset')) || 0)
            let all = []
            for (const k of RESOURCE_KINDS) {
              if (kindFilter && k !== kindFilter) continue
              const table = store.data.resources[k] || {}
              for (const record of Object.values(table)) all.push(record)
            }
            if (search) {
              const needle = String(search).toLowerCase()
              all = all.filter(record => String(record.name || '').toLowerCase().includes(needle) || String(record.id || '').toLowerCase().includes(needle))
            }
            const total = all.length
            const page = all.slice(offset, offset + limit)
            sendJson(res, 200, { ok: true, resources: page, total, limit, offset })
            return
          }

          const versionedMatch = /^\/plugins\/creative-suite\/resources\/([^/]+)\/([^/]+)\/(versions|diff|rollback)$/.exec(pathname)
          if (versionedMatch) {
            const kind = versionedMatch[1]
            const id = decodeURIComponent(versionedMatch[2])
            const action = versionedMatch[3]
            if (!RESOURCE_KINDS.includes(kind)) {
              sendJson(res, 400, { ok: false, error: 'unknown resource kind' })
              return
            }
            const record = store.data.resources[kind] && store.data.resources[kind][id]
            if (!record) { sendJson(res, 404, { ok: false, error: 'not found' }); return }
            if (req.method === 'GET' && action === 'versions') {
              const list = historyListFor(store, kind, id)
              sendJson(res, 200, { ok: true, kind, id, currentVersion: Number(record.version) || 1, versions: [{ version: Number(record.version) || 1, name: record.name, updatedAt: record.updatedAt, current: true }, ...list.slice().reverse().map(item => ({ version: Number(item.version), name: item.name, updatedAt: item.updatedAt, savedAt: item.savedAt, current: false }))] })
              return
            }
            if (req.method === 'GET' && action === 'diff') {
              const query = new URL(req.url || '/', 'http://x').searchParams
              const from = resourceValueAtVersion(store, kind, id, query.get('from'))
              const to = resourceValueAtVersion(store, kind, id, query.get('to'))
              if (!from || !to) { sendJson(res, 400, { ok: false, error: 'invalid version' }); return }
              sendJson(res, 200, { ok: true, kind, id, from: Number(query.get('from')), to: Number(query.get('to')), diff: diffResourceValues(from.data, to.data) })
              return
            }
            if (req.method === 'POST' && action === 'rollback') {
              const body = await readJsonBody(req)
              const target = resourceValueAtVersion(store, kind, id, body.version)
              if (!target) { sendJson(res, 400, { ok: false, error: 'version not found' }); return }
              const list = historyListFor(store, kind, id)
              list.push(snapshotResource(record))
              if (list.length > 50) list.splice(0, list.length - 50)
              const now = Date.now()
              const nextVersion = (Number(record.version) || 1) + 1
              record.data = cloneResourceValue(target.data)
              if (target.name !== undefined) record.name = target.name
              record.version = nextVersion
              record.updatedAt = now
              record.lineage = Object.assign({}, record.lineage, { derivation: 'version-rollback', rolledBackFrom: Number(body.version), rolledBackAt: now })
              await store.save()
              sendJson(res, 200, { ok: true, resource: record })
              return
            }
            sendJson(res, 405, { ok: false, error: 'method not allowed' })
            return
          }

          const singleVersionMatch = /^\/plugins\/creative-suite\/resources\/([^/]+)\/([^/]+)\/versions\/([^/]+)$/.exec(pathname)
          if (req.method === 'GET' && singleVersionMatch) {
            const kind = singleVersionMatch[1]
            const id = decodeURIComponent(singleVersionMatch[2])
            if (!RESOURCE_KINDS.includes(kind)) {
              sendJson(res, 400, { ok: false, error: 'unknown resource kind' })
              return
            }
            const found = resourceValueAtVersion(store, kind, id, decodeURIComponent(singleVersionMatch[3]))
            if (!found) { sendJson(res, 404, { ok: false, error: 'not found' }); return }
            sendJson(res, 200, { ok: true, kind, id, version: Number(decodeURIComponent(singleVersionMatch[3])), snapshot: found })
            return
          }

          const resourceMatch = /^\/plugins\/creative-suite\/resources\/([^/]+)(?:\/([^/]+))?$/.exec(pathname)
          if (resourceMatch) {
            const kind = resourceMatch[1]
            const id = resourceMatch[2]
            if (!RESOURCE_KINDS.includes(kind)) {
              sendJson(res, 400, { ok: false, error: 'unknown resource kind' })
              return
            }
            const table = store.data.resources[kind]
            if (req.method === 'GET' && id === undefined) {
              sendJson(res, 200, { ok: true, kind, resources: Object.values(table) })
              return
            }
            if (req.method === 'GET' && id !== undefined) {
              const record = table[id]
              if (!record) { sendJson(res, 404, { ok: false, error: 'not found' }); return }
              sendJson(res, 200, { ok: true, resource: record })
              return
            }
            if (req.method === 'POST' && id === undefined) {
              const body = await readJsonBody(req)
              if (typeof body.name !== 'string' || body.name.trim().length === 0) {
                sendJson(res, 400, { ok: false, error: 'invalid resource: name required, kind must be known, version integer >= 1' })
                return
              }
              const resourceId = String(body.id || randomUUID())
              const now = Date.now()
              const record = {
                id: resourceId,
                kind,
                name: String(body.name || resourceId),
                source: String(body.source || 'poc'),
                version: Number(body.version) || 1,
                createdAt: now,
                updatedAt: now,
                data: body.data === undefined ? body : body.data
              }
              table[resourceId] = record
              if (!validateResource(record)) {
                delete table[resourceId]
                sendJson(res, 400, { ok: false, error: 'invalid resource: name required, kind must be known, version integer >= 1' })
                return
              }
              await store.save()
              sendJson(res, 200, { ok: true, resource: record })
              return
            }
            if (req.method === 'PUT' && id !== undefined) {
              const record = table[id]
              if (!record) { sendJson(res, 404, { ok: false, error: 'not found' }); return }
              const body = await readJsonBody(req)
              const list = historyListFor(store, kind, id)
              list.push(snapshotResource(record))
              if (list.length > 50) list.splice(0, list.length - 50)
              const now = Date.now()
              if (body.name !== undefined) record.name = String(body.name)
              if (body.source !== undefined) record.source = String(body.source)
              const nextData = body.data !== undefined ? body.data : body
              if (nextData && typeof nextData === 'object' && !Array.isArray(nextData)) {
                const cleaned = Object.assign({}, nextData)
                delete cleaned.id
                delete cleaned.kind
                delete cleaned.version
                delete cleaned.createdAt
                delete cleaned.updatedAt
                record.data = Object.assign({}, record.data && typeof record.data === 'object' ? record.data : {}, cleaned)
              }
              record.version = (Number(record.version) || 1) + 1
              record.updatedAt = now
              if (!validateResource(record)) {
                sendJson(res, 400, { ok: false, error: 'invalid resource: name required, kind must be known, version integer >= 1' })
                return
              }
              await store.save()
              sendJson(res, 200, { ok: true, resource: record })
              return
            }
            if (req.method === 'PATCH' && id !== undefined) {
              const record = table[id]
              if (!record) { sendJson(res, 404, { ok: false, error: 'not found' }); return }
              const body = await readJsonBody(req)
              const list = historyListFor(store, kind, id)
              list.push(snapshotResource(record))
              if (list.length > 50) list.splice(0, list.length - 50)
              const now = Date.now()
              if (body.name !== undefined) record.name = String(body.name)
              if (body.source !== undefined) record.source = String(body.source)
              if (body.data !== undefined && body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
                record.data = Object.assign({}, record.data && typeof record.data === 'object' ? record.data : {}, body.data)
              }
              record.version = (Number(record.version) || 1) + 1
              record.updatedAt = now
              if (!validateResource(record)) {
                sendJson(res, 400, { ok: false, error: 'invalid resource: name required, kind must be known, version integer >= 1' })
                return
              }
              await store.save()
              sendJson(res, 200, { ok: true, resource: record })
              return
            }
            if (req.method === 'DELETE' && id !== undefined) {
              if (!table[id]) { sendJson(res, 404, { ok: false, error: 'not found' }); return }
              delete table[id]
              const htable = historyTable(store, kind)
              delete htable[id]
              await store.save()
              sendJson(res, 200, { ok: true, removed: id })
              return
            }
            sendJson(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          if (req.method === 'POST' && pathname === '/plugins/creative-suite/convert/worldbook-to-preset') {
            const body = await readJsonBody(req)
            sendJson(res, 200, { ok: true, result: worldbookToPreset(body) })
            return
          }
          if (req.method === 'POST' && pathname === '/plugins/creative-suite/convert/preset-to-worldbook') {
            const body = await readJsonBody(req)
            sendJson(res, 200, { ok: true, result: presetToWorldbook(body) })
            return
          }
          if (req.method === 'POST' && pathname === '/plugins/creative-suite/convert/museai-to-worldbook') {
            const body = await readJsonBody(req)
            sendJson(res, 200, { ok: true, result: museaiToWorldbook(body) })
            return
          }
          sendJson(res, 404, { ok: false, error: 'not found' })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      }
    }), 'creative-suite: host routes')
  })
}

export { cloneResourceValue, historyTable, historyListFor, snapshotResource, resourceValueAtVersion, diffResourceValues, lineageFor, lineageGraphFor, briefOf, derivedFromOf, directChildrenOf, normalizeStore, emptyStore, openFileStore, buildMuseSystem, buildMusePrompt, buildMuseContext, parseAdventureChoices, splitAdventureNarration, normalizeMuseIdList, sanitizeSeedHistory, activateWorldbookEntries }

export default { name, inject, apply, modelCatalog }
