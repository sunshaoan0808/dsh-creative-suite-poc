import vm from 'node:vm'
import { randomUUID } from 'node:crypto'

const runtimes = new Map()

const LIMITS = Object.freeze({ scriptBytes: 256 * 1024, variablesBytes: 256 * 1024, messages: 2000, injections: 256, handlersPerEvent: 128, tools: 64, queueLength: 1024, eventDepth: 16, handlerTimeoutMs: 3000, toolTimeoutMs: 5000, slashCommands: 2000, auditEntries: 500 })
function valueBytes(value) { try { return Buffer.byteLength(JSON.stringify(value === undefined ? null : value)) } catch (_error) { return Number.POSITIVE_INFINITY } }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])) }
const UNSAFE_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
function hasUnsafePath(path) { return String(path || '').split('.').filter(Boolean).some(key => UNSAFE_PATH_KEYS.has(key)) }
function safeKeys(path) { return String(path || '').split('.').filter(Boolean).filter(key => !UNSAFE_PATH_KEYS.has(key)) }
function getPath(value, path) { return String(path || '').split('.').filter(Boolean).reduce((current, key) => current == null ? undefined : current[key], value) }
function setPath(value, path, next) {
  const keys = safeKeys(path)
  if (!keys.length || value == null || typeof value !== 'object') return false
  let target = value
  for (const key of keys.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {}
    target = target[key]
  }
  target[keys.at(-1)] = next
  return true
}
function deletePath(value, path) {
  const keys = safeKeys(path)
  if (!keys.length || value == null || typeof value !== 'object') return false
  let target = value
  for (const key of keys.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== 'object') return false
    target = target[key]
  }
  const last = keys.at(-1)
  if (!Object.prototype.hasOwnProperty.call(target, last)) return false
  delete target[last]
  return true
}
function resolveValue(expression, scope, root) {
  const source = String(expression || '').trim()
  if ((source.startsWith('"') && source.endsWith('"')) || (source.startsWith("'") && source.endsWith("'"))) return source.slice(1, -1)
  if (source === 'true') return true
  if (source === 'false') return false
  if (source === 'null') return null
  if (source === 'undefined') return undefined
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(source)) return Number(source)
  if (source === '.' || source === 'this') return scope
  if (source === '@index') return scope?.['@index']
  return getPath(scope, source) ?? getPath(root, source)
}
function renderText(template, variables) {
  const tokens = []
  const pattern = /\{\{\s*([\s\S]*?)\s*\}\}/g
  let cursor = 0
  for (const match of String(template || '').matchAll(pattern)) {
    if (match.index > cursor) tokens.push({ type: 'text', value: String(template).slice(cursor, match.index) })
    tokens.push({ type: 'tag', value: match[1].trim() }); cursor = match.index + match[0].length
  }
  if (cursor < String(template || '').length) tokens.push({ type: 'text', value: String(template).slice(cursor) })
  function parseNodes(index = 0, end = null) {
    const nodes = []
    while (index < tokens.length) {
      const token = tokens[index]
      if (token.type === 'tag' && (token.value === `/${end}` || (end === 'if' && token.value === 'else'))) return { nodes, index, stop: token.value }
      if (token.type === 'tag' && token.value.startsWith('#if ')) {
        const yes = parseNodes(index + 1, 'if')
        let no = []; index = yes.index
        if (yes.stop === 'else') { const alternate = parseNodes(index + 1, 'if'); no = alternate.nodes; index = alternate.index }
        nodes.push({ type: 'if', condition: token.value.slice(4), yes: yes.nodes, no }); index++; continue
      }
      if (token.type === 'tag' && token.value.startsWith('#each ')) {
        const body = parseNodes(index + 1, 'each'); nodes.push({ type: 'each', expression: token.value.slice(6), body: body.nodes }); index = body.index + 1; continue
      }
      nodes.push(token); index++
    }
    return { nodes, index, stop: null }
  }
  const ast = parseNodes().nodes
  function render(nodes, scope) {
    return nodes.map(node => {
      if (node.type === 'text') return node.value
      if (node.type === 'if') return resolveValue(node.condition, scope, variables) ? render(node.yes, scope) : render(node.no, scope)
      if (node.type === 'each') {
        const items = resolveValue(node.expression, scope, variables); if (!items) return ''
        return Object.entries(items).map(([key, item], index) => render(node.body, { ...(item && typeof item === 'object' ? item : { value: item }), '.': item, this: item, '@index': index, '@key': key })).join('')
      }
      if (node.value.startsWith('set ')) { const assignment = node.value.slice(4).match(/^([\w.$-]+)\s*=\s*([\s\S]*)$/); if (assignment) setPath(variables, assignment[1], resolveValue(assignment[2], scope, variables)); return '' }
      if (node.value.startsWith('/')) return ''
      const raw = node.value.startsWith('&') ? node.value.slice(1).trim() : node.value.replace(/^var::/, '')
      const value = resolveValue(raw, scope, variables)
      return node.value.startsWith('&') ? String(value ?? '') : escapeHtml(value ?? '')
    }).join('')
  }
  return render(ast, variables)
}
export function listCardTemplates(rawCard) {
  const extensions = rawCard?.data?.extensions || rawCard?.extensions || {}
  const templates = []
  if (typeof extensions.mes_template === 'string') templates.push({ id: 'mes_template', name: 'mes_template', source: 'extensions.mes_template', content: extensions.mes_template })
  const cardTemplates = rawCard?.data?.templates || rawCard?.templates || {}
  for (const [id, value] of Object.entries(cardTemplates)) templates.push({ id, name: value?.name || id, source: `templates.${id}`, content: String(value?.content || value || '') })
  return templates
}
let browserStarted = false
export function templateBrowserStatus() { return { started: browserStarted, available: false, running: browserStarted } }
export async function closeTemplateBrowser() { browserStarted = false }
export async function renderCardTemplate({ rawCard, variables = {}, messages = [], cardName = '', userName = '', templateId } = {}) {
  const templates = listCardTemplates(rawCard)
  const selected = templates.find(item => item.id === templateId) || templates[0]
  if (!selected) { const error = new Error('no template found'); error.code = 'NO_TEMPLATE'; throw error }
  const vars = { ...variables, char: cardName, user: userName, last_message: messages.at(-1)?.message || '' }
  const text = renderText(selected.content.replace(/\{\{var::([^}]+)\}\}/g, '{{ $1 }}'), vars)
  return { ok: true, templateId: selected.id, text, html: text, browser: templateBrowserStatus() }
}

