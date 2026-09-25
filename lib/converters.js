// DSH creative-suite POC: worldbook / preset / museai 互转纯函数.
// 全部纯函数:无 IO、无副作用,缺字段时给默认值,不抛异常(输入非对象时按空处理).

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function str(value, fallback = '') {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function entryKeys(entry) {
  const e = asObject(entry)
  if (Array.isArray(e.keys)) return e.keys.map(v => str(v).trim()).filter(Boolean)
  if (Array.isArray(e.key)) return e.key.map(v => str(v).trim()).filter(Boolean)
  if (typeof e.key === 'string' && e.key.trim()) return e.key.split(/[,，]/).map(v => v.trim()).filter(Boolean)
  return []
}

// 世界书 -> 预设:每条 entry 转成一条 system prompt,keys 存入 label 以便逆转.
export function worldbookToPreset(worldbook) {
  const wb = asObject(worldbook)
  const entries = asArray(wb.entries ?? wb.data?.entries)
  return {
    name: str(wb.name ?? wb.title),
    prompts: entries.map(entry => {
      const e = asObject(entry)
      return {
        role: 'system',
        label: entryKeys(e).join(','),
        content: str(e.content ?? e.text ?? ''),
        enabled: e.enabled !== false && e.disable !== true
      }
    }),
    settings: { source: 'worldbook', entryCount: entries.length }
  }
}

// 预设 -> 世界书:每条 prompt 转成一条 entry.
export function presetToWorldbook(preset) {
  const p = asObject(preset)
  const prompts = asArray(p.prompts ?? p.data?.prompts)
  return {
    name: str(p.name ?? p.title),
    entries: prompts.map((prompt, index) => {
      const pr = asObject(prompt)
      const label = str(pr.label).trim()
      const role = str(pr.role).trim()
      return {
        uid: Number.isInteger(pr.uid) ? pr.uid : index + 1,
        keys: label ? label.split(',').map(v => v.trim()).filter(Boolean) : role ? [role] : [],
        content: str(pr.content ?? pr.text ?? ''),
        enabled: pr.enabled !== false
      }
    })
  }
}

// 世界书 -> museai 文档:每条 entry 转成一页,keys 拼成 heading.
export function worldbookToMuseai(worldbook) {
  const wb = asObject(worldbook)
  const entries = asArray(wb.entries ?? wb.data?.entries)
  return {
    title: str(wb.name ?? wb.title),
    pages: entries.map((entry, index) => {
      const e = asObject(entry)
      const keys = entryKeys(e)
      return {
        heading: keys.length ? keys.join('/') : '条目' + (Number.isInteger(e.uid) ? e.uid : index + 1),
        body: str(e.content ?? e.text ?? '')
      }
    }),
    meta: { source: 'worldbook', count: entries.length }
  }
}

// museai 文档 -> 世界书.
export function museaiToWorldbook(doc) {
  const d = asObject(doc)
  const pages = asArray(d.pages ?? d.data?.pages)
  return {
    name: str(d.title ?? d.name),
    entries: pages.map((page, index) => {
      const pg = asObject(page)
      const heading = str(pg.heading).trim()
      return {
        uid: index + 1,
        keys: heading ? [heading] : [],
        content: str(pg.body ?? pg.content ?? pg.text ?? ''),
        enabled: true
      }
    })
  }
}

// 预设 -> museai 文档.
export function presetToMuseai(preset) {
  const p = asObject(preset)
  const prompts = asArray(p.prompts ?? p.data?.prompts)
  return {
    title: str(p.name ?? p.title),
    pages: prompts.map((prompt, index) => {
      const pr = asObject(prompt)
      const label = str(pr.label).trim()
      const role = str(pr.role).trim()
      return {
        heading: label || (role ? role + '#' + (index + 1) : 'prompt#' + (index + 1)),
        body: str(pr.content ?? pr.text ?? '')
      }
    }),
    meta: { source: 'preset', count: prompts.length }
  }
}

// museai 文档 -> 预设.
export function museaiToPreset(doc) {
  const d = asObject(doc)
  const pages = asArray(d.pages ?? d.data?.pages)
  return {
    name: str(d.title ?? d.name),
    prompts: pages.map(page => {
      const pg = asObject(page)
      return {
        role: 'system',
        label: str(pg.heading),
        content: str(pg.body ?? pg.content ?? pg.text ?? ''),
        enabled: true
      }
    }),
    settings: { source: 'museai', pageCount: pages.length }
  }
}