// ---- MVU engine (P5-6): transient classification + retry + settlement watchdog ----
const TRANSIENT_MVU_PATTERNS = [
  /timed?\s?out/i,
  /econnreset|econnrefused|econnaborted|enotfound|eai_again|etimedout|epipe|eof|socket hang up/i,
  /fetch failed|failed to fetch|network error|networkerror|load failed/i,
  /\b429\b|too many requests|rate.?limit/i,
  /\b5\d\d\b|bad gateway|service unavailable|gateway timeout|internal server error/i,
  /模型返回空内容|empty (content|response|result|reply)/i
]
const PERMANENT_MVU_PATTERNS = [
  /未配置默认模型|no model configured|model not found|model unavailable/i,
  /已取消|cancelled by user|user abort|aborted by user/i,
  /unauthorized|forbidden|invalid api key|invalid request|invalid argument|bad request/i,
  /\b400\b|\b401\b|\b403\b|\b404\b/
]
export function isTransientMvuError(error) {
  const message = String(error?.message ?? error ?? '')
  if (!message) return true
  if (PERMANENT_MVU_PATTERNS.some(pattern => pattern.test(message))) return false
  return TRANSIENT_MVU_PATTERNS.some(pattern => pattern.test(message))
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0))) }
export async function withMvuRetry(task, { attempts = 3, baseDelayMs = 600, maxDelayMs = 8000, isTransient = isTransientMvuError, delayFn = sleep } = {}) {
  const maxAttempts = Math.max(1, Math.min(5, Number(attempts) || 3))
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await task(attempt)
      return { ok: true, result, attempts: attempt }
    } catch (error) {
      lastError = error
      const transient = isTransient(error)
      if (error && typeof error === 'object') {
        try { error.mvuAttempts = attempt; error.mvuTransient = transient } catch (_ignored) {}
      }
      if (!transient || attempt >= maxAttempts) throw error
      const backoff = Math.min(Math.max(0, Number(maxDelayMs) || 8000), Math.max(0, Number(baseDelayMs) || 0) * (2 ** (attempt - 1))) + Math.floor(Math.random() * 200)
      await delayFn(backoff)
    }
  }
  throw lastError || new Error('MVU task failed')
}
function assertVariablesBudget(variables) {
  if (valueBytes(variables) > LIMITS.variablesBytes) {
    const error = new Error(`variables 超出大小限制 (${LIMITS.variablesBytes} bytes)`)
    error.code = 'VARIABLES_TOO_LARGE'
    throw error
  }
}
function recordAudit(runtime, entry) {
  runtime.audit.push({ at: Date.now(), ...(entry && typeof entry === 'object' ? entry : { detail: entry }) })
  if (runtime.audit.length > LIMITS.auditEntries) runtime.audit.splice(0, runtime.audit.length - LIMITS.auditEntries)
}
function publicSettlement(record) {
  if (!record) return null
  return { id: record.id, turn: record.turn, label: record.label, status: record.status, startedAt: record.startedAt, timeoutMs: record.timeoutMs, deadline: record.deadline, finishedAt: record.finishedAt, detail: clone(record.detail), metadata: clone(record.metadata) }
}
function withTimeout(promise, timeoutMs, label) { let timer = null; return Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs) })]).finally(() => { if (timer) clearTimeout(timer) }) }
function createSandbox(runtime) { return vm.createContext({ emit: (event, payload) => runtime.emit(event, payload), eventOn: (event, handler) => runtime.eventOn(event, handler), registerTool: (name, handler) => runtime.registerTool(name, handler), updateVariablesWith: values => runtime.updateVariablesWith(values), getVariable: (path, fallback) => runtime.getVariable(path, fallback), setVariable: (path, value) => runtime.setVariable(path, value), deleteVariable: path => runtime.deleteVariable(path), resetVariables: next => runtime.resetVariables(next), console: { log: (...args) => runtime.logLines.push(args.join(' ')) } }) }

export function createHelperRuntime({ id = randomUUID(), cardId = '', rawCard = null, scripts = [], variables = {}, tools = [], messages = [], sessionId = '', chatId = '', cardName = '', userName = '', extensionSettings = {}, worldbook = {} } = {}) {
  const rawScripts = rawCard?.data?.extensions?.tavern_helper?.scripts || []
  scripts = scripts.length ? scripts : rawScripts
  const handlers = new Map()
  const queue = []
  const runtime = {
    id, lifecycle: 'running', startedAt: Date.now(), stoppedAt: null, stopReason: '', sessionId, chatId, cardName, userName,
    scripts, variables: clone(variables) || {}, messages: clone(messages) || [], injections: [], slashCommands: [], tools: new Map(), extensionSettings, worldbook, notifications: [], audit: [], diagnostics: [], logLines: [], eventLog: [], createdAt: Date.now(), updatedAt: Date.now(), limits: LIMITS,
    handlers, queue,
    settlements: new Map(), settlementSeq: 0, settlementTimeoutMs: 15000, watchdog: null,
    event(event, payload) { if (this.lifecycle !== 'running') throw new Error(`runtime 已停止: ${this.stopReason || 'stopped'}`); this.eventLog.push({ event, payload, at: Date.now() }); this.updatedAt = Date.now(); const list = handlers.get(event) || []; return Promise.all(list.map(handler => handler(payload))).then(() => ({ variables: clone(this.variables) })) },
    emit(event, payload) { try { return Promise.resolve(this.event(event, payload)) } catch (error) { return Promise.reject(error) } },
    callTool(name, args) { if (this.lifecycle !== 'running') return Promise.reject(new Error(`runtime 已停止: ${this.stopReason || 'stopped'}`)); const tool = this.tools.get(name); if (!tool) return Promise.reject(new Error(`工具不存在: ${name}`)); return Promise.resolve(typeof tool.handler === 'function' ? tool.handler(args) : tool.fn?.(args)).then(result => clone(result)) },
    registerTool(name, handler) { this.tools.set(name, { name, handler }); return true },
    eventOn(name, handler) { const list = handlers.get(name) || []; list.push(handler); handlers.set(name, list); return true },
    getVariable(path, fallback) {
      if (path == null || String(path).trim() === '') return clone(this.variables)
      const value = getPath(this.variables, String(path))
      return value === undefined ? fallback : clone(value)
    },
    setVariable(path, value) {
      const key = String(path || '').trim()
      if (!key) { const error = new Error('变量名不能为空'); error.code = 'BAD_VARIABLE_PATH'; throw error }
      if (hasUnsafePath(key)) { const error = new Error(`变量路径无效: ${key}`); error.code = 'BAD_VARIABLE_PATH'; throw error }
      const next = clone(this.variables) || {}
      if (!setPath(next, key, clone(value))) { const error = new Error(`变量路径无效: ${key}`); error.code = 'BAD_VARIABLE_PATH'; throw error }
      assertVariablesBudget(next)
      this.variables = next
      this.updatedAt = Date.now()
      recordAudit(this, { type: 'variable-set', key })
      return this.getVariable(key)
    },
    deleteVariable(path) {
      const key = String(path || '').trim()
      if (!key || hasUnsafePath(key)) return false
      const next = clone(this.variables) || {}
      const existed = deletePath(next, key)
      if (!existed) return false
      this.variables = next
      this.updatedAt = Date.now()
      recordAudit(this, { type: 'variable-delete', key })
      return true
    },
    updateVariablesWith(values) {
      const patch = values && typeof values === 'object' && !Array.isArray(values) ? clone(values) : {}
      const next = { ...(clone(this.variables) || {}), ...patch }
      assertVariablesBudget(next)
      this.variables = next
      this.updatedAt = Date.now()
      recordAudit(this, { type: 'variable-merge', keys: Object.keys(patch) })
      return clone(this.variables)
    },
    resetVariables(next = {}) {
      if (!next || typeof next !== 'object' || Array.isArray(next)) { const error = new Error('variables 必须是 JSON 对象'); error.code = 'BAD_VARIABLES'; throw error }
      const fresh = clone(next)
      assertVariablesBudget(fresh)
      this.variables = fresh
      this.updatedAt = Date.now()
      recordAudit(this, { type: 'variable-reset', keys: Object.keys(fresh) })
      return clone(this.variables)
    },
    beginSettlement({ turn = 0, label = '', timeoutMs, metadata } = {}) {
      if (this.lifecycle !== 'running') throw new Error(`runtime 已停止: ${this.stopReason || 'stopped'}`)
      const effectiveTimeout = Math.max(100, Math.min(300000, Number(timeoutMs ?? this.settlementTimeoutMs) || 15000))
      this.settlementSeq += 1
      const startedAt = Date.now()
      const record = { id: `mvu-${this.settlementSeq}-${randomUUID().slice(0, 8)}`, turn: Number(turn) || 0, label: String(label || ''), status: 'pending', startedAt, timeoutMs: effectiveTimeout, deadline: startedAt + effectiveTimeout, finishedAt: null, detail: null, metadata: metadata == null ? null : clone(metadata) }
      this.settlements.set(record.id, record)
      recordAudit(this, { type: 'settlement-begin', settlementId: record.id, turn: record.turn, label: record.label })
      return publicSettlement(record)
    },
    completeSettlement(id, result = {}) {
      const record = this.settlements.get(String(id || ''))
      if (!record) return null
      if (record.status !== 'pending') return publicSettlement(record)
      const payload = result && typeof result === 'object' ? result : {}
      try {
        if (payload.variables && typeof payload.variables === 'object') this.updateVariablesWith(payload.variables)
      } catch (error) {
        record.status = 'failed'
        record.finishedAt = Date.now()
        record.detail = error instanceof Error ? error.message : String(error)
        recordAudit(this, { type: 'settlement-failed', settlementId: record.id, reason: record.detail })
        throw error
      }
      record.status = 'settled'
      record.finishedAt = Date.now()
      record.detail = payload.detail !== undefined ? clone(payload.detail) : (payload.ok !== undefined ? { ok: payload.ok } : null)
      this.updatedAt = record.finishedAt
      recordAudit(this, { type: 'settlement-settled', settlementId: record.id, turn: record.turn })
      return publicSettlement(record)
    },
    failSettlement(id, error) {
      const record = this.settlements.get(String(id || ''))
      if (!record) return null
      if (record.status !== 'pending') return publicSettlement(record)
      record.status = 'failed'
      record.finishedAt = Date.now()
      record.detail = error instanceof Error ? error.message : String(error)
      this.updatedAt = record.finishedAt
      recordAudit(this, { type: 'settlement-failed', settlementId: record.id, reason: record.detail })
      return publicSettlement(record)
    },
    sweepSettlements(now = Date.now()) {
      const expired = []
      for (const record of this.settlements.values()) {
        if (record.status !== 'pending' || Number(now) < record.deadline) continue
        record.status = 'timeout'
        record.finishedAt = Number(now)
        record.detail = `settlement 超时 (${record.timeoutMs}ms)`
        this.diagnostics.push({ settlementId: record.id, turn: record.turn, label: record.label, message: record.detail, at: Number(now) })
        recordAudit(this, { type: 'settlement-timeout', settlementId: record.id, turn: record.turn })
        expired.push(publicSettlement(record))
      }
      if (expired.length) this.updatedAt = Number(now)
      return expired
    },
    settlementStatus(now = Date.now()) {
      this.sweepSettlements(now)
      const counts = { pending: 0, settled: 0, timeout: 0, failed: 0 }
      const pending = []
      for (const record of this.settlements.values()) {
        if (counts[record.status] !== undefined) counts[record.status] += 1
        if (record.status === 'pending') pending.push({ id: record.id, turn: record.turn, label: record.label, remainingMs: Math.max(0, record.deadline - Number(now)) })
      }
      return { ...counts, total: this.settlements.size, pendingItems: pending }
    },
    startSettlementWatchdog({ intervalMs = 1000, timeoutMs, onTimeout } = {}) {
      this.stopSettlementWatchdog()
      if (timeoutMs !== undefined) this.settlementTimeoutMs = Math.max(100, Math.min(300000, Number(timeoutMs) || 15000))
      const every = Math.max(50, Math.min(60000, Number(intervalMs) || 1000))
      const timer = setInterval(() => {
        try {
          const expired = this.sweepSettlements()
          if (expired.length && typeof this.watchdog?.onTimeout === 'function') this.watchdog.onTimeout(expired)
        } catch (_error) {}
      }, every)
      if (typeof timer.unref === 'function') timer.unref()
      this.watchdog = { running: true, intervalMs: every, timer, onTimeout: typeof onTimeout === 'function' ? onTimeout : null }
      return { running: true, intervalMs: every }
    },
    stopSettlementWatchdog() {
      if (this.watchdog?.timer) { try { clearInterval(this.watchdog.timer) } catch (_error) {} }
      if (this.watchdog) this.watchdog.running = false
      return true
    },
    snapshot() { return { id: this.id, lifecycle: this.lifecycle, startedAt: this.startedAt, stoppedAt: this.stoppedAt, stopReason: this.stopReason, sessionId: this.sessionId, chatId: this.chatId, cardName: this.cardName, userName: this.userName, scripts: this.scripts, variables: clone(this.variables), messages: clone(this.messages), injections: clone(this.injections), slashCommands: clone(this.slashCommands), tools: Array.from(this.tools.keys()), extensionSettings: clone(this.extensionSettings), worldbook: clone(this.worldbook), notifications: clone(this.notifications), audit: clone(this.audit), limits: LIMITS, diagnostics: clone(this.diagnostics), logLines: clone(this.logLines.slice(-80)), eventLog: clone(this.eventLog.slice(-80)), settlements: this.settlementStatus(), watchdog: { running: !!this.watchdog?.running, intervalMs: this.watchdog?.intervalMs || 0, defaultTimeoutMs: this.settlementTimeoutMs }, createdAt: this.createdAt, updatedAt: this.updatedAt } },
    stop(reason = 'stopped') { this.lifecycle = 'stopped'; this.stopReason = reason; this.stoppedAt = Date.now(); this.stopSettlementWatchdog(); handlers.clear(); queue.length = 0; this.tools.clear(); this.updatedAt = this.stoppedAt; return this.snapshot() },
    listTools() { return Array.from(this.tools.keys()) },
    unregisterTool(name) { return this.tools.delete(String(name)) }
  }
  for (const tool of tools || []) if (tool?.name) runtime.tools.set(tool.name, tool)
  const context = createSandbox(runtime)
  for (const script of scripts || []) { try { if (valueBytes(script.content) > LIMITS.scriptBytes) throw new Error('script too large'); vm.runInContext(String(script.content || ''), context, { filename: script.name || 'helper-script', timeout: 1000 }) } catch (error) { runtime.diagnostics.push({ scriptId: script.id, message: error.message, at: Date.now() }) } }
  runtimes.set(id, runtime); return runtime
}
export function getHelperRuntime(id) { return runtimes.get(String(id || '')) || null }
export function deleteHelperRuntime(id) { return runtimes.delete(String(id || '')) }
export function helperRuntimeCount() { return runtimes.size }
