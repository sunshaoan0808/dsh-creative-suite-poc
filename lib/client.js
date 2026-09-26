window.__ModuleLoader__.load({
  id: 'dsh-creative-suite-poc',
  factory: (require) => {
    const react = require('react')
    const inject = ['slots']

    // P0-6: 统一 mode taxonomy —— sidebar MODES 与 workspaceModes 共用同一常量。
    // host 侧全局 taxonomy 待定（后续由 host 定义全局模式表并下发），POC 内以此表为准：
    // sidebar 取 scopes 含 'sidebar' 的子集（入口模式），工作台取含 'workspace' 的子集（内容面板）。
    // P4: 文本集中管理——默认中文包，后续可按 locale 切换。
    // 用法：t('mode.tavern')；增语言时加 I18N[locale] 即可。
    const I18N = {
      zh: {
        'mode.coding': '编码', 'mode.tavern': '酒馆', 'mode.tavernWorkspace': '酒馆桥接',
        'mode.museai': 'MuseAI', 'mode.story': 'Story', 'mode.resources': '资源库',
        'mode.cards': '卡片工作台', 'mode.regex': '正则预览',
        'kind.cards': '人物卡', 'kind.worldbooks': '世界书', 'kind.presets': '预设',
        'kind.styles': '文风', 'kind.novels': '小说', 'kind.scripts': '剧本',
        'kind.summaries': '反馈', 'kind.stories': '故事'
      }
    }
    const LOCALE = 'zh'
    function t(key) {
      const pack = I18N[LOCALE] || I18N.zh
      return pack[key] !== undefined ? pack[key] : key
    }
    
    // P6: 样式缓存——提取重复样式为常量，减少渲染时的对象创建开销。
    const FLEX_ROW = { display: 'flex', gap: '5px', flexWrap: 'wrap' }
    const FLEX_ROW_CENTER = { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }
    const FLEX_COLUMN = { display: 'flex', flexDirection: 'column' }
    const BUTTON_BASE = { 
      className: 'dsh-tavern-entry-btn',
      style: { 
        width: 'auto', 
        margin: 0, 
        padding: '5px 9px',
        borderRadius: '7px',
        border: '1px solid rgba(255,255,255,.18)',
        background: 'rgba(0,0,0,.25)',
        color: 'inherit'
      } 
    }
    const INPUT_BASE = {
      style: {
        boxSizing: 'border-box',
        width: '100%',
        padding: '6px 8px',
        borderRadius: '7px',
        border: '1px solid rgba(255,255,255,.18)',
        background: 'rgba(0,0,0,.25)',
        color: 'inherit',
        resize: 'vertical'
      }
    }
    const TEXTAREA_BASE = {
      style: {
        boxSizing: 'border-box',
        width: '100%',
        padding: '6px 8px',
        borderRadius: '7px',
        border: '1px solid rgba(255,255,255,.18)',
        background: 'rgba(0,0,0,.25)',
        color: 'inherit',
        resize: 'vertical'
      }
    }
    
    const MODE_TAXONOMY = [
      { id: 'coding', label: t('mode.coding'), scopes: ['sidebar'], sidebarOrder: 0 },
      { id: 'tavern', label: t('mode.tavern'), workspaceLabel: t('mode.tavernWorkspace'), scopes: ['sidebar', 'workspace'], sidebarOrder: 1, workspaceOrder: 5 },
      { id: 'museai', label: t('mode.museai'), scopes: ['sidebar', 'workspace'], sidebarOrder: 2, workspaceOrder: 4 },
      { id: 'story', label: t('mode.story'), scopes: ['sidebar', 'workspace'], sidebarOrder: 3, workspaceOrder: 3 },
      { id: 'resources', label: t('mode.resources'), scopes: ['workspace'], workspaceOrder: 0 },
      { id: 'cards', label: t('mode.cards'), scopes: ['workspace'], workspaceOrder: 1 },
      { id: 'regex', label: t('mode.regex'), scopes: ['workspace'], workspaceOrder: 2 }
    ]

    const MODES = MODE_TAXONOMY
      .filter(item => item.scopes.includes('sidebar'))
      .sort((a, b) => (a.sidebarOrder || 0) - (b.sidebarOrder || 0))
      .map(item => ({ id: item.id, label: item.label }))

    const RESOURCE_KINDS = [
      { id: 'cards', label: t('kind.cards') },
      { id: 'worldbooks', label: t('kind.worldbooks') },
      { id: 'presets', label: t('kind.presets') },
      { id: 'styles', label: t('kind.styles') },
      { id: 'novels', label: t('kind.novels') },
      { id: 'scripts', label: t('kind.scripts') },
      { id: 'summaries', label: t('kind.summaries') },
      { id: 'stories', label: t('kind.stories') }
    ]

    // P3: 大文本输入防抖——textarea 高频 onChange 先写 ref 即时显示，
    // 状态更新经 150ms debounce，避免每次击键全树重渲染。
    function useDebouncedState(initial, delay = 150) {
      const [value, setValue] = react.useState(initial)
      const timerRef = react.useRef(null)
      const setDebounced = react.useCallback(next => {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => { setValue(next) }, delay)
      }, [delay])
      react.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])
      return [value, setDebounced, setValue]
    }

    // 文件导入通用 helper：input[type=file] -> 文本。供小说/世界书/角色卡/预设/正则复用。
    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('文件读取失败'))
        reader.readAsText(file)
      })
    }

    function CreativeSuitePoc() {
      const [open, setOpen] = react.useState(false)
      const [mode, setMode] = react.useState('coding')
      const [status, setStatus] = react.useState(null)
      const [resourceKind, setResourceKind] = react.useState('cards')
      const [resourceSummary, setResourceSummary] = react.useState({})
      const [resourceList, setResourceList] = react.useState([])
      const [selectedResource, setSelectedResource] = react.useState(null)
      const [refreshKey, setRefreshKey] = react.useState(0)
      const [novelName, setNovelName] = react.useState('')
      const [novelText, setNovelTextDebounced, setNovelText] = useDebouncedState('')
      const [pipelineBusy, setPipelineBusy] = react.useState(false)
      const [pipelineResult, setPipelineResult] = react.useState(null)
      const [pipelineError, setPipelineError] = react.useState('')
      const [feedbackText, setFeedbackTextDebounced, setFeedbackText] = useDebouncedState('')
      const [feedbackChatId, setFeedbackChatId] = react.useState('')
      const [tavernChats, setTavernChats] = react.useState([])
      const [feedbackBusy, setFeedbackBusy] = react.useState(false)
      const [feedbackResult, setFeedbackResult] = react.useState(null)
      const [feedbackError, setFeedbackError] = react.useState('')
      const [feedbackContentBusy, setFeedbackContentBusy] = react.useState(false)
      const [feedbackContentResult, setFeedbackContentResult] = react.useState(null)
      const [feedbackContentError, setFeedbackContentError] = react.useState('')
      const [resourceSearch, setResourceSearch] = react.useState('')
      const [resourcePageSize, setResourcePageSize] = react.useState(10)
      const [resourcePage, setResourcePage] = react.useState(1)
      const [resourceTotal, setResourceTotal] = react.useState(0)
      const [resourceJump, setResourceJump] = react.useState('1')
      const [error, setError] = react.useState('')

      // P5: request() 已合并为 requestJson()，此处保留别名兼容。
      async function request(path) {
        return requestJson(path)
      }

      async function runNovelPipeline(importToTavern) {
        if (!novelText.trim()) {
          setPipelineError('请先粘贴小说文本')
          return
        }
        setPipelineBusy(true)
        setPipelineError('')
        setPipelineResult(null)
        try {
          const response = await fetch('/plugins/creative-suite/pipeline/novel-to-card', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              name: novelName.trim() || '未命名小说',
              text: novelText,
              importToTavern: importToTavern === true,
              maxCharacters: 1
            })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setPipelineResult(payload)
          setRefreshKey(value => value + 1)
        } catch (err) {
          setPipelineError(String(err && err.message || err))
        } finally {
          setPipelineBusy(false)
        }
      }

      async function runFeedback() {
        if (!feedbackText.trim() && !feedbackChatId.trim()) {
          setFeedbackError('请提供 transcript 或 Tavern chatId')
          return
        }
        setFeedbackBusy(true)
        setFeedbackError('')
        setFeedbackResult(null)
        try {
          const response = await fetch('/plugins/creative-suite/feedback/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              name: 'Tavern 会话反馈',
              chatId: feedbackChatId.trim(),
              text: feedbackText
            })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setFeedbackResult(payload)
          setRefreshKey(value => value + 1)
        } catch (err) {
          setFeedbackError(String(err && err.message || err))
        } finally {
          setFeedbackBusy(false)
        }
      }

      async function runFeedbackToContent() {
        const summaryId = feedbackResult && feedbackResult.summary && feedbackResult.summary.id
        if (!summaryId) {
          setFeedbackContentError('请先生成一条反馈记录')
          return
        }
        setFeedbackContentBusy(true)
        setFeedbackContentError('')
        setFeedbackContentResult(null)
        try {
          const response = await fetch('/plugins/creative-suite/pipeline/feedback-to-content', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ summaryId, importToTavern: false })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setFeedbackContentResult(payload)
          setRefreshKey(value => value + 1)
        } catch (err) {
          setFeedbackContentError(String(err && err.message || err))
        } finally {
          setFeedbackContentBusy(false)
        }
      }

      react.useEffect(() => {
        let stopped = false
        request('/plugins/creative-suite/status')
          .then(value => { if (!stopped) setStatus(value) })
          .catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [])

      react.useEffect(() => {
        if (!open) return undefined
        let stopped = false
        fetch('/plugins/creative-suite/tavern/chats', { headers: { accept: 'application/json' } })
          .then(response => response.json())
          .then(payload => { if (!stopped && payload && payload.ok) setTavernChats(payload.chats || []) })
          .catch(() => { if (!stopped) setTavernChats([]) })
        return () => { stopped = true }
      }, [open])

      react.useEffect(() => {
        if (!open) return undefined
        let stopped = false
        async function load() {
          try {
            const summary = await request('/plugins/creative-suite/resources')
            if (!stopped) {
              setResourceSummary(summary.resources || {})
              setError('')
            }
          } catch (err) {
            if (!stopped) setError(String(err && err.message || err))
          }
        }
        async function loadList() {
          try {
            const offset = (resourcePage - 1) * resourcePageSize
            const resp = await request(`/plugins/creative-suite/resources/${resourceKind}?kind=${resourceKind}&search=${encodeURIComponent(resourceSearch)}&limit=${resourcePageSize}&offset=${offset}`)
            if (!stopped) {
              setResourceList(resp.resources || [])
              setResourceTotal(resp.total || 0)
              setSelectedResource(null)
            }
          } catch (err) {
            if (!stopped) setError(String(err && err.message || err))
          }
        }
        load()
        loadList()
        return () => { stopped = true }
      }, [open, resourceKind, resourceSearch, resourcePage, resourcePageSize, refreshKey])

      const modeButtons = react.createElement('div', {
        style: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }
      }, MODES.map(item => react.createElement('button', {
        key: item.id,
        type: 'button',
        className: 'dsh-tavern-entry-btn',
        // P0: 可访问性——选中态按钮暴露 aria-pressed。
        'aria-pressed': mode === item.id,
        style: {
          width: 'auto', margin: 0, padding: '5px 9px',
          opacity: mode === item.id ? 1 : 0.62,
          borderColor: mode === item.id ? 'rgba(154,98,47,.85)' : undefined
        },
        onClick: () => setMode(item.id)
      }, item.label)))

      const resourceTabs = react.createElement('div', {
        style: { display: 'flex', gap: '5px', flexWrap: 'wrap', margin: '8px 0' }
      }, RESOURCE_KINDS.map(item => {
        const count = resourceSummary[item.id]?.count
        return react.createElement('button', {
          key: item.id,
          type: 'button',
          className: 'dsh-tavern-entry-btn',
          // P0: 可访问性——选中态按钮暴露 aria-pressed。
          'aria-pressed': resourceKind === item.id,
          style: {
            width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px',
            // 移动端窄屏：按钮不被挤压变形，整词换行不断字。
            flexShrink: 0, whiteSpace: 'nowrap',
            opacity: resourceKind === item.id ? 1 : 0.6
          },
          onClick: () => { setResourceKind(item.id); setResourcePage(1); setResourceJump('1') }
        }, `${item.label}${count === undefined ? '' : ' ' + count}`)
      }))

      const totalPages = Math.max(1, Math.ceil((resourceTotal || 0) / (resourcePageSize || 10) || 0) || 1)
      const resourceSearchBar = react.createElement('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', margin: '6px 0' } },
        react.createElement('input', {
          value: resourceSearch,
          placeholder: '搜索关键词',
          onChange: event => { setResourceSearch(event.target.value); setResourcePage(1); setResourceJump('1') },
          style: { flex: '1 1 160px', padding: '5px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.25)', color: 'inherit', fontSize: '11px' }
        })
      )
      // 文件导入入口：角色卡（JSON/PNG）/世界书/预设 JSON -> 后端 /import/*。
      const IMPORT_MAP = {
        cards: { route: '/plugins/creative-suite/import/card', accept: '.json,.png', label: '导入角色卡' },
        worldbooks: { route: '/plugins/creative-suite/import/worldbook', accept: '.json', label: '导入世界书' },
        presets: { route: '/plugins/creative-suite/import/preset', accept: '.json', label: '导入预设' }
      }
      // 角色卡导入：.png 读 dataUrl（后端解 tEXt chara），.json 读文本。
      function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(new Error('文件读取失败'))
          reader.readAsDataURL(file)
        })
      }
      const importEntry = IMPORT_MAP[resourceKind] ? react.createElement('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', margin: '6px 0' } },
        react.createElement('label', {
          className: 'dsh-tavern-entry-btn',
          style: { width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }
        }, IMPORT_MAP[resourceKind].label,
          react.createElement('input', {
            type: 'file', accept: IMPORT_MAP[resourceKind].accept, style: { display: 'none' },
            onChange: async event => {
              const file = event.target.files && event.target.files[0]
              if (!file) return
              setError('')
              try {
                const isPng = /\.png$/i.test(file.name || '')
                let payloadBody
                if (isPng) {
                  const dataUrl = await readFileAsDataUrl(file)
                  if (!dataUrl) { setError('文件内容为空'); return }
                  payloadBody = { name: file.name.replace(/\.[^.]+$/, ''), image: dataUrl }
                } else {
                  const text = await readFileAsText(file)
                  if (!text.trim()) { setError('文件内容为空'); return }
                  // 后端 normalize*Input 支持 {text}（内含 JSON.parse），直接透传。
                  payloadBody = { name: file.name.replace(/\.[^.]+$/, ''), text }
                }
                await requestJson(IMPORT_MAP[resourceKind].route, {
                  method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
                  body: JSON.stringify(payloadBody)
                })
                setRefreshKey(value => value + 1)
              } catch (err) { setError(String(err && err.message || err)) }
              event.target.value = ''
            }
          })
        )
      ) : null
      const resourcePager = react.createElement('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center', margin: '6px 0', fontSize: '11px' } },
        react.createElement('select', {
          value: resourcePageSize,
          onChange: event => { setResourcePageSize(Number(event.target.value)); setResourcePage(1); setResourceJump('1') },
          // 移动端窄屏：控件不被挤压。
          style: { padding: '4px 6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.25)', color: 'inherit', fontSize: '11px', flexShrink: 0 }
        },
          [5, 10, 20, 50].map(n => react.createElement('option', { key: n, value: n }, `${n}/页`))
        ),
        react.createElement('button', {
          type: 'button', className: 'dsh-tavern-entry-btn',
          disabled: resourcePage <= 1,
          style: { width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px', flexShrink: 0, whiteSpace: 'nowrap' },
          onClick: () => { const v = Math.max(1, resourcePage - 1); setResourcePage(v); setResourceJump(String(v)) }
        }, '上一页'),
        react.createElement('span', { style: { opacity: .8 } }, `第 ${resourcePage} / ${totalPages} 页 · 共 ${resourceTotal || 0} 条`),
        react.createElement('button', {
          type: 'button', className: 'dsh-tavern-entry-btn',
          disabled: resourcePage >= totalPages,
          style: { width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px', flexShrink: 0, whiteSpace: 'nowrap' },
          onClick: () => { const v = Math.min(totalPages, resourcePage + 1); setResourcePage(v); setResourceJump(String(v)) }
        }, '下一页'),
        react.createElement('input', {
          value: resourceJump,
          onChange: event => setResourceJump(event.target.value),
          placeholder: '跳页',
          style: { width: '56px', padding: '4px 6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.25)', color: 'inherit', fontSize: '11px', flexShrink: 0 }
        }),
        react.createElement('button', {
          type: 'button', className: 'dsh-tavern-entry-btn',
          style: { width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px', flexShrink: 0, whiteSpace: 'nowrap' },
          onClick: () => { const v = Math.min(totalPages, Math.max(1, parseInt(resourceJump, 10) || 1)); setResourcePage(v); setResourceJump(String(v)) }
        }, '跳转')
      )

      const resourceRows = react.createElement('div', {
        style: { maxHeight: '180px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }
      }, resourceList.length === 0
        ? react.createElement('div', { style: { opacity: .6 } }, '暂无资源')
        : resourceList.map(item => react.createElement('button', {
            key: item.id,
            type: 'button',
            className: 'dsh-tavern-entry-btn',
            style: { width: '100%', margin: 0, textAlign: 'left', padding: '5px 8px' },
            onClick: () => setSelectedResource(item)
          }, `${item.name || item.id} · ${item.source || item.kind}`)))

      const detail = selectedResource ? react.createElement('pre', {
        style: {
          margin: '8px 0 0', padding: '8px', maxHeight: '160px', overflow: 'auto',
          borderRadius: '8px', background: 'rgba(0,0,0,.28)', fontSize: '10px',
          whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'
        }
      }, JSON.stringify(selectedResource, null, 2).slice(0, 4000)) : null

      const panel = open ? react.createElement('div', {
        style: {
          position: 'fixed', right: '12px', bottom: '12px', zIndex: 2147483000,
          width: 'min(430px, calc(100vw - 24px))', maxHeight: 'calc(100vh - 24px)',
          overflow: 'auto', padding: '12px', borderRadius: '12px',
          border: '1px solid rgba(154,98,47,.45)', background: 'rgba(22,18,14,.96)',
          color: '#f4e7d4', boxShadow: '0 12px 40px rgba(0,0,0,.45)', fontSize: '12px'
        }
      },
        react.createElement('div', { style: { fontWeight: 700, marginBottom: '8px' } }, 'DSH Creative Suite POC'),
        modeButtons,
        react.createElement('div', { style: { opacity: .75, marginBottom: '8px' } },
          status ? `已加载：${status.name} ${status.version}` : (error || '加载状态中…')),
        // N8：mode 切到 museai 时挂载 MuseAI 工作台（含聊天/冒险/穿书/羁绊页）；其余 mode 保持资源库视图。
        mode === 'museai' ? react.createElement(MuseAIPane) : react.createElement(react.Fragment, null,
        react.createElement('div', { style: { fontWeight: 700, marginTop: '10px' } }, '资源库'),
        resourceTabs,
        resourceSearchBar,
        importEntry,
        resourceRows,
        resourcePager,
        detail,
        react.createElement('div', { style: { marginTop: '10px', borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: '10px' } },
          react.createElement('div', { style: { fontWeight: 700, marginBottom: '6px' } }, '小说一键转人物卡'),
          react.createElement('input', {
            value: novelName,
            placeholder: '小说名（可空）',
            onChange: event => setNovelName(event.target.value),
            style: { boxSizing: 'border-box', width: '100%', marginBottom: '6px', padding: '6px 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.25)', color: 'inherit' }
          }),
          react.createElement('textarea', {
            placeholder: '粘贴小说文本，建议先放一章或一段片段',
            // P3: 大文本非受控 + debounce 同步 state，避免击键卡顿。
            defaultValue: novelText,
            onChange: event => setNovelTextDebounced(event.target.value),
            style: { boxSizing: 'border-box', width: '100%', minHeight: '84px', marginBottom: '6px', padding: '6px 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.25)', color: 'inherit', resize: 'vertical' }
          }),
          // 小说文件导入：.txt/.md -> textarea state（文件名回填小说名）。
          react.createElement('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' } },
            react.createElement('label', {
              className: 'dsh-tavern-entry-btn',
              style: { width: 'auto', margin: 0, padding: '5px 9px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }
            }, '从文件导入小说',
              react.createElement('input', {
                type: 'file', accept: '.txt,.md,.text', style: { display: 'none' },
                onChange: async event => {
                  const file = event.target.files && event.target.files[0]
                  if (!file) return
                  setPipelineError('')
                  try {
                    const text = await readFileAsText(file)
                    if (!text.trim()) { setPipelineError('文件内容为空'); return }
                    setNovelText(text)
                    if (!novelName) setNovelName(file.name.replace(/\.[^.]+$/, ''))
                    try {
                      const payload = await requestJson('/plugins/creative-suite/import/novel', {
                        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
                        body: JSON.stringify({ name: (novelName || file.name.replace(/\.[^.]+$/, '') || '未命名小说'), text })
                      })
                      setPipelineResult({ importedNovel: { id: payload.resource.id, name: payload.resource.name, charCount: payload.resource.data.charCount, chapterCount: payload.resource.data.chapterCount } })
                      setRefreshKey(value => value + 1)
                    } catch (err) { setPipelineError(String(err && err.message || err)) }
                  } catch (err) { setPipelineError(String(err && err.message || err)) }
                  event.target.value = ''
                }
              })
            )
          ),
          react.createElement('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' } },
            react.createElement('button', {
              type: 'button', className: 'dsh-tavern-entry-btn', disabled: pipelineBusy,
              // P0: 可访问性——忙碌态暴露 aria-busy。
              'aria-busy': pipelineBusy,
              style: { width: 'auto', margin: 0, padding: '5px 9px' },
              onClick: () => runNovelPipeline(false)
            }, pipelineBusy ? '生成中…' : '生成人物卡'),
            react.createElement('button', {
              type: 'button', className: 'dsh-tavern-entry-btn', disabled: pipelineBusy,
              // P0: 可访问性——忙碌态暴露 aria-busy。
              'aria-busy': pipelineBusy,
              style: { width: 'auto', margin: 0, padding: '5px 9px' },
              onClick: () => runNovelPipeline(true)
            }, pipelineBusy ? '生成中…' : '生成并导入 Tavern')
          ),
          pipelineError ? react.createElement('div', { style: { marginTop: '6px', color: '#ef8f8f' } }, pipelineError) : null,
          pipelineResult ? react.createElement('pre', {
            style: { margin: '8px 0 0', padding: '8px', maxHeight: '180px', overflow: 'auto', borderRadius: '8px', background: 'rgba(0,0,0,.28)', fontSize: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
          }, JSON.stringify({
            novel: pipelineResult.novel,
            worldbook: pipelineResult.worldbook && { id: pipelineResult.worldbook.id, name: pipelineResult.worldbook.name, entryCount: pipelineResult.worldbook.entryCount },
            cards: pipelineResult.cards && pipelineResult.cards.map(card => ({ id: card.id, name: card.name, valid: card.valid, tavern: card.tavern && card.tavern.path || null, tavernError: card.tavernError || null }))
          }, null, 2)) : null
        ),
        react.createElement('div', { style: { marginTop: '10px', borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: '10px' } },
          react.createElement('div', { style: { fontWeight: 700, marginBottom: '6px' } }, 'Tavern 反馈 / 续写大纲'),
          react.createElement('select', {
            value: feedbackChatId,
            onChange: event => setFeedbackChatId(event.target.value),
            style: { boxSizing: 'border-box', width: '100%', marginBottom: '6px', padding: '6px 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.25)', color: 'inherit' }
          },
            react.createElement('option', { value: '' }, '选择 Tavern 会话（可选）'),
            tavernChats.map(chat => react.createElement('option', { key: chat.id, value: chat.id },
              `${chat.cardName || chat.id} · ${chat.mode} · ${chat.hasModelRequests ? chat.requestCount + ' 请求' : '无记录'}`))
          ),
          react.createElement('textarea', {
            value: feedbackText,
            placeholder: '粘贴 Tavern 会话记录（与 chatId 二选一）',
            onChange: event => setFeedbackTextDebounced(event.target.value),
            style: { boxSizing: 'border-box', width: '100%', minHeight: '72px', marginBottom: '6px', padding: '6px 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.25)', color: 'inherit', resize: 'vertical' }
          }),
          react.createElement('button', {
            type: 'button', className: 'dsh-tavern-entry-btn', disabled: feedbackBusy,
            style: { width: 'auto', margin: 0, padding: '5px 9px' },
            onClick: runFeedback
          }, feedbackBusy ? '分析中…' : '生成反馈与续写'),
          feedbackError ? react.createElement('div', { style: { marginTop: '6px', color: '#ef8f8f' } }, feedbackError) : null,
          feedbackResult ? react.createElement('pre', {
            style: { margin: '8px 0 0', padding: '8px', maxHeight: '180px', overflow: 'auto', borderRadius: '8px', background: 'rgba(0,0,0,.28)', fontSize: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
          }, JSON.stringify({
            model: feedbackResult.model,
            generationError: feedbackResult.summary && feedbackResult.summary.data && feedbackResult.summary.data.generationError,
            feedback: feedbackResult.summary && feedbackResult.summary.data && feedbackResult.summary.data.feedback
          }, null, 2).slice(0, 5000)) : null,
          feedbackResult ? react.createElement('button', {
            type: 'button', className: 'dsh-tavern-entry-btn', disabled: feedbackContentBusy,
            style: { width: 'auto', marginTop: '6px', padding: '5px 9px' },
            onClick: runFeedbackToContent
          }, feedbackContentBusy ? '转换中…' : '反馈转新卡/大纲') : null,
          feedbackContentError ? react.createElement('div', { style: { marginTop: '6px', color: '#ef8f8f' } }, feedbackContentError) : null,
          feedbackContentResult ? react.createElement('pre', {
            style: { margin: '8px 0 0', padding: '8px', maxHeight: '180px', overflow: 'auto', borderRadius: '8px', background: 'rgba(0,0,0,.28)', fontSize: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
          }, JSON.stringify({
            scripts: feedbackContentResult.scripts,
            cards: feedbackContentResult.cards
          }, null, 2).slice(0, 5000)) : null
        ),
        react.createElement('button', {
          type: 'button', className: 'dsh-tavern-entry-btn',
          style: { width: 'auto', marginTop: '10px', padding: '5px 9px' },
          onClick: () => setOpen(false)
        }, '关闭')
        ) // N8 Fragment closed: 资源库视图结束
      ) : null

      return react.createElement(react.Fragment, null,
        react.createElement('button', {
          type: 'button',
          className: 'dsh-tavern-entry-btn',
          title: 'DSH Creative Suite Phase 0',
          onClick: () => setOpen(value => !value)
        }, '创作套件 POC'),
        panel
      )
    }


    function escapeHtml(value) {
      return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    function compileRegexScriptClient(script) {
      const find = String(script && script.find || '')
      if (!find) throw new Error('空的 find regex')
      const literal = /^\/([\s\S]*)\/([a-z]*)$/i.exec(find)
      if (literal) return new RegExp(literal[1], literal[2])
      return new RegExp(find, 'g')
    }

    function applyRegexScriptsClient(scripts, text) {
      let output = String(text == null ? '' : text)
      for (const script of Array.isArray(scripts) ? scripts : []) {
        if (!script || script.disabled || script.promptOnly) continue
        try {
          const regex = compileRegexScriptClient(script)
          output = output.replace(regex, script.replace)
        } catch (_error) {}
      }
      return output
    }

    async function requestJson(path, options) {
      const response = await fetch(path, Object.assign({ headers: { accept: 'application/json' } }, options || {}))
      let payload
      try { payload = await response.json() } catch (error) { throw new Error(`HTTP ${response.status}`) }
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
      return payload
    }

    function MuseAIPane() {
      const pages = [
        { id: 'background', label: '背景' },
        { id: 'chat', label: '聊天' },
        { id: 'adventure', label: '冒险' },
        { id: 'booktravel', label: '穿书' },
        { id: 'bond', label: '羁绊' },
        { id: 'styles', label: '文风' },
        { id: 'settings', label: '设置' }
      ]
      const [page, setPage] = react.useState('background')
      const [refreshKey, setRefreshKey] = react.useState(0)
      const [cards, setCards] = react.useState([])
      const [worldbooks, setWorldbooks] = react.useState([])
      const [sessions, setSessions] = react.useState([])
      const [storyProjects, setStoryProjects] = react.useState([])
      const [storyProjectId, setStoryProjectId] = react.useState('')
      const [storyResourceInfo, setStoryResourceInfo] = react.useState(null)
      const [storyBindingBusy, setStoryBindingBusy] = react.useState(false)
      const [backgroundCardId, setBackgroundCardId] = react.useState('')
      const [boundWorldbooks, setBoundWorldbooks] = react.useState([])
      const [bindingBusy, setBindingBusy] = react.useState(false)
      const [notice, setNotice] = react.useState('')
      const [sessionId, setSessionId] = react.useState('')
      const [session, setSession] = react.useState(null)
      const [input, setInput] = react.useState('')
      const [pendingUser, setPendingUser] = react.useState('')
      const chatLogRef = react.useRef(null)
      const [cardId, setCardId] = react.useState('')
      const [companionIds, setCompanionIds] = react.useState([])
      const [worldbookId, setWorldbookId] = react.useState('')
      const [busy, setBusy] = react.useState(false)
      const [error, setError] = react.useState('')
      const [bonds, setBonds] = react.useState(null)
      // N8 穿书 state（顶层声明，分支内只使用，避免 Hooks 规则违规）。
      const [btPhase, setBtPhase] = react.useState('materials')
      const [btNovels, setBtNovels] = react.useState([])
      const [btOutlineId, setBtOutlineId] = react.useState('')
      const [btWorldbookId, setBtWorldbookId] = react.useState('')
      const [btCardIds, setBtCardIds] = react.useState([])
      const [btAssembled, setBtAssembled] = react.useState(null)
      const [btEntry, setBtEntry] = react.useState(null)
      const [btEntryIdx, setBtEntryIdx] = react.useState(0)
      const [btIdentIdx, setBtIdentIdx] = react.useState(0)
      const [btSessionId, setBtSessionId] = react.useState('')
      const [btBeats, setBtBeats] = react.useState([])
      const [btChoices, setBtChoices] = react.useState([])
      const [btProgress, setBtProgress] = react.useState(0)
      const [btScene, setBtScene] = react.useState(null)
      const [btEnding, setBtEnding] = react.useState(null)
      const [btInput, setBtInput] = react.useState('')
      const [styles, setStyles] = react.useState(null)
      const [settings, setSettings] = react.useState(null)
      const [modelKey, setModelKey] = react.useState('')
      const [prompt, setPrompt] = react.useState('')
      const [temperature, setTemperature] = react.useState(0.7)
      const [topP, setTopP] = react.useState(0.9)

      react.useEffect(() => {
        if (page !== 'background' || !backgroundCardId) { setBoundWorldbooks([]); return undefined }
        let stopped = false
        requestJson(`/plugins/creative-suite/resources/cards/${encodeURIComponent(backgroundCardId)}/bindings`)
          .then(payload => { if (!stopped) setBoundWorldbooks(payload.worldbooks || []) })
          .catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [page, backgroundCardId, refreshKey])

      react.useEffect(() => {
        let stopped = false
        Promise.all([
          requestJson('/plugins/creative-suite/resources/cards'),
          requestJson('/plugins/creative-suite/resources/worldbooks'),
          requestJson('/plugins/creative-suite/resources/novels'),
          requestJson('/plugins/creative-suite/museai/sessions'),
          requestJson('/plugins/creative-suite/story/projects')
        ]).then(([cardPayload, worldbookPayload, novelPayload, sessionPayload, storyPayload]) => {
          if (stopped) return
          setCards(cardPayload.resources || [])
          setWorldbooks(worldbookPayload.resources || [])
          setBtNovels(novelPayload.resources || [])
          setSessions(sessionPayload.sessions || [])
          setStoryProjects(storyPayload.projects || [])
          setError('')
        }).catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [refreshKey])

      react.useEffect(() => {
        if (page !== 'chat' && page !== 'adventure') return undefined
        if (!session) return undefined
        const sessionMode = session.data && session.data.mode || 'chat'
        const pageMode = page === 'adventure' ? 'adventure' : 'chat'
        if (sessionMode !== pageMode) {
          setSessionId('')
          setSession(null)
        }
        return undefined
      }, [page])

      const __museaiMessageCount = session && session.data && Array.isArray(session.data.messages) ? session.data.messages.length : 0
      react.useEffect(() => {
        // Auto-scroll the chat log whenever history grows or a generation settles (streaming-like UX).
        try { if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight } catch (_error) {}
        return undefined
      }, [__museaiMessageCount, busy, pendingUser, sessionId])

      react.useEffect(() => {
        if (!sessionId) { setSession(null); return undefined }
        let stopped = false
        requestJson(`/plugins/creative-suite/museai/sessions/${encodeURIComponent(sessionId)}`)
          .then(payload => {
            if (stopped) return
            setSession(payload.session)
            setCardId(payload.session && payload.session.data && payload.session.data.cardId || '')
            setCompanionIds(Array.isArray(payload.session && payload.session.data && payload.session.data.companionIds) ? payload.session.data.companionIds : [])
            setWorldbookId(payload.session && payload.session.data && payload.session.data.worldbookId || '')
            setError('')
          })
          .catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [sessionId, refreshKey])

      react.useEffect(() => {
        if (page !== 'bond') return undefined
        let stopped = false
        requestJson('/plugins/creative-suite/museai/bonds')
          .then(payload => { if (!stopped) { setBonds(payload); setError('') } })
          .catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [page, refreshKey])

      react.useEffect(() => {
        if (page !== 'styles') return undefined
        let stopped = false
        requestJson('/plugins/creative-suite/resources/styles')
          .then(payload => { if (!stopped) { setStyles(payload.resources || []); setError('') } })
          .catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [page, refreshKey])

      react.useEffect(() => {
        if (page !== 'settings') return undefined
        let stopped = false
        requestJson('/plugins/creative-suite/museai/settings')
          .then(payload => {
            if (stopped) return
            setSettings(payload)
            const selection = payload.defaultSelection || {}
            setModelKey(selection.provider && selection.model ? `${selection.provider}::${selection.model}` : '')
            const museaiSettings = payload.museaiSettings || {}
            setPrompt(museaiSettings.prompt || '')
            if (museaiSettings.sampling) {
              if (typeof museaiSettings.sampling.temperature === 'number') setTemperature(museaiSettings.sampling.temperature)
              if (typeof museaiSettings.sampling.top_p === 'number') setTopP(museaiSettings.sampling.top_p)
            }
            setError('')
          })
          .catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [page, refreshKey])

      async function bindBackgroundWorldbook(worldbook) {
        if (!backgroundCardId || !worldbook) return
        setBindingBusy(true); setError(''); setNotice('')
        try {
          await requestJson(`/plugins/creative-suite/resources/cards/${encodeURIComponent(backgroundCardId)}/bind-worldbook`, {
            method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ worldbookId: worldbook.id })
          })
          setNotice(`已绑定世界书：${worldbook.name || worldbook.id}`)
          setRefreshKey(value => value + 1)
        } catch (err) { setError(String(err && err.message || err)) } finally { setBindingBusy(false) }
      }

      async function unbindBackgroundWorldbook(worldbook) {
        if (!backgroundCardId || !worldbook) return
        setBindingBusy(true); setError(''); setNotice('')
        try {
          await requestJson(`/plugins/creative-suite/resources/cards/${encodeURIComponent(backgroundCardId)}/bind-worldbook/${encodeURIComponent(worldbook.id)}`, { method: 'DELETE' })
          setNotice(`已解除绑定：${worldbook.name || worldbook.id}`)
          setRefreshKey(value => value + 1)
        } catch (err) { setError(String(err && err.message || err)) } finally { setBindingBusy(false) }
      }

      async function loadStoryResources() {
        if (!storyProjectId) { setError('请先选择 Story 项目'); return }
        setStoryBindingBusy(true); setError(''); setNotice('')
        try {
          const payload = await requestJson(`/plugins/creative-suite/story/projects/${encodeURIComponent(storyProjectId)}/resources`)
          setStoryResourceInfo(payload)
          const nextCard = Array.isArray(payload.cards) && payload.cards.length > 0 ? payload.cards[0] : null
          const nextWorldbook = Array.isArray(payload.worldbooks) && payload.worldbooks.length > 0 ? payload.worldbooks[0] : null
          if (nextCard) setCardId(nextCard.id)
          if (nextWorldbook) setWorldbookId(nextWorldbook.id)
          setNotice(`已从 Story 项目载入：角色卡 ${payload.cards.length} · 世界书 ${payload.worldbooks.length}`)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setStoryBindingBusy(false)
        }
      }

      const modeSessions = sessions.filter(item => (page === 'adventure' ? item.mode === 'adventure' : item.mode === 'chat'))

      function adventureChoicesOf(message) {
        if (!message || message.role !== 'assistant') return []
        if (Array.isArray(message.choices) && message.choices.length > 0) return message.choices.map(item => String(item))
        const text = String(message.content || '')
        const lines = text.split(/\r?\n/)
        const out = []
        const seen = new Set()
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const match = /^(?:(?:选项|选择|可选行动|行动选项)?\s*[A-Ea-e1-5]\s*[:：.)、\-]\s*|(?:选项|选择|可选行动|行动选项)\s*\d+\s*[:：]\s*|[-*•・]\s+|【(?:选项|选择|行动)\s*[A-Ea-e1-5]?\s*】\s*)(.+)$/.exec(trimmed)
            || /^([A-Ea-e1-5])\s*[.)）:：、\-]\s*(.{2,})$/u.exec(trimmed)
          const value = String((match && (match[1] !== undefined && match[2] !== undefined ? match[2] : match[1])) || '').trim()
          if (value && value.length >= 2 && value.length <= 120 && !seen.has(value)) { seen.add(value); out.push(value) }
          if (out.length >= 5) break
        }
        return out
      }

      async function sendText(text, modeOverride, choiceIndex) {
        const message = String(text || '').trim()
        if (!message) { setError('请输入消息'); return }
        if (busy) return
        setBusy(true)
        setPendingUser(message)
        setInput('')
        setError('')
        // Scroll to bottom immediately so the pending echo is visible (streaming-like feedback).
        try { if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight } catch (_error) {}
        try {
          const payload = await requestJson('/plugins/creative-suite/museai/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              sessionId: sessionId || undefined,
              cardId: cardId || undefined,
              companionIds: page === 'adventure' ? companionIds.filter(id => id && id !== cardId) : undefined,
              worldbookId: worldbookId || undefined,
              storyProjectId: storyProjectId || undefined,
              mode: modeOverride || (session && session.data && session.data.mode) || (page === 'adventure' ? 'adventure' : 'chat'),
              choiceIndex: choiceIndex === undefined || choiceIndex === null ? undefined : choiceIndex,
              message
            })
          })
          setSession(payload.session)
          setSessionId(payload.session.id)
          setCompanionIds(Array.isArray(payload.session && payload.session.data && payload.session.data.companionIds) ? payload.session.data.companionIds : (page === 'adventure' ? companionIds : []))
          setRefreshKey(value => value + 1)
        } catch (err) {
          setError(String(err && err.message || err))
          setInput(message)
        } finally {
          setPendingUser('')
          setBusy(false)
          try { if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight } catch (_error) {}
        }
      }

      async function sendAdventureChoice(message, index) {
        const choices = adventureChoicesOf(message)
        const text = choices[index]
        if (!text) { setError('候选项不存在'); return }
        await sendText(text, 'adventure', index)
      }

      async function startSession(mode) {
        setBusy(true)
        setError('')
        try {
          const payload = await requestJson('/plugins/creative-suite/museai/sessions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ mode: mode || 'chat', cardId: cardId || undefined, companionIds: (mode || 'chat') === 'adventure' ? companionIds.filter(id => id && id !== cardId) : undefined, worldbookId: worldbookId || undefined, storyProjectId: storyProjectId || undefined })
          })
          setSession(payload.session)
          setSessionId(payload.session.id)
          setCompanionIds(Array.isArray(payload.session && payload.session.data && payload.session.data.companionIds) ? payload.session.data.companionIds : [])
          setPage(mode === 'adventure' ? 'adventure' : 'chat')
          setRefreshKey(value => value + 1)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      async function startAdventureNow() {
        setBusy(true)
        setError('')
        try {
          const payload = await requestJson('/plugins/creative-suite/museai/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ mode: 'adventure', cardId: cardId || undefined, companionIds: companionIds.filter(id => id && id !== cardId), worldbookId: worldbookId || undefined, storyProjectId: storyProjectId || undefined, message: '开始冒险。请以 GM 口吻开场：旁白 + 多角色演出，并给出 3-5 个编号候选行动。' })
          })
          setSession(payload.session)
          setSessionId(payload.session.id)
          setCompanionIds(Array.isArray(payload.session && payload.session.data && payload.session.data.companionIds) ? payload.session.data.companionIds : companionIds)
          setRefreshKey(value => value + 1)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      async function saveModel() {
        if (!modelKey) { setError('请选择模型'); return }
        const [provider, ...rest] = modelKey.split('::')
        const model = rest.join('::')
        if (!provider || !model) { setError('模型选择无效'); return }
        setBusy(true)
        setError('')
        try {
          const payload = await requestJson('/plugins/creative-suite/museai/model', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ provider, model })
          })
          setSettings(Object.assign({}, settings, { defaultSelection: payload.defaultSelection }))
          setError('')
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      async function saveSettings() {
        setBusy(true)
        setError('')
        try {
          const payload = await requestJson('/plugins/creative-suite/museai/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ prompt: prompt || '', sampling: { temperature: Number(temperature), top_p: Number(topP) } })
          })
          setSettings(Object.assign({}, settings, { museaiSettings: payload.settings }))
          setNotice('设置已保存')
          setError('')
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      async function runMigrateAll() {
        setBusy(true)
        setError('')
        setNotice('')
        try {
          const payload = await requestJson('/plugins/creative-suite/migrate/all', { method: 'POST' })
          const parts = ['cards', 'worldbooks', 'presets'].map(kind => {
            const part = payload[kind] || {}
            return `${kind} 导入${part.imported || 0} 跳过${part.skipped || 0}`
          })
          setNotice(`全部迁移完成：${parts.join(' · ')}`)
          setRefreshKey(value => value + 1)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      const selectStyle = {
        padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent', color: 'inherit', maxWidth: '100%'
      }
      const textareaStyle = {
        boxSizing: 'border-box', width: '100%', minHeight: '90px', padding: '9px',
        borderRadius: '9px', border: '1px solid var(--dsw-alias-border-l2)',
        background: 'rgba(0,0,0,.15)', color: 'inherit', resize: 'vertical'
      }

      const pageNav = react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } },
        pages.map(item => react.createElement('button', {
          key: item.id,
          type: 'button',
          className: 'dsh-tavern-entry-btn',
          style: { width: 'auto', margin: 0, padding: '6px 12px', opacity: page === item.id ? 1 : .62 },
          onClick: () => {
            const nextPage = item.id
            setPage(nextPage)
            if (nextPage !== page && (nextPage === 'chat' || nextPage === 'adventure')) {
              setSessionId('')
              setSession(null)
            }
          }
        }, item.label))
      )

      const errorBox = error ? react.createElement('div', { style: { color: '#ef8f8f', marginBottom: '10px' } }, error) : null

      const setupBar = react.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' } },
        react.createElement('select', { value: cardId, onChange: event => setCardId(event.target.value), style: selectStyle },
          react.createElement('option', { value: '' }, '选择角色卡（可空）'),
          cards.map(card => react.createElement('option', { key: card.id, value: card.id }, card.name || card.id))
        ),
        react.createElement('select', { value: worldbookId, onChange: event => setWorldbookId(event.target.value), style: selectStyle },
          react.createElement('option', { value: '' }, '选择世界书（可空）'),
          worldbooks.map(wb => react.createElement('option', { key: wb.id, value: wb.id }, wb.name || wb.id))
        )
      )

      let body
      if (page === 'background') {
        body = react.createElement(react.Fragment, null,
          react.createElement('div', { style: { opacity: .65, marginBottom: '10px', fontSize: '12px' } }, '背景页：管理可供 MuseAI / 酒馆共用的角色卡与世界书，也可以直接从 Story 项目载入派生资源。'),
          setupBar,
          react.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px', padding: '10px', borderRadius: '9px', background: 'rgba(0,0,0,.10)', border: '1px solid var(--dsw-alias-border-l2)' } },
            react.createElement('select', {
              value: storyProjectId,
              onChange: event => { setStoryProjectId(event.target.value); setStoryResourceInfo(null); setNotice('') },
              style: selectStyle
            },
              react.createElement('option', { value: '' }, '选择 Story 项目'),
              storyProjects.map(project => react.createElement('option', { key: project.id, value: project.id }, `${project.name} · ${project.kind}`))
            ),
            react.createElement('button', {
              type: 'button', className: 'dsh-tavern-entry-btn', disabled: storyBindingBusy || !storyProjectId,
              style: { width: 'auto', margin: 0, padding: '6px 10px' },
              onClick: loadStoryResources
            }, storyBindingBusy ? '载入中…' : '从 Story 载入角色卡 / 世界书'),
            storyResourceInfo ? react.createElement('span', { style: { fontSize: '11px', opacity: .7 } }, `卡 ${storyResourceInfo.cards.length} · 世界书 ${storyResourceInfo.worldbooks.length} · 小说 ${storyResourceInfo.novels.length}`) : null
          ),
          notice ? react.createElement('div', { style: { color: '#d8b46a', marginBottom: '10px', fontSize: '11px' } }, notice) : null,
          react.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' } },
            react.createElement('div', { style: { padding: '12px', borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l2)' } },
              react.createElement('div', { style: { fontWeight: 700, marginBottom: '8px' } }, `角色卡 ${cards.length}`),
              cards.length === 0 ? react.createElement('div', { style: { opacity: .55 } }, '暂无角色卡，可在资源库导入或从小说生成。') :
                cards.slice(0, 8).map(card => react.createElement('button', { key: card.id, type: 'button', className: 'dsh-tavern-entry-btn',
                  style: { width: '100%', margin: '3px 0', textAlign: 'left', padding: '6px 8px', opacity: backgroundCardId === card.id ? 1 : .72 },
                  onClick: () => { setBackgroundCardId(card.id); setNotice(`已选择角色卡：${card.name || card.id}`) }
                }, `${card.name || card.id}${Array.isArray(card.data && card.data.worldbookIds) ? ` · ${card.data.worldbookIds.length} 本世界书` : ''}`))
            ),
            react.createElement('div', { style: { padding: '12px', borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l2)' } },
              react.createElement('div', { style: { fontWeight: 700, marginBottom: '8px' } }, `世界书 ${worldbooks.length}`),
              !backgroundCardId ? react.createElement('div', { style: { opacity: .55 } }, '先选择角色卡，再管理绑定。') : react.createElement(react.Fragment, null,
                react.createElement('div', { style: { fontSize: '11px', opacity: .7, marginBottom: '6px' } }, `已绑定 ${boundWorldbooks.length} 本 · 点击“绑定”或“解除”管理`),
                worldbooks.length === 0 ? react.createElement('div', { style: { opacity: .55 } }, '暂无世界书。') :
                  worldbooks.slice(0, 20).map(wb => {
                    const isBound = boundWorldbooks.some(item => item.id === wb.id)
                    return react.createElement('div', { key: wb.id, style: { display: 'flex', gap: '6px', alignItems: 'center', padding: '5px 0', borderTop: '1px solid rgba(255,255,255,.08)' } },
                      react.createElement('div', { style: { flex: 1, minWidth: 0 } },
                        react.createElement('div', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, wb.name || wb.id),
                        react.createElement('div', { style: { fontSize: '10px', opacity: .6 } }, `${wb.data && wb.data.entryCount !== undefined ? wb.data.entryCount : (wb.entryCount || 0)} 条目 · ${wb.source || 'resource'}`)
                      ),
                      react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: bindingBusy, style: { width: 'auto', margin: 0, padding: '3px 7px', fontSize: '11px' }, onClick: () => isBound ? unbindBackgroundWorldbook(wb) : bindBackgroundWorldbook(wb) }, isBound ? '解除' : '绑定')
                    )
                  })
              ),
              backgroundCardId && boundWorldbooks.length > 0 ? react.createElement('details', { style: { marginTop: '8px', fontSize: '11px' } },
                react.createElement('summary', null, '查看已绑定资源详情'),
                react.createElement('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '140px', overflow: 'auto', opacity: .75 } }, JSON.stringify(boundWorldbooks, null, 2).slice(0, 5000))
              ) : null
            )
          )
        )
      } else if (page === 'booktravel') {
        // N8 穿书页：素材选择 → 入口选择 → 场景游玩 → 结算（state 见顶层 bt*）。
        const btToggleCard = id => {
          setBtCardIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 5))
        }
        const btAssemble = async () => {
          if (!btOutlineId && !btWorldbookId && btCardIds.length === 0) { setError('请至少选择一份大纲/世界书/角色卡'); return }
          setBusy(true); setError('')
          try {
            const payload = await requestJson('/plugins/creative-suite/museai/booktravel/assemble', {
              method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ outlineId: btOutlineId || undefined, worldbookId: btWorldbookId || undefined, characterCardIds: btCardIds })
            })
            setBtAssembled(payload)
            setBtPhase('entry')
            // 装配完自动生成入口
            const entryPayload = await requestJson('/plugins/creative-suite/museai/booktravel/entry', {
              method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ assembledWorldModel: payload.assembledWorldModel })
            })
            setBtEntry(entryPayload)
          } catch (err) { setError(String(err && err.message || err)) } finally { setBusy(false) }
        }
        const btStart = async () => {
          setBusy(true); setError('')
          try {
            const eps = (btEntry && btEntry.entryPoints) || []
            const ids = (btEntry && btEntry.recommendedUserCharacters) || []
            const ep = eps[btEntryIdx] || eps[0] || null
            const uc = ids[btIdentIdx] || ids[0] || null
            const sessPayload = await requestJson('/plugins/creative-suite/museai/sessions', {
              method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ mode: 'booktravel', cardId: btCardIds[0] || undefined, worldbookId: btWorldbookId || undefined, name: `穿书 · ${ep ? ep.title : '新世界'}` })
            })
            const sid = sessPayload.session.id
            setBtSessionId(sid)
            setBtBeats([]); setBtChoices([]); setBtEnding(null); setBtProgress(0)
            setBtPhase('play')
            // 首轮：用入口 initialGoal 开场
            const firstInput = `【剧情推进】${ep ? `从「${ep.title}」开始：${ep.situation || ''}初始目标：${ep.initialGoal || ''}` : '故事开场'}${uc ? `我扮演${uc.name || ''}（${uc.identity || ''}）` : ''}`
            const turnPayload = await requestJson('/plugins/creative-suite/museai/booktravel/turn', {
              method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ sessionId: sid, userInput: firstInput, assembledWorldModel: btAssembled.assembledWorldModel, entryPoint: ep, userCharacter: uc })
            })
            setBtBeats([{ role: 'assistant', content: (turnPayload.beat && turnPayload.beat.content) || '' }])
            setBtChoices(turnPayload.suggestedChoices || [])
            setBtProgress(turnPayload.storyProgress || 0)
            setBtScene(turnPayload.currentScene || null)
            if (turnPayload.ending) { setBtEnding(turnPayload.ending); setBtPhase('ending') }
            setRefreshKey(value => value + 1)
          } catch (err) { setError(String(err && err.message || err)) } finally { setBusy(false) }
        }
        const btSend = async text => {
          const message = String(text || btInput || '').trim()
          if (!message || !btSessionId || busy) return
          setBusy(true); setError(''); setBtInput('')
          setBtBeats(prev => [...prev, { role: 'user', content: message }])
          try {
            const payload = await requestJson('/plugins/creative-suite/museai/booktravel/turn', {
              method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ sessionId: btSessionId, userInput: message })
            })
            setBtBeats(prev => [...prev, { role: 'assistant', content: (payload.beat && payload.beat.content) || '' }])
            setBtChoices(payload.suggestedChoices || [])
            setBtProgress(payload.storyProgress || 0)
            setBtScene(payload.currentScene || null)
            if (payload.ending) { setBtEnding(payload.ending); setBtPhase('ending') }
          } catch (err) { setError(String(err && err.message || err)) } finally { setBusy(false) }
        }
        const btMemory = async () => {
          if (!btSessionId) return
          setBusy(true); setError('')
          try {
            const payload = await requestJson('/plugins/creative-suite/museai/booktravel/memory', {
              method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ sessionId: btSessionId })
            })
            setNotice(`记忆已压缩：${String(payload.summary || '').slice(0, 120)}`)
          } catch (err) { setError(String(err && err.message || err)) } finally { setBusy(false) }
        }
        if (btPhase === 'materials') {
          body = react.createElement(react.Fragment, null,
            react.createElement('div', { style: { opacity: .65, marginBottom: '12px', fontSize: '12px' } }, '穿书 · 素材选择：选一份小说做大纲，配世界书与角色卡，装配成可游玩的世界。'),
            react.createElement('div', { style: { fontWeight: 700, marginBottom: '4px' } }, '大纲（小说）'),
            react.createElement('select', { value: btOutlineId, onChange: e => setBtOutlineId(e.target.value), style: { width: '100%', marginBottom: '8px', padding: '6px 10px' } },
              react.createElement('option', { value: '' }, '请选择小说…'),
              btNovels.map(n => react.createElement('option', { key: n.id, value: n.id }, `${n.name || n.id}`))
            ),
            react.createElement('div', { style: { fontWeight: 700, marginBottom: '4px' } }, '世界书'),
            react.createElement('select', { value: btWorldbookId, onChange: e => { setBtWorldbookId(e.target.value); setWorldbookId(e.target.value) }, style: { width: '100%', marginBottom: '8px', padding: '6px 10px' } },
              react.createElement('option', { value: '' }, '不绑定世界书'),
              worldbooks.map(w => react.createElement('option', { key: w.id, value: w.id }, `${w.name || w.id}`))
            ),
            react.createElement('div', { style: { fontWeight: 700, marginBottom: '4px' } }, `角色卡（已选 ${btCardIds.length}/5）`),
            react.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', maxHeight: '160px', overflow: 'auto' } },
              cards.slice(0, 60).map(c => react.createElement('button', {
                key: c.id, type: 'button', onClick: () => btToggleCard(c.id),
                style: { width: 'auto', padding: '4px 10px', fontSize: '12px', borderRadius: '14px', border: '1px solid var(--dsw-alias-border-l2)', background: btCardIds.includes(c.id) ? 'rgba(120,180,255,.25)' : 'transparent', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }
              }, c.name || c.id))
            ),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, onClick: btAssemble, style: { padding: '8px 20px' } }, busy ? '装配中…' : '装配世界 →')
          )
        } else if (btPhase === 'entry') {
          const eps = (btEntry && btEntry.entryPoints) || []
          const ids = (btEntry && btEntry.recommendedUserCharacters) || []
          body = react.createElement(react.Fragment, null,
            react.createElement('div', { style: { opacity: .65, marginBottom: '12px', fontSize: '12px' } }, '穿书 · 选择入场点与身份'),
            !btEntry ? react.createElement('div', { style: { opacity: .55 } }, '正在生成入场点…') : react.createElement(react.Fragment, null,
              react.createElement('div', { style: { fontWeight: 700, marginBottom: '4px' } }, '入场点'),
              eps.map((e, idx) => react.createElement('label', { key: idx, style: { display: 'block', padding: '8px 10px', marginBottom: '6px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)', background: btEntryIdx === idx ? 'rgba(120,180,255,.15)' : 'transparent', cursor: 'pointer' } },
                react.createElement('input', { type: 'radio', checked: btEntryIdx === idx, onChange: () => setBtEntryIdx(idx) }),
                react.createElement('span', { style: { fontWeight: 700, marginLeft: '6px' } }, e.title || `入口${idx + 1}`),
                react.createElement('div', { style: { fontSize: '12px', opacity: .75, marginTop: '4px' } }, `${e.timeAndLocation || ''} · ${e.situation || ''}`),
                react.createElement('div', { style: { fontSize: '12px', opacity: .6 } }, `目标：${e.initialGoal || ''}｜风险：${e.risk || ''}`)
              )),
              react.createElement('div', { style: { fontWeight: 700, margin: '10px 0 4px' } }, '扮演身份'),
              ids.map((x, idx) => react.createElement('label', { key: idx, style: { display: 'block', padding: '6px 10px', marginBottom: '6px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)', background: btIdentIdx === idx ? 'rgba(120,180,255,.15)' : 'transparent', cursor: 'pointer' } },
                react.createElement('input', { type: 'radio', checked: btIdentIdx === idx, onChange: () => setBtIdentIdx(idx) }),
                react.createElement('span', { style: { fontWeight: 700, marginLeft: '6px' } }, `${x.name || `身份${idx + 1}`} · ${x.identity || ''}`),
                react.createElement('div', { style: { fontSize: '12px', opacity: .7 } }, `${x.background || ''}｜${x.personality || ''}｜目标：${x.goal || ''}`)
              )),
              react.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
                react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', onClick: () => setBtPhase('materials'), style: { padding: '8px 16px' } }, '← 重选素材'),
                react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, onClick: btStart, style: { padding: '8px 20px' } }, busy ? '开场中…' : '开始穿书 →')
              )
            )
          )
        } else if (btPhase === 'play') {
          body = react.createElement(react.Fragment, null,
            react.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '12px', opacity: .8 } },
              react.createElement('span', null, btScene ? `当前：${btScene.title || ''} · ${btScene.location || ''}` : '穿书进行中…'),
              react.createElement('span', null, `进度 ${btProgress}%`)
            ),
            react.createElement('div', { style: { height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,.1)', marginBottom: '10px' } },
              react.createElement('div', { style: { width: `${Math.min(100, btProgress)}%`, height: '100%', borderRadius: '3px', background: '#d8b46a' } })
            ),
            react.createElement('div', { ref: chatLogRef, style: { maxHeight: '380px', overflow: 'auto', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '8px' } },
              btBeats.map((m, idx) => react.createElement('div', {
                key: idx, style: { alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '8px 12px', borderRadius: '10px', fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: m.role === 'user' ? 'rgba(120,180,255,.2)' : 'rgba(255,255,255,.06)' }
              }, m.content))
            ),
            btChoices.length > 0 ? react.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' } },
              btChoices.map((c, idx) => react.createElement('button', {
                key: idx, type: 'button', onClick: () => btSend(c),
                style: { width: 'auto', padding: '4px 12px', fontSize: '12px', borderRadius: '14px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }
              }, c))
            ) : null,
            react.createElement('div', { style: { display: 'flex', gap: '6px' } },
              react.createElement('input', {
                value: btInput, onChange: e => setBtInput(e.target.value),
                onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btSend() } },
                placeholder: '【说话】/【行为】/【剧情推进】+ 你的行动…', style: { flex: 1, padding: '8px 12px', borderRadius: '8px' }
              }),
              react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, onClick: () => btSend(), style: { padding: '8px 16px' } }, busy ? '生成中…' : '发送')
            ),
            react.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
              react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, onClick: btMemory, style: { width: 'auto', padding: '4px 12px', fontSize: '12px' } }, '压缩记忆'),
              react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', onClick: () => { setBtPhase('materials'); setBtAssembled(null); setBtEntry(null) }, style: { width: 'auto', padding: '4px 12px', fontSize: '12px' } }, '结束本轮')
            )
          )
        } else if (btPhase === 'ending') {
          body = react.createElement(react.Fragment, null,
            react.createElement('div', { style: { fontWeight: 700, fontSize: '16px', marginBottom: '8px' } }, `结局 · ${btEnding.worldlineName || ''}`),
            react.createElement('div', { style: { whiteSpace: 'pre-wrap', lineHeight: 1.7, marginBottom: '12px', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,.05)' } }, btEnding.finalEnding || ''),
            react.createElement('div', { style: { fontSize: '12px', opacity: .75, marginBottom: '4px' } }, `偏离度 ${btEnding.divergenceScore || 0}/100`),
            Array.isArray(btEnding.characterOutcomes) && btEnding.characterOutcomes.length > 0 ? react.createElement('div', { style: { marginBottom: '8px' } },
              react.createElement('div', { style: { fontWeight: 700, marginBottom: '4px' } }, '角色结局'),
              btEnding.characterOutcomes.map((o, idx) => react.createElement('div', { key: idx, style: { fontSize: '13px', padding: '4px 0' } }, typeof o === 'string' ? o : JSON.stringify(o)))
            ) : null,
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', onClick: () => { setBtPhase('materials'); setBtAssembled(null); setBtEntry(null); setBtEnding(null) }, style: { padding: '8px 20px', marginTop: '8px' } }, '再开一局 →')
          )
        }
      } else if (page === 'bond') {
        const bondTime = item => Number(item.at || item.updatedAt || item.createdAt || 0)
        const bondSorted = list => [...(Array.isArray(list) ? list : [])].sort((a, b) => bondTime(b) - bondTime(a))
        const jumpToSession = item => {
          if (!item || !item.sessionId) return
          const target = (sessions || []).find(s => s.id === item.sessionId)
          setSessionId(item.sessionId)
          setCardId((target && target.cardId) || '')
          setCompanionIds(target && Array.isArray(target.companionIds) ? target.companionIds : [])
          setWorldbookId((target && target.worldbookId) || '')
          setPage(target && target.mode === 'adventure' ? 'adventure' : 'chat')
        }
        const bondRowStyle = { padding: '5px 0', borderTop: '1px solid rgba(255,255,255,.08)' }
        const bondLinkStyle = { width: 'auto', margin: '4px 0 0', padding: '2px 8px', fontSize: '12px' }
        const bondEntry = (item, index) => react.createElement('div', { key: index, style: bondRowStyle },
          react.createElement('div', null, item.text),
          item.sessionId ? react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', style: bondLinkStyle, onClick: () => jumpToSession(item) }, '→ 关联会话') : null
        )
        body = react.createElement(react.Fragment, null,
          react.createElement('div', { style: { opacity: .65, marginBottom: '12px', fontSize: '12px' } }, '羁绊页：从酒馆游玩反馈中聚合角色关系、未回收伏笔与近期摘要。'),
          !bonds ? react.createElement('div', { style: { opacity: .55 } }, '加载中…') : react.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' } },
            react.createElement('div', { style: { padding: '12px', borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l2)' } },
              react.createElement('div', { style: { fontWeight: 700, marginBottom: '8px' } }, `关系变化 ${bonds.relationships.length}`),
              bonds.relationships.length === 0 ? react.createElement('div', { style: { opacity: .55 } }, '暂无关系变化记录。') :
                bondSorted(bonds.relationships).slice(0, 12).map(bondEntry)
            ),
            react.createElement('div', { style: { padding: '12px', borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l2)' } },
              react.createElement('div', { style: { fontWeight: 700, marginBottom: '8px' } }, `未回收伏笔 ${bonds.hooks.length}`),
              bonds.hooks.length === 0 ? react.createElement('div', { style: { opacity: .55 } }, '暂无伏笔记录。') :
                bondSorted(bonds.hooks).slice(0, 12).map(bondEntry)
            ),
            react.createElement('div', { style: { padding: '12px', borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l2)' } },
              react.createElement('div', { style: { fontWeight: 700, marginBottom: '8px' } }, `近期摘要 ${bonds.summaries.length}`),
              bonds.summaries.length === 0 ? react.createElement('div', { style: { opacity: .55 } }, '暂无反馈摘要。') :
                bondSorted(bonds.summaries).slice(0, 8).map(item => react.createElement('div', { key: item.id, style: bondRowStyle },
                  react.createElement('div', null, `${item.name || item.id} · ${String(item.summary || '').slice(0, 120)}`),
                  item.sessionId ? react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', style: bondLinkStyle, onClick: () => jumpToSession(item) }, '→ 关联会话') : null
                ))
            )
          )
        )
      } else if (page === 'settings') {
        const key = modelKey
        body = react.createElement(react.Fragment, null,
          react.createElement('div', { style: { opacity: .65, marginBottom: '12px', fontSize: '12px' } }, '设置页：MuseAI 直接复用 DSH 模型配置，不再维护第二套 API Key。'),
          react.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' } },
            react.createElement('select', { value: key, onChange: event => setModelKey(event.target.value), style: Object.assign({}, selectStyle, { minWidth: '280px' }) },
              react.createElement('option', { value: '' }, '选择默认模型'),
              settings && settings.catalog && settings.catalog.groups ? settings.catalog.groups.flatMap(group => group.models.map(model => react.createElement('option', { key: `${group.provider}::${model.id}`, value: `${group.provider}::${model.id}` }, `${group.name || group.provider} / ${model.name || model.id}`))) : []
            ),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: saveModel }, busy ? '保存中…' : '保存默认模型'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: runMigrateAll }, busy ? '迁移中…' : '运行全部迁移')
          ),
          react.createElement('div', { style: { opacity: .65, marginBottom: '12px', fontSize: '11px' } }, '数据迁移向导：从 Tavern 目录导入角色卡 / 世界书 / 预设到共享资源库。只新增、不改源文件，可重复运行（已存在自动跳过）。'),
          notice ? react.createElement('div', { style: { color: '#d8b46a', marginBottom: '10px', fontSize: '11px' } }, notice) : null,
          react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', padding: '12px', borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l2)' } },
            react.createElement('div', { style: { fontWeight: 700 } }, '提示词 / 采样参数'),
            react.createElement('textarea', { value: prompt, onChange: event => setPrompt(event.target.value), placeholder: '系统提示词（为空则使用默认会话拼装）', style: textareaStyle }),
            react.createElement('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' } },
              react.createElement('label', { style: { fontSize: '12px', opacity: .8 } }, `temperature（0-2）：`,
                react.createElement('input', { type: 'number', min: 0, max: 2, step: 0.1, value: temperature, onChange: event => setTemperature(Number(event.target.value)), style: Object.assign({}, selectStyle, { width: '90px', marginLeft: '6px' }) })
              ),
              react.createElement('label', { style: { fontSize: '12px', opacity: .8 } }, `top_p（0-1）：`,
                react.createElement('input', { type: 'number', min: 0, max: 1, step: 0.05, value: topP, onChange: event => setTopP(Number(event.target.value)), style: Object.assign({}, selectStyle, { width: '90px', marginLeft: '6px' }) })
              ),
              react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: saveSettings }, busy ? '保存中…' : '保存提示词与采样')
            )
          ),
          settings ? react.createElement('pre', { style: { padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,.18)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify({ defaultSelection: settings.defaultSelection, museaiSettings: settings.museaiSettings, resources: settings.resources, failures: settings.catalog && settings.catalog.failures }, null, 2)) : react.createElement('div', { style: { opacity: .55 } }, '加载设置中…'),
          react.createElement(SettingsDiagSection, { settings })
        )
      } else if (page === 'styles') {
        body = react.createElement(react.Fragment, null,
          react.createElement('div', { style: { opacity: .65, marginBottom: '12px', fontSize: '12px' } }, '文风页：列出文风资源（GET /resources/styles），供 MuseAI / 酒馆引用。'),
          !styles ? react.createElement('div', { style: { opacity: .55 } }, '加载中…') :
            styles.length === 0 ? react.createElement('div', { style: { opacity: .55 } }, '暂无文风资源。') :
              react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                styles.slice(0, 30).map(item => react.createElement('div', { key: item.id, style: { padding: '8px 10px', borderRadius: '9px', border: '1px solid var(--dsw-alias-border-l2)' } },
                  react.createElement('div', { style: { fontWeight: 700, marginBottom: '4px' } }, item.name || item.id),
                  react.createElement('div', { style: { fontSize: '11px', opacity: .7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(item.data || item).slice(0, 500))
                ))
              )
        )
      } else {
        const isAdventure = page === 'adventure'
        const messages = session && session.data && Array.isArray(session.data.messages) ? session.data.messages : []
        const adventureBar = !isAdventure ? setupBar : react.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' } },
          react.createElement('select', { value: cardId, onChange: event => { setCardId(event.target.value); setCompanionIds(prev => prev.filter(id => id !== event.target.value)) }, style: selectStyle },
            react.createElement('option', { value: '' }, '选择主角卡（可空）'),
            cards.map(card => react.createElement('option', { key: card.id, value: card.id }, card.name || card.id))
          ),
          react.createElement('select', { value: worldbookId, onChange: event => setWorldbookId(event.target.value), style: selectStyle },
            react.createElement('option', { value: '' }, '选择世界书（可空）'),
            worldbooks.map(wb => react.createElement('option', { key: wb.id, value: wb.id }, wb.name || wb.id))
          ),
          react.createElement('div', { style: { flex: '1 1 100%', fontSize: '11px', opacity: .7 } }, '同伴卡（多角色互动，最多 4 张，点击勾选/取消）：'),
          react.createElement('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', flex: '1 1 100%' } },
            cards.filter(card => card.id !== cardId).slice(0, 24).map(card => {
              const active = companionIds.includes(card.id)
              return react.createElement('button', {
                key: card.id, type: 'button', className: 'dsh-tavern-entry-btn',
                style: { width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px', opacity: active ? 1 : .6, borderColor: active ? 'rgba(154,98,47,.85)' : undefined },
                onClick: () => setCompanionIds(prev => prev.includes(card.id) ? prev.filter(id => id !== card.id) : [...prev, card.id].slice(0, 4))
              }, `${active ? '✓ ' : ''}${card.name || card.id}`)
            })
          )
        )
        const lastAssistant = [...messages].reverse().find(message => message && message.role === 'assistant') || null
        const lastChoices = isAdventure ? adventureChoicesOf(lastAssistant) : []
        body = react.createElement(react.Fragment, null,
          isAdventure ? react.createElement('div', { style: { opacity: .65, marginBottom: '10px', fontSize: '12px' } }, '冒险页（GM 模式）：旁白推进 + 多角色演出，每轮结尾给出编号候选行动，点击即可发送。') : null,
          adventureBar,
          react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } },
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: () => startSession(isAdventure ? 'adventure' : 'chat') }, isAdventure ? '新建冒险' : '新建聊天'),
            isAdventure ? react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: startAdventureNow }, '按当前卡直接开场') : null
          ),
          react.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(170px, 240px) 1fr', gap: '12px', alignItems: 'start' } },
            react.createElement('div', { style: { maxHeight: '58vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' } },
              modeSessions.length === 0 ? react.createElement('div', { style: { opacity: .55 } }, '暂无会话') :
                modeSessions.map(item => react.createElement('button', {
                  key: item.id, type: 'button', className: 'dsh-tavern-entry-btn',
                  style: { width: '100%', margin: 0, textAlign: 'left', padding: '6px 8px', opacity: sessionId === item.id ? 1 : .72 },
                  onClick: () => { setSessionId(item.id); setCardId(item.cardId || ''); setCompanionIds(Array.isArray(item.companionIds) ? item.companionIds : []); setWorldbookId(item.worldbookId || '') }
                }, `${item.name} · ${item.messageCount} 条`))
            ),
            react.createElement('div', { style: { minWidth: 0 } },
              session ? react.createElement('div', { style: { fontWeight: 700, marginBottom: '8px' } },
                `${session.name}${isAdventure && Array.isArray(session.data && session.data.companionIds) && session.data.companionIds.length > 0 ? ` · 同伴${session.data.companionIds.length}` : ''}`
              ) : react.createElement('div', { style: { opacity: .55, marginBottom: '8px' } }, '选择或新建一个会话'),
              react.createElement('div', { ref: chatLogRef, style: { maxHeight: '42vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px', borderRadius: '10px', background: 'rgba(0,0,0,.12)' } },
                messages.length === 0 && !pendingUser ? react.createElement('div', { style: { opacity: .5 } }, '还没有对话。') :
                  messages.map((message, index) => {
                    const choices = isAdventure ? adventureChoicesOf(message) : []
                    return react.createElement('div', {
                      key: index,
                      style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '8px 10px', borderRadius: '9px', background: message.role === 'user' ? 'rgba(96,140,220,.18)' : 'rgba(154,98,47,.20)' }
                    },
                      `${message.role === 'user' ? `你${message.choiceIndex !== undefined && message.choiceIndex !== null ? `（选 ${Number(message.choiceIndex) + 1}）` : ''}` : (isAdventure ? 'GM' : '角色')}：${message.content}`,
                      choices.length > 0 ? react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' } },
                        choices.map((choice, choiceIndex) => react.createElement('button', {
                          key: choiceIndex, type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy,
                          style: { width: '100%', margin: 0, textAlign: 'left', padding: '6px 8px', fontSize: '12px', whiteSpace: 'pre-wrap' },
                          onClick: () => sendAdventureChoice(message, choiceIndex)
                        }, `${choiceIndex + 1}. ${choice}`))
                      ) : null
                    )
                  }),
                pendingUser ? react.createElement('div', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '8px 10px', borderRadius: '9px', background: 'rgba(96,140,220,.18)', opacity: .85 } }, `你：${pendingUser}`) : null,
                busy ? react.createElement('div', { style: { padding: '8px 10px', borderRadius: '9px', background: 'rgba(154,98,47,.20)', opacity: .8 } }, '角色正在输入…') : null
              ),
              isAdventure && lastChoices.length > 0 ? react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } },
                react.createElement('span', { style: { fontSize: '11px', opacity: .65, alignSelf: 'center' } }, '快捷选项：'),
                lastChoices.map((choice, choiceIndex) => react.createElement('button', {
                  key: choiceIndex, type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy,
                  style: { width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px' },
                  onClick: () => sendAdventureChoice(lastAssistant, choiceIndex)
                }, `${choiceIndex + 1}. ${choice.length > 18 ? choice.slice(0, 18) + '…' : choice}`))
              ) : null,
              react.createElement('textarea', {
                value: input,
                onChange: event => setInput(event.target.value),
                onKeyDown: event => { if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); sendText(input) } },
                placeholder: isAdventure ? '输入行动：观察、对话、前往……（或点上面的编号选项）' : '输入消息（回车发送，Shift+回车换行）',
                style: Object.assign({}, textareaStyle, { marginTop: '8px' })
              }),
              react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy || !String(input || '').trim(), style: { width: 'auto', marginTop: '6px', padding: '6px 12px' }, onClick: () => sendText(input) }, busy ? '生成中…' : '发送')
            )
          )
        )
      }

      return react.createElement(react.Fragment, null,
        pageNav,
        errorBox,
        body
      )
    }

    function TavernPlayPane(props) {
      const presetSourceCard = props && props.presetSourceCard || ''
      const onPresetConsumed = props && props.onPresetConsumed
      const [capabilities, setCapabilities] = react.useState(null)
      const [sessionPatch, setSessionPatch] = react.useState(null)
      const [helperRuntimeId, setHelperRuntimeId] = react.useState('')
      const [helperRuntimeStatus, setHelperRuntimeStatus] = react.useState('')
      const [cards, setCards] = react.useState([])
      const [sourceCard, setSourceCard] = react.useState('')
      const [mode, setMode] = react.useState('story')
      const [sessionId, setSessionId] = react.useState('')
      const [chatId, setChatId] = react.useState('')
      const [chat, setChat] = react.useState(null)
      const [activity, setActivity] = react.useState(null)
      const [requiresBrowser, setRequiresBrowser] = react.useState(false)
      const [textMode, setTextMode] = react.useState('projection')
      const [regexPresets, setRegexPresets] = react.useState([])
      const [regexPresetId, setRegexPresetId] = react.useState('')
      const [regexScripts, setRegexScripts] = react.useState([])
      const [variableJson, setVariableJson] = react.useState('{}')
      const [variableBusy, setVariableBusy] = react.useState(false)
      const [variableResult, setVariableResult] = react.useState(null)
      const [operationGuidance, setOperationGuidance] = react.useState('')
      const [operationBusy, setOperationBusy] = react.useState(false)
      const [operationResult, setOperationResult] = react.useState(null)
      const [autoRetrySettle, setAutoRetrySettle] = react.useState(true)
      const autoRetryRef = react.useRef({})
      const [input, setInput] = react.useState('')
      const [busy, setBusy] = react.useState(false)
      const [polling, setPolling] = react.useState(false)
      const [error, setError] = react.useState('')
      const [notice, setNotice] = react.useState('')
      const [candidates, setCandidates] = react.useState(null)
      const [mobileView, setMobileView] = react.useState(false)
      const assistantCountRef = react.useRef(0)

      react.useEffect(() => {
        let stopped = false
        Promise.all([
          requestJson('/plugins/creative-suite/tavern/gameplay/capabilities'),
          requestJson('/plugins/creative-suite/tavern/gameplay/cards')
        ]).then(([capabilityPayload, cardPayload]) => {
          if (stopped) return
          setCapabilities(capabilityPayload)
          const nextCards = cardPayload.cards || []
          setCards(nextCards)
          if (!sourceCard && nextCards.length > 0) setSourceCard(String(nextCards[0].path || '').replace(/^cards\//, ''))
          setError('')
        }).catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [])

      react.useEffect(() => {
        if (!presetSourceCard) return undefined
        setSourceCard(presetSourceCard)
        setNotice(`已从 Story 选择人物卡：${presetSourceCard}`)
        if (typeof onPresetConsumed === 'function') onPresetConsumed()
        return undefined
      }, [presetSourceCard])

      react.useEffect(() => {
        let stopped = false
        requestJson('/plugins/creative-suite/resources/presets')
          .then(payload => { if (!stopped) setRegexPresets(payload.resources || []) })
          .catch(() => {})
        return () => { stopped = true }
      }, [])

      react.useEffect(() => {
        if (!regexPresetId) { setRegexScripts([]); return undefined }
        let stopped = false
        requestJson(`/plugins/creative-suite/regex/scripts/${encodeURIComponent(regexPresetId)}`)
          .then(payload => { if (!stopped) setRegexScripts(payload.scripts || []) })
          .catch(() => { if (!stopped) setRegexScripts([]) })
        return () => { stopped = true }
      }, [regexPresetId])

      react.useEffect(() => {
        if (!chat || typeof chat !== 'object') return
        setVariableJson(JSON.stringify(chat.variables && typeof chat.variables === 'object' ? chat.variables : {}, null, 2))
      }, [chat])

      function settlementBusy(chatValue) {
        if (!chatValue || typeof chatValue !== 'object') return false
        const status = String(chatValue.settleStatus || '').toLowerCase()
        if (['running', 'pending', 'queued', 'preparing', 'settling', 'generating'].includes(status)) return true
        const tasks = chatValue.backgroundTasks
        if (tasks && typeof tasks === 'object') {
          return Object.values(tasks).some(task => task && ['running', 'pending', 'queued'].includes(String(task.status || '').toLowerCase()))
        }
        return false
      }

      react.useEffect(() => {
        if (!autoRetrySettle || !sessionId || !chatId || !chat) return undefined
        const status = String(chat.settleStatus || '').toLowerCase()
        if (!['failed', 'error', 'partial', 'retry'].includes(status)) return undefined
        const latestAssistant = [...(Array.isArray(chat.messages) ? chat.messages : [])].reverse().find(message => message && message.role === 'assistant')
        const turn = latestAssistant ? Math.max(0, Number(latestAssistant.turn) || 0) : 0
        if (!turn) return undefined
        const key = sessionId + ':' + turn
        if (autoRetryRef.current[key]) return undefined
        autoRetryRef.current[key] = true
        requestJson('/plugins/creative-suite/tavern/chat/retry-mvu', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sessionId, turn, guidance: '自动重试：检测到结算失败' })
        }).then(() => loadState()).catch(error => setError(`自动重试 MVU 结算失败：${String(error && error.message || error)}`))
        return undefined
      }, [autoRetrySettle, chat, sessionId, chatId])

      react.useEffect(() => {
        if (!polling || !sessionId) return undefined
        let active = true
        const timer = setInterval(async () => {
          try {
            const payload = await requestJson(`/plugins/creative-suite/tavern/gameplay/state?sessionId=${encodeURIComponent(sessionId)}`)
            if (!active) return
            setChat(payload.chat || null)
            setActivity(payload.activity || null)
            const nextChat = payload.chat || null
            const count = nextChat && Array.isArray(nextChat.messages)
              ? nextChat.messages.filter(message => message && message.role === 'assistant').length
              : 0
            const busyNow = payload.activity && payload.activity.busy === true
            if (count > assistantCountRef.current && !busyNow && !settlementBusy(nextChat)) {
              setPolling(false)
              setNotice('正文与后台结算已完成')
              runPlayHelperCycle()
            }
          } catch (err) {
            if (active) setError(String(err && err.message || err))
          }
        }, 1800)
        return () => { active = false; clearInterval(timer) }
      }, [polling, sessionId])

      async function startGame() {
        const card = String(sourceCard || '').trim()
        if (!card) { setError('请选择人物卡'); return }
        setBusy(true); setError(''); setNotice(''); setCandidates(null)
        try {
          if (sessionId || chatId) {
            try {
              await requestJson('/plugins/creative-suite/tavern/gameplay/dispose', {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify({ sessionId: sessionId || undefined, chatId: chatId || undefined })
              })
            } catch (_error) {}
            setPolling(false)
            setSessionId('')
            setChatId('')
            setChat(null)
            setActivity(null)
          }
          const payload = await requestJson('/plugins/creative-suite/tavern/gameplay/create', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sourceCard: card, mode })
          })
          setSessionId(payload.sessionId || '')
          setChatId(payload.chat && payload.chat.id || '')
          setChat(payload.chat || null)
          setActivity(null)
          setRequiresBrowser(payload.requiresBrowser === true)
          if (payload.error) {
            setError(payload.error)
          } else if (payload.requiresBrowser === true) {
            setNotice('该卡需要浏览器脚本运行时，纯 API 兼容模式可能无法发送输入；复杂卡请回酒馆工作台。')
          } else {
            setNotice('已创建独立游玩会话，可以直接输入。')
          }
          try {
            const patchPayload = await requestJson('/plugins/creative-suite/tavern/session-patch/ensure', { method: 'POST' })
            setSessionPatch(patchPayload.patch || null)
          } catch (_error) {}
          await startPlayHelperRuntime(payload.sessionId || '')
          setError('')
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      async function loadState() {
        if (!sessionId) return null
        const payload = await requestJson(`/plugins/creative-suite/tavern/gameplay/state?sessionId=${encodeURIComponent(sessionId)}`)
        setChat(payload.chat || null)
        setChatId(payload.chat && payload.chat.id || '')
        setActivity(payload.activity || null)
        return payload
      }

      async function sendInput() {
        if (!sessionId) { setError('请先创建游玩会话'); return }
        if (requiresBrowser) { setError('该卡需要浏览器脚本运行时，当前纯 API 无法发送输入'); return }
        const text = String(input || '').trim()
        if (!text) { setError('请输入内容'); return }
        setBusy(true); setError(''); setNotice('已提交，等待正文与后台结算…'); setCandidates(null)
        // P2: 乐观更新——先把用户消息塞进 chat，失败再回滚。
        const prevChat = chat
        const optimisticMsg = { id: `optimistic-${Date.now()}`, role: 'user', content: text, optimistic: true }
        try {
          if (prevChat && Array.isArray(prevChat.messages)) {
            setChat({ ...prevChat, messages: [...prevChat.messages, optimisticMsg] })
          }
          setInput('')
          const before = chat && Array.isArray(chat.messages)
            ? chat.messages.filter(message => message && message.role === 'assistant').length
            : 0
          assistantCountRef.current = before
          await emitPlayHelperEvent('USER_MESSAGE_RENDERED', { text, role: 'user', sessionId })
          await emitPlayHelperEvent('MESSAGE_RENDERED', { text, role: 'user', sessionId })
          await emitPlayHelperEvent('GENERATION_STARTED', { input: text, sessionId })
          await emitPlayHelperEvent('STREAMING_STARTED', { input: text, sessionId })
          await requestJson('/plugins/creative-suite/tavern/gameplay/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sessionId, input: text })
          })
          setPolling(true)
          await loadState()
        } catch (err) {
          // P2: 回滚乐观消息。
          setChat(prevChat)
          setInput(text)
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      async function cancelGame() {
        if (!sessionId) return
        setBusy(true); setError(''); setNotice('')
        try {
          await requestJson('/plugins/creative-suite/tavern/gameplay/cancel', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sessionId })
          })
          setPolling(false)
          await loadState()
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      async function deleteGame() {
        if (!sessionId && !chatId) return
        setBusy(true); setError(''); setNotice('')
        try {
          const payload = await requestJson('/plugins/creative-suite/tavern/gameplay/dispose', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sessionId: sessionId || undefined, chatId: chatId || undefined })
          })
          if (helperRuntimeId) {
            try {
              await requestJson(`/plugins/creative-suite/helper/runtime/${encodeURIComponent(helperRuntimeId)}/stop`, { method: 'POST', body: '{}' })
            } catch (_error) {}
          }
          setHelperRuntimeId('')
          setHelperRuntimeStatus('')
          setPolling(false)
          setSessionId('')
          setChatId('')
          setChat(null)
          setActivity(null)
          setCandidates(null)
          setNotice(`独立游玩会话已清理：chat=${payload.deletedChat ? 'yes' : 'no'} automation=${payload.deletedAutomation ? 'yes' : 'no'}${payload.deferred ? '（后台任务未停止，已暂缓删 chat）' : ''}`)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      async function openFullTavern() {
        setBusy(true); setError('')
        try {
          const payload = await requestJson('/plugins/creative-suite/tavern/launch')
          if (!payload.url) throw new Error('没有可用的 Tavern 启动地址')
          const opened = window.open(payload.url, '_blank')
          if (!opened) window.location.href = payload.url
          setNotice('已打开完整酒馆工作台')
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      async function startPlayHelperRuntime(sessionIdArg) {
        if (!sourceCard) return
        try {
          const payload = await requestJson('/plugins/creative-suite/helper/runtime/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sourceCard, sessionId: sessionIdArg })
          })
          setHelperRuntimeId(payload.runtime.id)
          setHelperRuntimeStatus(`scripts ${(payload.runtime.scripts || []).length}`)
        } catch (error) {
          setHelperRuntimeId('')
          setHelperRuntimeStatus('not available: ' + String(error && error.message || error))
        }
      }

      async function emitPlayHelperEvent(event, payload) {
        if (!helperRuntimeId) return null
        try {
          const response = await requestJson('/plugins/creative-suite/helper/runtime/event', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ runtimeId: helperRuntimeId, event, payload: payload || {} })
          })
          return response.runtime
        } catch (error) {
          setHelperRuntimeStatus('event failed: ' + String(error && error.message || error))
          return null
        }
      }

      async function runPlayHelperCycle() {
        if (!helperRuntimeId || !sessionId) return
        try {
          await requestJson(`/plugins/creative-suite/helper/runtime/${encodeURIComponent(helperRuntimeId)}/from-tavern`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sessionId })
          })
          await emitPlayHelperEvent('CHAT_CHANGED', { sessionId })
          const state = await requestJson(`/plugins/creative-suite/tavern/gameplay/state?sessionId=${encodeURIComponent(sessionId)}`)
          const messages = state && state.chat && Array.isArray(state.chat.messages) ? state.chat.messages : []
          const last = messages.length > 0 ? messages[messages.length - 1] : null
          const lastText = String(last && (last.text || last.displayText || last.message) || '')
          await emitPlayHelperEvent('CHARACTER_MESSAGE_RENDERED', { text: lastText, role: last && last.role || 'assistant', sessionId })
          await emitPlayHelperEvent('MESSAGE_RENDERED', { text: lastText, role: last && last.role || 'assistant', sessionId })
          await emitPlayHelperEvent('MESSAGE_RECEIVED', { text: lastText, role: last && last.role || 'assistant' })
          await emitPlayHelperEvent('STREAMING_ENDED', { sessionId })
          await emitPlayHelperEvent('GENERATION_ENDED', { sessionId })
          await requestJson(`/plugins/creative-suite/helper/runtime/${encodeURIComponent(helperRuntimeId)}/sync`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sessionId })
          })
          setHelperRuntimeStatus('synced ' + new Date().toLocaleTimeString())
        } catch (error) {
          setHelperRuntimeStatus('cycle failed: ' + String(error && error.message || error))
        }
      }

      async function writeVariables() {
        if (!sessionId) { setError('请先创建游玩会话'); return }
        let variables
        try { variables = JSON.parse(variableJson || '{}') } catch (error) { setError('变量 JSON 格式无效'); return }
        if (!variables || typeof variables !== 'object' || Array.isArray(variables)) { setError('变量必须是 JSON 对象'); return }
        setVariableBusy(true); setError(''); setVariableResult(null)
        try {
          const payload = await requestJson('/plugins/creative-suite/tavern/gameplay/variables', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sessionId, variables, option: { type: 'chat' } })
          })
          setVariableResult(payload)
          await loadState()
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setVariableBusy(false)
        }
      }

      async function runChatOperation(kind) {
        if (!sessionId) { setError('请先创建游玩会话'); return }
        if (!chatId) { setError('当前会话缺少 chatId'); return }
        const latestAssistant = [...messages].reverse().find(message => message && message.role === 'assistant')
        const turn = latestAssistant ? Math.max(0, Number(latestAssistant.turn) || 0) : 0
        const routes = {
          regen: { path: '/plugins/creative-suite/tavern/chat/regen', body: { sessionId, chatId, guidance: operationGuidance } },
          rollback: { path: '/plugins/creative-suite/tavern/chat/rollback', body: { sessionId, chatId } },
          undo: { path: '/plugins/creative-suite/tavern/chat/undo-rollback', body: { sessionId, chatId } },
          'retry-mvu': { path: '/plugins/creative-suite/tavern/chat/retry-mvu', body: { sessionId, turn, guidance: operationGuidance } }
        }
        const route = routes[kind]
        if (!route) { setError('未知操作'); return }
        setOperationBusy(true); setError(''); setOperationResult(null)
        try {
          const payload = await requestJson(route.path, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(route.body)
          })
          setOperationResult(payload)
          await loadState()
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setOperationBusy(false)
        }
      }

      async function generateCandidates() {
        if (!sessionId) { setError('请先创建游玩会话'); return }
        setBusy(true); setError(''); setCandidates(null)
        setNotice('正在生成候选项（硬超时 60 秒，超时自动取消）…')
        try {
          const payload = await requestJson('/plugins/creative-suite/tavern/gameplay/candidates', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sessionId, timeoutMs: 60000 })
          })
          if (payload.timedOut || payload.failed) {
            setCandidates(null)
            setNotice((payload.fallback && payload.fallback.message) || '候选生成失败，已回退到手动输入')
            setError(payload.cancelError ? `候选任务已超时，但取消失败：${payload.cancelError}` : '')
            return
          }
          const saved = payload.candidates
          if (saved && Array.isArray(saved.choices) && saved.choices.length > 0) {
            setCandidates(saved)
            setNotice(`已生成 ${saved.choices.length} 个候选项`)
          } else {
            setCandidates(null)
            setNotice('候选任务已完成，但没有返回可选项，已回退到手动输入')
          }
        } catch (err) {
          setCandidates(null)
          setError(`候选生成失败，已回退到手动输入：${String(err && err.message || err)}`)
        } finally {
          setBusy(false)
        }
      }

      async function sendCandidate(choice) {
        if (!sessionId) { setError('请先创建游玩会话'); return }
        if (requiresBrowser) { setError('该卡需要浏览器脚本运行时，当前纯 API 无法发送输入'); return }
        if (!choice) { setError('候选项不存在'); return }
        const requestId = candidates && candidates.requestId
        if (!requestId) { setError('缺少候选 requestId，请重新生成候选项'); return }
        setBusy(true); setError(''); setNotice('已选用候选，等待正文与后台结算…')
        try {
          const before = chat && Array.isArray(chat.messages)
            ? chat.messages.filter(message => message && message.role === 'assistant').length
            : 0
          assistantCountRef.current = before
          await emitPlayHelperEvent('GENERATION_STARTED', { candidate: choice.__candidate, type: choice.__type || 'action', sessionId })
          await requestJson('/plugins/creative-suite/tavern/gameplay/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              sessionId,
              inputFrom: { candidate: choice.__candidate, type: choice.__type || 'action' },
              previousRequestId: requestId
            })
          })
          setCandidates(null)
          setInput('')
          setPolling(true)
          await loadState()
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      const messages = chat && Array.isArray(chat.messages) ? chat.messages : []
      const candidateChoices = candidates && Array.isArray(candidates.choices)
        ? (() => {
            const counters = {}
            return candidates.choices.map((choice, index) => {
              const type = choice.type || 'action'
              counters[type] = (counters[type] || 0) + 1
              return { ...choice, __type: type, __candidate: counters[type], __key: index }
            })
          })()
        : []
      const statusEntries = []
      function addStatus(label, value, depth = 0) {
        if (statusEntries.length >= 18) return
        if (value === undefined || value === null || value === '') return
        if (Array.isArray(value)) {
          const text = value.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('、')
          if (text.trim()) statusEntries.push({ label, value: text.slice(0, 220) })
          return
        }
        if (typeof value === 'object') {
          if (depth >= 2) {
            const text = JSON.stringify(value)
            if (text && text !== '{}') statusEntries.push({ label, value: text.slice(0, 220) })
            return
          }
          for (const [key, child] of Object.entries(value)) addStatus(label ? `${label}.${key}` : key, child, depth + 1)
          return
        }
        statusEntries.push({ label, value: String(value).slice(0, 220) })
      }
      if (chat && chat.variables && typeof chat.variables === 'object') {
        for (const [key, value] of Object.entries(chat.variables)) addStatus(key, value)
      }
      if (chat && chat.posture && typeof chat.posture === 'object') {
        addStatus('posture', chat.posture.text || chat.posture.summary || chat.posture)
      }
      if (chat && chat.ledger && typeof chat.ledger === 'object') addStatus('ledger', chat.ledger)
      if (chat && chat.mvu && typeof chat.mvu === 'object') addStatus('mvu', chat.mvu)
      if (chat) {
        addStatus('settleStatus', chat.settleStatus)
        addStatus('settleError', chat.settleError)
        addStatus('lastSettle', chat.lastSettle)
        addStatus('backgroundTasks', chat.backgroundTasks)
      }
      const statusPanelHtml = statusEntries.length > 0
        ? '<div style="border:1px solid rgba(255,255,255,.14);border-radius:9px;padding:8px;background:rgba(0,0,0,.16);font-size:11px">'
          + '<div style="font-weight:700;margin-bottom:5px">MVU / 状态面板</div>'
          + statusEntries.map(entry => '<div style="display:flex;gap:8px;padding:3px 0;border-top:1px solid rgba(255,255,255,.06)"><span style="opacity:.6;min-width:90px">' + escapeHtml(entry.label) + '</span><span style="white-space:pre-wrap;overflow-wrap:anywhere">' + escapeHtml(entry.value) + '</span></div>').join('')
          + '</div>'
        : ''
      const selectStyle = { padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit', maxWidth: '100%' }
      const statusCharName = (chat && (chat.cardName || (chat.card && chat.card.name))) || (cards.find(card => String(card.path || '').replace(/^cards\//, '') === String(sourceCard || '')) || {}).name || String(sourceCard || '') || '未选卡'
      const statusScene = (chat && (chat.title || chat.scene || (chat.macroState && chat.macroState.scene))) || (chat && chat.mode || mode) || ''
      const statusStatCount = statusEntries.length
      const statusMsgCount = messages.length
      const statusBar = react.createElement('div', {
        style: {
          display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px',
          padding: '7px 10px', borderRadius: '9px', background: 'rgba(0,0,0,.16)',
          border: '1px solid rgba(255,255,255,.12)', fontSize: '12px'
        }
      },
        react.createElement('span', { style: { fontWeight: 700 } }, `🧑 ${statusCharName}`),
        statusScene ? react.createElement('span', { style: { opacity: .85 } }, `📍 ${String(statusScene).slice(0, 60)}`) : null,
        react.createElement('span', { style: { opacity: .85 } }, `📊 状态 ${statusStatCount} · 消息 ${statusMsgCount}`),
        activity ? react.createElement('span', { style: { opacity: .8 } }, activity.busy ? '⏳ 生成中' : '✅ 空闲') : null,
        polling ? react.createElement('span', { style: { color: '#d8b46a' } }, '等待回复…') : null,
        sessionId ? react.createElement('span', { style: { opacity: .55, fontSize: '11px' } }, `会话 ${sessionId.slice(0, 12)}…`) : null,
        sessionPatch ? react.createElement('span', { style: { color: sessionPatch.ready ? '#8fbf7f' : '#d8b46a', fontSize: '11px' } }, `sessionPatch=${sessionPatch.ready ? 'ready' : (sessionPatch.status || 'not-ready')}`) : null,
        helperRuntimeStatus ? react.createElement('span', { style: { color: helperRuntimeId ? '#8fbf7f' : '#d8b46a', fontSize: '11px' } }, `helper=${helperRuntimeStatus}`) : null
      )
      const browserCard = requiresBrowser && sessionId ? react.createElement('div', {
        style: {
          marginBottom: '10px', padding: '10px 12px', borderRadius: '10px',
          background: 'rgba(216,180,106,.10)', border: '1px solid rgba(216,180,106,.45)', fontSize: '12px'
        }
      },
        react.createElement('div', { style: { fontWeight: 700, marginBottom: '4px' } }, '🌐 浏览器卡：当前纯 API 兼容模式无法发送输入'),
        react.createElement('div', { style: { opacity: .8, marginBottom: '8px' } }, '该人物卡需要浏览器脚本运行时（MVU / HTML / 卡内脚本）。可继续查看正文与状态，或前往完整酒馆工作台游玩。'),
        react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '5px 10px' }, onClick: openFullTavern }, '在完整酒馆工作台打开')
      ) : null
      const playWrapStyle = mobileView
        ? { maxWidth: '430px', margin: '0 auto', border: '1px solid rgba(255,255,255,.14)', borderRadius: '18px', padding: '12px', background: 'rgba(0,0,0,.10)' }
        : {}
      const setup = react.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' } },
        react.createElement('select', { value: sourceCard, onChange: event => setSourceCard(event.target.value), style: selectStyle },
          react.createElement('option', { value: '' }, '选择人物卡'),
          cards.map(card => react.createElement('option', { key: card.path || card.name, value: String(card.path || '').replace(/^cards\//, '') }, card.name || card.path))
        ),
        react.createElement('select', { value: mode, onChange: event => setMode(event.target.value), style: selectStyle },
          react.createElement('option', { value: 'story' }, '故事模式'),
          react.createElement('option', { value: 'card' }, '卡片工作台')
        ),
        react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: startGame }, busy ? '创建中…' : '新建独立游玩'),
        sessionId ? react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: cancelGame }, '取消当前任务') : null,
        (sessionId || chatId) ? react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: deleteGame }, '删除独立会话') : null,
        react.createElement('button', {
          type: 'button', className: 'dsh-tavern-entry-btn',
          style: { width: 'auto', margin: 0, padding: '6px 10px', opacity: mobileView ? 1 : .62 },
          onClick: () => setMobileView(value => !value)
        }, mobileView ? '📱 小手机视图：开' : '📱 小手机视图：关')
      )

      return react.createElement(react.Fragment, null,
        react.createElement('div', { style: { opacity: .65, marginBottom: '10px', fontSize: '12px' } }, '兼容模式：通过正式酒馆 gameplay API 创建独立会话，适合无浏览器脚本卡；MVU / HTML / 卡内脚本复杂卡仍建议回酒馆工作台。'),
        capabilities ? react.createElement('div', { style: { opacity: .6, marginBottom: '10px', fontSize: '11px' } }, `API v${capabilities.version} · browserScriptRuntime=${String(capabilities.browserScriptRuntime)}`) : null,
        setup,
        error ? react.createElement('div', { style: { color: '#ef8f8f', marginBottom: '10px' } }, error) : null,
        notice ? react.createElement('div', { style: { color: '#d8b46a', marginBottom: '10px' } }, notice) : null,
        statusBar,
        browserCard,
        react.createElement('details', { style: { marginBottom: '10px', padding: '8px', borderRadius: '9px', background: 'rgba(0,0,0,.10)', border: '1px solid var(--dsw-alias-border-l2)' } },
          react.createElement('summary', { style: { cursor: 'pointer', fontWeight: 700, fontSize: '11px' } }, '兼容诊断'),
          react.createElement('pre', { style: { marginTop: '8px', padding: '8px', maxHeight: '20vh', overflow: 'auto', borderRadius: '8px', background: 'rgba(0,0,0,.16)', fontSize: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } },
            JSON.stringify({ helperRuntimeStatus, helperRuntimeId, sessionPatchReady: sessionPatch ? !!sessionPatch.ready : null, sessionPatchStatus: sessionPatch ? (sessionPatch.status || null) : null, candidateCount: candidates && Array.isArray(candidates.choices) ? candidates.choices.length : (candidates ? 'non-list' : null), requiresBrowser, capabilitiesVersion: capabilities ? capabilities.version : null }, null, 2).slice(0, 4000))
        ),
        sessionId ? react.createElement('div', { style: playWrapStyle },
          sessionId ? react.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '5px', fontSize: '11px', opacity: .85 } },
          react.createElement('select', { value: textMode, onChange: event => setTextMode(event.target.value), style: { padding: '3px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit', fontSize: '11px' } },
            react.createElement('option', { value: 'projection' }, '投影文本'),
            react.createElement('option', { value: 'raw' }, '原文'),
            react.createElement('option', { value: 'regex' }, 'POC 正则')
          ),
          textMode === 'regex' ? react.createElement('select', { value: regexPresetId, onChange: event => setRegexPresetId(event.target.value), style: { padding: '3px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit', fontSize: '11px' } },
            react.createElement('option', { value: '' }, '选择正则预设'),
            regexPresets.map(preset => react.createElement('option', { key: preset.id, value: preset.id }, preset.name || preset.id))
          ) : null,
          textMode === 'regex' ? react.createElement('span', null, `脚本 ${regexScripts.length}`) : null
        ) : null,
        sessionId ? react.createElement('div', { style: { maxHeight: '46vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', borderRadius: '10px', background: 'rgba(0,0,0,.12)' } },
          messages.length === 0 ? react.createElement('div', { style: { opacity: .5 } }, '暂无消息') :
            messages.map((message, index) => {
              const rawText = message.text || message.content || ''
              const shownText = textMode === 'projection'
                ? (message.displayText || message.projectionText || rawText)
                : textMode === 'regex'
                  ? applyRegexScriptsClient(regexScripts, rawText)
                  : rawText
              return react.createElement('div', {
                key: index,
                style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '8px 10px', borderRadius: '9px', background: message.role === 'user' ? 'rgba(96,140,220,.18)' : 'rgba(154,98,47,.20)', fontSize: '12px' }
              }, `${message.role === 'user' ? '你' : (message.name || '角色')}：${shownText}`)
            })
        ) : null,
        sessionId && statusPanelHtml ? react.createElement('div', { style: { marginTop: '10px' }, dangerouslySetInnerHTML: { __html: statusPanelHtml } }) : null,
        sessionId ? react.createElement('details', { style: { marginTop: '10px', padding: '8px', borderRadius: '9px', background: 'rgba(0,0,0,.10)', border: '1px solid var(--dsw-alias-border-l2)' } },
          react.createElement('summary', { style: { cursor: 'pointer', fontWeight: 700, fontSize: '11px' } }, '变量写入 POC（需卡片启用 Helper / MVU 运行时）'),
          react.createElement('textarea', {
            value: variableJson,
            onChange: event => setVariableJson(event.target.value),
            style: { boxSizing: 'border-box', width: '100%', minHeight: '120px', marginTop: '8px', padding: '8px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)', background: 'rgba(0,0,0,.15)', color: 'inherit', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11px' }
          }),
          react.createElement('button', {
            type: 'button', className: 'dsh-tavern-entry-btn', disabled: variableBusy,
            style: { width: 'auto', marginTop: '6px', padding: '5px 10px' },
            onClick: writeVariables
          }, variableBusy ? '写入中…' : '写入 chat.variables'),
          variableResult ? react.createElement('pre', { style: { marginTop: '8px', padding: '8px', maxHeight: '18vh', overflow: 'auto', borderRadius: '8px', background: 'rgba(0,0,0,.16)', fontSize: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(variableResult, null, 2).slice(0, 6000)) : null
        ) : null,
        sessionId ? react.createElement('details', { style: { marginTop: '10px', padding: '8px', borderRadius: '9px', background: 'rgba(0,0,0,.10)', border: '1px solid var(--dsw-alias-border-l2)' } },
          react.createElement('summary', { style: { cursor: 'pointer', fontWeight: 700, fontSize: '11px' } }, '会话操作 POC：重新生成 / 回退 / 撤销回退 / 重试 MVU 结算'),
          react.createElement('textarea', {
            value: operationGuidance,
            onChange: event => setOperationGuidance(event.target.value),
            placeholder: '可选：本轮正文的演出指引 / MVU 重试说明',
            style: { boxSizing: 'border-box', width: '100%', minHeight: '60px', marginTop: '8px', padding: '8px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)', background: 'rgba(0,0,0,.15)', color: 'inherit', fontSize: '11px' }
          }),
          react.createElement('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px', fontSize: '11px', opacity: .85 } },
            react.createElement('input', { type: 'checkbox', checked: autoRetrySettle, onChange: event => setAutoRetrySettle(event.target.checked) }),
            '检测到结算失败时自动重试一次'
          ),
          react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: operationBusy, style: { width: 'auto', margin: 0, padding: '5px 9px', fontSize: '11px' }, onClick: () => runChatOperation('regen') }, '重新生成正文'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: operationBusy, style: { width: 'auto', margin: 0, padding: '5px 9px', fontSize: '11px' }, onClick: () => runChatOperation('rollback') }, '回退上一轮'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: operationBusy, style: { width: 'auto', margin: 0, padding: '5px 9px', fontSize: '11px' }, onClick: () => runChatOperation('undo') }, '撤销回退'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: operationBusy, style: { width: 'auto', margin: 0, padding: '5px 9px', fontSize: '11px' }, onClick: () => runChatOperation('retry-mvu') }, '重试 MVU 结算')
          ),
          operationResult ? react.createElement('pre', { style: { marginTop: '8px', padding: '8px', maxHeight: '18vh', overflow: 'auto', borderRadius: '8px', background: 'rgba(0,0,0,.16)', fontSize: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(operationResult, null, 2).slice(0, 6000)) : null
        ) : null,
        sessionId ? react.createElement('div', { style: { marginTop: '10px' } },
          react.createElement('textarea', {
            value: input,
            onChange: event => setInput(event.target.value),
            placeholder: requiresBrowser ? '该卡需要浏览器脚本运行时，当前不可发送' : '输入行动或对话',
            disabled: requiresBrowser,
            style: { boxSizing: 'border-box', width: '100%', minHeight: '84px', padding: '9px', borderRadius: '9px', border: '1px solid var(--dsw-alias-border-l2)', background: 'rgba(0,0,0,.15)', color: 'inherit', resize: 'vertical' }
          }),
          react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy || polling || requiresBrowser, style: { width: 'auto', margin: 0, padding: '6px 12px' }, onClick: sendInput }, polling ? '等待回复…' : '发送'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy || requiresBrowser, style: { width: 'auto', margin: 0, padding: '6px 12px' }, onClick: generateCandidates }, '生成候选'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 12px' }, onClick: loadState }, '刷新状态')
          )
        ) : null
        ) : null,
        candidateChoices.length > 0 ? react.createElement('div', { style: { marginTop: '10px', padding: '10px', borderRadius: '9px', background: 'rgba(0,0,0,.12)' } },
          react.createElement('div', { style: { fontWeight: 700, marginBottom: '6px' } }, '候选项'),
          candidateChoices.map(choice => react.createElement('button', {
            key: choice.__key,
            type: 'button',
            className: 'dsh-tavern-entry-btn',
            disabled: busy || polling,
            style: { width: '100%', margin: '0 0 5px', padding: '7px 9px', textAlign: 'left' },
            onClick: () => sendCandidate(choice)
          }, `${choice.__type === 'scene' ? '场景' : '行动'} ${choice.__candidate}：${choice.text || ''}`))
        ) : null,
        candidates && candidateChoices.length === 0 ? react.createElement('pre', { style: { marginTop: '10px', padding: '10px', maxHeight: '30vh', overflow: 'auto', borderRadius: '9px', background: 'rgba(0,0,0,.16)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(candidates, null, 2).slice(0, 12000)) : null
      )
    }

    // P0-7: settings 页聚合诊断 —— 复用 TavernDiagPane 的同一组探针
    // （status / capabilities / session-patch / helper / cards），加 settings
    // （模型目录）与 models 探针后一处展示；诊断逻辑与 TavernDiagPane 共用
    // describeDiagEntry / buildDiagEntries，行为保持一致。
    function describeDiagEntry(def, entry) {
      if (!entry || entry.status !== 'fulfilled') return { label: def.label, ok: false, text: entry ? String(entry.reason && entry.reason.message || entry.reason) : '未请求' }
      const payload = entry.value || {}
      if (def.key === 'status') return { label: def.label, ok: true, text: (payload.name || '') + ' ' + (payload.version || '') + ' · ' + ((payload.modes || []).join('/') || '无模式') }
      if (def.key === 'capabilities') {
        const full = payload.browserScriptRuntime === true
        return { label: def.label, ok: true, text: 'API v' + (payload.version || '?') + ' · browserScriptRuntime=' + String(payload.browserScriptRuntime) + ' · ' + (full ? '完整模式' : '兼容模式（纯 API）') }
      }
      if (def.key === 'sessionPatch') {
        const patch = payload.patch || {}
        const ready = patch.ready === true || patch.clientReady === true
        return { label: def.label, ok: ready, text: ready ? 'ready' : String(patch.status || 'not-ready') }
      }
      if (def.key === 'helper') return { label: def.label, ok: true, text: 'count=' + String(payload.count === undefined ? '?' : payload.count) }
      if (def.key === 'settingsDiag') {
        const groups = payload.catalog && Array.isArray(payload.catalog.groups) ? payload.catalog.groups : []
        const failures = payload.catalog && Array.isArray(payload.catalog.failures) ? payload.catalog.failures : []
        const count = groups.reduce((sum, group) => sum + (Array.isArray(group.models) ? group.models.length : 0), 0)
        return { label: def.label, ok: failures.length === 0, text: `providers=${groups.length} · models=${count}${failures.length > 0 ? ` · failures=${failures.length}` : ''}` }
      }
      if (def.key === 'models') {
        const models = Array.isArray(payload.models) ? payload.models : (Array.isArray(payload.resources) ? payload.resources : [])
        return { label: def.label, ok: true, text: 'models=' + String(models.length) }
      }
      return { label: def.label, ok: true, text: 'cards=' + String((payload.cards || []).length) }
    }

    function buildDiagEntries(settled, defs) {
      const entries = defs.map((def, index) => describeDiagEntry(def, settled[index]))
      const failed = entries.filter(item => !item.ok)
      return { entries, verdict: failed.length === 0 ? '✅ 全部就绪' : '⚠️ ' + failed.length + ' 项异常：' + failed.map(item => item.label).join('、') }
    }

    function dumpDiagEntries(settled, defs) {
      const dump = {}
      defs.forEach((def, index) => { dump[def.key] = settled[index] && settled[index].status === 'fulfilled' ? settled[index].value : { error: settled[index] ? String(settled[index].reason && settled[index].reason.message || settled[index].reason) : '未请求' } })
      return JSON.stringify(dump, null, 2).slice(0, 8000)
    }

    // P0-7: settings 页聚合诊断入口 —— 与 TavernDiagPane 共用同一组探针
    // （status / capabilities / session-patch / helper / cards），外加 settings
    // （模型目录，复用本页已加载的 settings，缺省再请求）与 models。
    function SettingsDiagSection(props) {
      const [entries, setEntries] = react.useState([])
      const [verdict, setVerdict] = react.useState('')
      const [raw, setRaw] = react.useState('')
      const [busy, setBusy] = react.useState(false)
      const [error, setError] = react.useState('')
      const defs = [
        { key: 'status', label: '运行状态' },
        { key: 'capabilities', label: '游玩能力' },
        { key: 'sessionPatch', label: '会话补丁' },
        { key: 'helper', label: 'Helper 运行时' },
        { key: 'cards', label: '人物卡列表' },
        { key: 'settingsDiag', label: '模型目录' },
        { key: 'models', label: '可用模型' }
      ]
      async function refresh() {
        setBusy(true); setError('')
        try {
          const cached = props && props.settings ? props.settings : null
          const settled = await Promise.allSettled([
            requestJson('/plugins/creative-suite/status'),
            requestJson('/plugins/creative-suite/tavern/gameplay/capabilities'),
            requestJson('/plugins/creative-suite/tavern/session-patch/ensure', { method: 'POST', body: '{}' }),
            requestJson('/plugins/creative-suite/helper/runtime'),
            requestJson('/plugins/creative-suite/tavern/gameplay/cards'),
            cached ? Promise.resolve(cached) : requestJson('/plugins/creative-suite/museai/settings'),
            requestJson('/plugins/creative-suite/models')
          ])
          const result = buildDiagEntries(settled, defs)
          setEntries(result.entries)
          setVerdict(result.verdict)
          setRaw(dumpDiagEntries(settled, defs))
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }
      react.useEffect(() => { refresh() }, [])
      return react.createElement('div', { style: { marginTop: '12px', padding: '12px', borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l2)' } },
        react.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' } },
          react.createElement('div', { style: { fontWeight: 700 } }, '🔍 聚合诊断'),
          verdict ? react.createElement('span', { style: { fontSize: '12px' } }, verdict) : null,
          react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 12px' }, onClick: refresh }, busy ? '诊断中…' : '重新诊断')
        ),
        react.createElement('div', { style: { opacity: .6, fontSize: '11px', marginBottom: '10px' } }, '同一入口覆盖：运行状态 · 游玩能力 · 会话补丁 · Helper · 人物卡 · 模型目录 · 可用模型（与酒馆兼容诊断共用探针）。'),
        error ? react.createElement('div', { style: { color: '#ef8f8f', marginBottom: '10px' } }, error) : null,
        react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' } },
          entries.map(item => react.createElement('div', {
            key: item.label,
            style: { padding: '7px 10px', borderRadius: '8px', background: 'rgba(0,0,0,.14)', border: '1px solid var(--dsw-alias-border-l2)', fontSize: '12px' }
          },
            react.createElement('span', { style: { marginRight: '8px' } }, item.ok ? '✅' : '⚠️'),
            react.createElement('strong', null, item.label + '：'),
            react.createElement('span', { style: { opacity: .9, overflowWrap: 'anywhere' } }, item.text)
          ))
        ),
        raw ? react.createElement('pre', { style: { padding: '10px', maxHeight: '30vh', overflow: 'auto', borderRadius: '9px', background: 'rgba(0,0,0,.16)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, raw) : null
      )
    }

    function TavernDiagPane() {
      const [entries, setEntries] = react.useState([])
      const [verdict, setVerdict] = react.useState('')
      const [raw, setRaw] = react.useState('')
      const [busy, setBusy] = react.useState(false)
      const [error, setError] = react.useState('')
      const browserLines = (function () {
        try {
          return [
            'UA ' + String(navigator.userAgent || '').slice(0, 120),
            '语言 ' + String(navigator.language || ''),
            '在线 ' + String(navigator.onLine)
          ].join(' · ')
        } catch (err) { return '浏览器信息不可用' }
      })()
      async function refresh() {
        setBusy(true); setError('')
        try {
          const settled = await Promise.allSettled([
            requestJson('/plugins/creative-suite/status'),
            requestJson('/plugins/creative-suite/tavern/gameplay/capabilities'),
            requestJson('/plugins/creative-suite/tavern/session-patch/ensure', { method: 'POST', body: '{}' }),
            requestJson('/plugins/creative-suite/helper/runtime'),
            requestJson('/plugins/creative-suite/tavern/gameplay/cards')
          ])
          const defs = [
            { key: 'status', label: '运行状态' },
            { key: 'capabilities', label: '游玩能力' },
            { key: 'sessionPatch', label: '会话补丁' },
            { key: 'helper', label: 'Helper 运行时' },
            { key: 'cards', label: '人物卡列表' }
          ]
          const result = buildDiagEntries(settled, defs)
          setEntries(result.entries)
          setVerdict(result.verdict)
          setRaw(dumpDiagEntries(settled, defs))
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }
      react.useEffect(() => { refresh() }, [])
      return react.createElement(react.Fragment, null,
        react.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' } },
          react.createElement('div', { style: { fontWeight: 700 } }, '🔍 兼容诊断'),
          verdict ? react.createElement('span', { style: { fontSize: '12px' } }, verdict) : null,
          react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 12px' }, onClick: refresh }, busy ? '诊断中…' : '重新诊断')
        ),
        error ? react.createElement('div', { style: { color: '#ef8f8f', marginBottom: '10px' } }, error) : null,
        react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' } },
          entries.map(item => react.createElement('div', {
            key: item.label,
            style: { padding: '7px 10px', borderRadius: '8px', background: 'rgba(0,0,0,.14)', border: '1px solid var(--dsw-alias-border-l2)', fontSize: '12px' }
          },
            react.createElement('span', { style: { marginRight: '8px' } }, item.ok ? '✅' : '⚠️'),
            react.createElement('strong', null, item.label + '：'),
            react.createElement('span', { style: { opacity: .9, overflowWrap: 'anywhere' } }, item.text)
          ))
        ),
        react.createElement('div', { style: { padding: '7px 10px', borderRadius: '8px', background: 'rgba(0,0,0,.10)', border: '1px solid var(--dsw-alias-border-l2)', fontSize: '11px', opacity: .85, marginBottom: '10px', overflowWrap: 'anywhere' } }, '🌐 浏览器：' + browserLines),
        raw ? react.createElement('pre', { style: { padding: '10px', maxHeight: '30vh', overflow: 'auto', borderRadius: '9px', background: 'rgba(0,0,0,.16)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, raw) : null
      )
    }

    function TavernModePane(props) {
      const [tab, setTab] = react.useState('play')
      return react.createElement(react.Fragment, null,
        react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } },
          [
            { id: 'play', label: '原生游玩（兼容模式）' },
            { id: 'bridge', label: '快照 / 反馈桥接' },
            { id: 'diag', label: '🔍 兼容诊断' }
          ].map(item => react.createElement('button', {
            key: item.id,
            type: 'button',
            className: 'dsh-tavern-entry-btn',
            style: { width: 'auto', margin: 0, padding: '6px 12px', opacity: tab === item.id ? 1 : .62 },
            onClick: () => setTab(item.id)
          }, item.label))
        ),
        tab === 'play' ? react.createElement(TavernPlayPane, props || {}) : tab === 'diag' ? react.createElement(TavernDiagPane) : react.createElement(TavernBridgePane)
      )
    }

    function TavernBridgePane() {
      const [chats, setChats] = react.useState([])
      const [chatId, setChatId] = react.useState('')
      const [transcript, setTranscript] = react.useState('')
      const [feedback, setFeedback] = react.useState(null)
      const [busy, setBusy] = react.useState(false)
      const [error, setError] = react.useState('')

      react.useEffect(() => {
        let stopped = false
        requestJson('/plugins/creative-suite/tavern/chats')
          .then(payload => { if (!stopped) { setChats(payload.chats || []); setError('') } })
          .catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [])

      async function loadTranscript() {
        if (!chatId) { setError('请选择会话'); return }
        setBusy(true); setError(''); setTranscript(''); setFeedback(null)
        try {
          const payload = await requestJson(`/plugins/creative-suite/tavern/transcript?chatId=${encodeURIComponent(chatId)}`)
          setTranscript(payload.transcript || '')
        } catch (err) { setError(String(err && err.message || err)) } finally { setBusy(false) }
      }

      async function runFeedback() {
        if (!chatId) { setError('请选择会话'); return }
        setBusy(true); setError(''); setFeedback(null)
        try {
          const payload = await requestJson('/plugins/creative-suite/feedback/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ name: 'Tavern 原生桥接反馈', chatId })
          })
          setFeedback(payload.summary || payload)
        } catch (err) { setError(String(err && err.message || err)) } finally { setBusy(false) }
      }

      return react.createElement(react.Fragment, null,
        react.createElement('div', { style: { opacity: .65, marginBottom: '12px', fontSize: '12px' } }, '酒馆桥接：原生读取当前 Tavern 会话正文，并可直接生成反馈与续写大纲。完整原生游玩视图在下一阶段接入。'),
        react.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' } },
          react.createElement('select', { value: chatId, onChange: event => setChatId(event.target.value), style: { padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit' } },
            react.createElement('option', { value: '' }, '选择 Tavern 会话'),
            chats.map(chat => react.createElement('option', { key: chat.id, value: chat.id }, `${chat.cardName || chat.id} · ${chat.mode} · ${chat.requestCount || 0} 请求`))
          ),
          react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy || !chatId, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: loadTranscript }, busy ? '读取中…' : '读取正文'),
          react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy || !chatId, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: runFeedback }, '生成反馈 / 续写')
        ),
        error ? react.createElement('div', { style: { color: '#ef8f8f', marginBottom: '10px' } }, error) : null,
        transcript ? react.createElement('pre', { style: { padding: '12px', maxHeight: '42vh', overflow: 'auto', borderRadius: '10px', background: 'rgba(0,0,0,.16)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, transcript) : react.createElement('div', { style: { opacity: .55 } }, '选择会话后点击“读取正文”。'),
        feedback ? react.createElement('pre', { style: { marginTop: '12px', padding: '12px', maxHeight: '32vh', overflow: 'auto', borderRadius: '10px', background: 'rgba(0,0,0,.16)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(feedback, null, 2).slice(0, 12000)) : null
      )
    }



    function RegexLabPane() {
      const [presets, setPresets] = react.useState([])
      const [presetId, setPresetId] = react.useState('')
      const [scripts, setScripts] = react.useState([])
      const [input, setInput] = react.useState('这是一段测试文本。哈利波特走进了灯塔镇。')
      const [output, setOutput] = react.useState('')
      const [result, setResult] = react.useState(null)
      const [busy, setBusy] = react.useState(false)
      const [error, setError] = react.useState('')

      react.useEffect(() => {
        let stopped = false
        requestJson('/plugins/creative-suite/resources/presets')
          .then(payload => {
            if (stopped) return
            const next = payload.resources || []
            setPresets(next)
            if (next.length > 0) setPresetId(next[0].id)
            setError('')
          })
          .catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [])

      react.useEffect(() => {
        if (!presetId) { setScripts([]); return undefined }
        let stopped = false
        requestJson(`/plugins/creative-suite/regex/scripts/${encodeURIComponent(presetId)}`)
          .then(payload => { if (!stopped) { setScripts(payload.scripts || []); setError('') } })
          .catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [presetId])

      async function runRegex() {
        if (!presetId) { setError('请先选择预设'); return }
        setBusy(true); setError('')
        try {
          const payload = await requestJson('/plugins/creative-suite/regex/apply', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ presetId, text: input, forDisplay: true })
          })
          setOutput(payload.text || '')
          setResult({ applied: payload.applied || [], skipped: payload.skipped || [] })
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      const inputStyle = { boxSizing: 'border-box', width: '100%', minHeight: '180px', padding: '9px', borderRadius: '9px', border: '1px solid var(--dsw-alias-border-l2)', background: 'rgba(0,0,0,.15)', color: 'inherit', resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' }

      return react.createElement(react.Fragment, null,
        react.createElement('div', { style: { opacity: .65, marginBottom: '12px', fontSize: '12px' } }, 'POC 正则显示运行时：从共享预设中读取已启用 regex_scripts，按顺序做简单文本替换。不是完整 ST 正则语义。'),
        react.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' } },
          react.createElement('select', { value: presetId, onChange: event => setPresetId(event.target.value), style: { padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit', minWidth: '260px' } },
            react.createElement('option', { value: '' }, '选择预设'),
            presets.map(preset => react.createElement('option', { key: preset.id, value: preset.id }, `${preset.name || preset.id} · ${preset.data && preset.data.regexCount !== undefined ? preset.data.regexCount + ' regex' : ''}`))
          ),
          react.createElement('span', { style: { fontSize: '12px', opacity: .7 } }, `脚本 ${scripts.length}`),
          react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy || !presetId, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: runRegex }, busy ? '处理中…' : '运行正则'),
          // 正则面板快捷导入：预设 JSON（含 regex_scripts）-> /import/preset。
          react.createElement('label', {
            className: 'dsh-tavern-entry-btn',
            style: { width: 'auto', margin: 0, padding: '6px 10px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }
          }, '从文件导入预设',
            react.createElement('input', {
              type: 'file', accept: '.json', style: { display: 'none' },
              onChange: async event => {
                const file = event.target.files && event.target.files[0]
                if (!file) return
                setError('')
                try {
                  const text = await readFileAsText(file)
                  if (!text.trim()) { setError('文件内容为空'); return }
                  const payload = await requestJson('/plugins/creative-suite/import/preset', {
                    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
                    body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, ''), text })
                  })
                  setPresetId(payload.resource.id)
                } catch (err) { setError(String(err && err.message || err)) }
                event.target.value = ''
              }
            })
          )
        ),
        error ? react.createElement('div', { style: { color: '#ef8f8f', marginBottom: '10px' } }, error) : null,
        react.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'start' } },
          react.createElement('div', null,
            react.createElement('div', { style: { fontWeight: 700, marginBottom: '6px' } }, '输入'),
            react.createElement('textarea', { value: input, onChange: event => setInput(event.target.value), style: inputStyle })
          ),
          react.createElement('div', null,
            react.createElement('div', { style: { fontWeight: 700, marginBottom: '6px' } }, '输出'),
            react.createElement('textarea', { value: output, readOnly: true, style: Object.assign({}, inputStyle, { background: 'rgba(0,0,0,.08)' }) })
          )
        ),
        result ? react.createElement('pre', { style: { marginTop: '12px', padding: '10px', maxHeight: '26vh', overflow: 'auto', borderRadius: '9px', background: 'rgba(0,0,0,.16)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify({ applied: result.applied.length, skipped: result.skipped.length, appliedScripts: result.applied, skippedScripts: result.skipped.slice(0, 20) }, null, 2)) : null
      )
    }

    function cardFieldsFromRecord(card) {
      const raw = card && card.data && card.data.raw
      const data = raw && raw.data && typeof raw.data === 'object'
        ? raw.data
        : card && card.data && card.data.normalized && typeof card.data.normalized === 'object'
          ? card.data.normalized
          : {}
      return {
        name: String(data.name || card && card.name || ''),
        description: String(data.description || ''),
        personality: String(data.personality || ''),
        scenario: String(data.scenario || ''),
        first_mes: String(data.first_mes || data.first_message || ''),
        mes_example: String(data.mes_example || data.example_dialogue || ''),
        creator_notes: String(data.creator_notes || ''),
        system_prompt: String(data.system_prompt || ''),
        post_history_instructions: String(data.post_history_instructions || ''),
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : String(data.tags || ''),
        alternate_greetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings.join('\n---\n') : String(data.alternate_greetings || '')
      }
    }

    function CardWorkbenchPane() {
      const [cards, setCards] = react.useState([])
      const [selectedId, setSelectedId] = react.useState('')
      const [fields, setFields] = react.useState(cardFieldsFromRecord(null))
      const [validation, setValidation] = react.useState(null)
      const [importResult, setImportResult] = react.useState(null)
      const [runtime, setRuntime] = react.useState(null)
      const [runtimeBusy, setRuntimeBusy] = react.useState(false)
      const [helperRuntime, setHelperRuntime] = react.useState(null)
      const [helperEventName, setHelperEventName] = react.useState('MESSAGE_RECEIVED')
      const [helperEventPayload, setHelperEventPayload] = react.useState('{"text":"你好"}')
      const [helperSessionId, setHelperSessionId] = react.useState('')
      const [helperSyncResult, setHelperSyncResult] = react.useState(null)
      const [helperRuntimeBusy, setHelperRuntimeBusy] = react.useState(false)
      const [busy, setBusy] = react.useState(false)
      const [error, setError] = react.useState('')

      react.useEffect(() => {
        let stopped = false
        requestJson('/plugins/creative-suite/resources/cards')
          .then(payload => {
            if (stopped) return
            const next = payload.resources || []
            setCards(next)
            if (next.length > 0) {
              setSelectedId(next[0].id)
              setFields(cardFieldsFromRecord(next[0]))
            }
            setError('')
          })
          .catch(err => { if (!stopped) setError(String(err && err.message || err)) })
        return () => { stopped = true }
      }, [])

      function selectCard(card) {
        setSelectedId(card.id)
        setFields(cardFieldsFromRecord(card))
        setValidation(null)
        setImportResult(null)
        setError('')
      }

      function updateField(key, value) {
        setFields(previous => Object.assign({}, previous, { [key]: value }))
      }

      async function saveCard() {
        if (!selectedId) { setError('请先选择一张卡'); return }
        setBusy(true); setError('')
        try {
          const payload = await requestJson(`/plugins/creative-suite/card/${encodeURIComponent(selectedId)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ fields })
          })
          setValidation(payload.validation || null)
          setCards(previous => previous.map(card => card.id === selectedId ? payload.resource : card))
          setImportResult(null)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      async function startHelperRuntime() {
        if (!selectedId) { setError('请先选择一张卡'); return }
        setHelperRuntimeBusy(true); setError('')
        try {
          const payload = await requestJson('/plugins/creative-suite/helper/runtime/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ cardId: selectedId, sessionId: helperSessionId.trim() || undefined })
          })
          setHelperRuntime(payload.runtime || null)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setHelperRuntimeBusy(false)
        }
      }

      async function emitHelperEvent() {
        if (!helperRuntime || !helperRuntime.id) { setError('请先启动 Helper 运行时'); return }
        let payload
        try { payload = JSON.parse(helperEventPayload || '{}') } catch (_error) { setError('事件 payload JSON 无效'); return }
        setHelperRuntimeBusy(true); setError('')
        try {
          const response = await requestJson('/plugins/creative-suite/helper/runtime/event', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ runtimeId: helperRuntime.id, event: helperEventName, payload })
          })
          setHelperRuntime(response.runtime || null)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setHelperRuntimeBusy(false)
        }
      }

      async function syncHelperRuntime() {
        if (!helperRuntime || !helperRuntime.id) { setError('请先启动 Helper 运行时'); return }
        setHelperRuntimeBusy(true); setError(''); setHelperSyncResult(null)
        try {
          const response = await requestJson(`/plugins/creative-suite/helper/runtime/${encodeURIComponent(helperRuntime.id)}/sync`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sessionId: helperRuntime.sessionId || helperSessionId.trim() || undefined })
          })
          setHelperRuntime(response.runtime || helperRuntime)
          setHelperSyncResult(response.sync || null)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setHelperRuntimeBusy(false)
        }
      }

      async function stopHelperRuntime() {
        if (!helperRuntime || !helperRuntime.id) return
        setHelperRuntimeBusy(true); setError('')
        try {
          await requestJson(`/plugins/creative-suite/helper/runtime/${encodeURIComponent(helperRuntime.id)}/stop`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: '{}'
          })
          setHelperRuntime(null)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setHelperRuntimeBusy(false)
        }
      }

      async function inspectRuntime() {
        if (!selectedId) { setError('请先选择一张卡'); return }
        setRuntimeBusy(true); setError('')
        try {
          const payload = await requestJson(`/plugins/creative-suite/card/${encodeURIComponent(selectedId)}/runtime`)
          setRuntime(payload.runtime || null)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setRuntimeBusy(false)
        }
      }

      async function validateCard() {
        if (!selectedId) { setError('请先选择一张卡'); return }
        setBusy(true); setError('')
        try {
          const payload = await requestJson(`/plugins/creative-suite/validate/card/${encodeURIComponent(selectedId)}`)
          setValidation(payload.validation || null)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      function exportCard() {
        if (!selectedId) return
        window.open(`/plugins/creative-suite/export/card/${encodeURIComponent(selectedId)}`, '_blank')
      }

      async function importCard() {
        if (!selectedId) { setError('请先选择一张卡'); return }
        setBusy(true); setError('')
        try {
          const payload = await requestJson(`/plugins/creative-suite/import/tavern/card/${encodeURIComponent(selectedId)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: '{}'
          })
          setImportResult(payload.tavern || payload.card || payload)
          setValidation(payload.validation || null)
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setBusy(false)
        }
      }

      const inputStyle = { boxSizing: 'border-box', width: '100%', padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'rgba(0,0,0,.12)', color: 'inherit', fontSize: '12px' }
      const textareaStyle = Object.assign({}, inputStyle, { minHeight: '90px', resize: 'vertical' })
      const selectedCard = cards.find(card => card.id === selectedId) || null
      const field = (key, label, multiline) => react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px' } },
        react.createElement('div', { style: { fontSize: '11px', opacity: .7 } }, label),
        multiline
          ? react.createElement('textarea', { value: fields[key] || '', onChange: event => updateField(key, event.target.value), style: textareaStyle })
          : react.createElement('input', { value: fields[key] || '', onChange: event => updateField(key, event.target.value), style: inputStyle })
      )

      return react.createElement(react.Fragment, null,
        error ? react.createElement('div', { style: { color: '#ef8f8f', marginBottom: '10px' } }, error) : null,
        react.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: '14px', alignItems: 'start' } },
          react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '68vh', overflow: 'auto' } },
            react.createElement('div', { style: { fontWeight: 700 } }, `人物卡 ${cards.length}`),
            cards.length === 0 ? react.createElement('div', { style: { opacity: .55 } }, '暂无人物卡，先去资源库导入或生成。') :
              cards.map(card => react.createElement('button', {
                key: card.id,
                type: 'button',
                className: 'dsh-tavern-entry-btn',
                style: { width: '100%', margin: 0, textAlign: 'left', padding: '7px 9px', opacity: selectedId === card.id ? 1 : .75 },
                onClick: () => selectCard(card)
              }, `${card.name || card.id} · ${card.source || 'card'}`))
          ),
          selectedCard ? react.createElement('div', { style: { minWidth: 0 } },
            react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } },
              react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: saveCard }, busy ? '处理中…' : '保存'),
              react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: validateCard }, '校验'),
              react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: runtimeBusy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: inspectRuntime }, runtimeBusy ? '诊断中…' : '运行时诊断'),
              react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: exportCard }, '导出 ST JSON'),
              react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: busy, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: importCard }, '导入 Tavern')
            ),
            field('name', '名称'),
            field('description', '角色描述', true),
            field('personality', '性格', true),
            field('scenario', '场景 / 关系', true),
            field('first_mes', '开场白', true),
            field('mes_example', '对话示例', true),
            field('creator_notes', '作者备注', true),
            field('system_prompt', '系统提示词', true),
            field('post_history_instructions', '历史后指令', true),
            field('tags', '标签（逗号分隔）'),
            field('alternate_greetings', '备选开场白（用 --- 分隔）', true),
            validation ? react.createElement('pre', { style: { marginTop: '10px', padding: '10px', maxHeight: '24vh', overflow: 'auto', borderRadius: '9px', background: 'rgba(0,0,0,.16)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(validation, null, 2)) : null,
            runtime ? react.createElement('pre', { style: { marginTop: '10px', padding: '10px', maxHeight: '24vh', overflow: 'auto', borderRadius: '9px', background: 'rgba(0,0,0,.16)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, '运行时诊断\n' + JSON.stringify(runtime, null, 2)) : null,
            react.createElement('div', { style: { marginTop: '10px', padding: '10px', borderRadius: '9px', background: 'rgba(0,0,0,.10)', border: '1px solid var(--dsw-alias-border-l2)' } },
              react.createElement('div', { style: { fontWeight: 700, marginBottom: '6px' } }, 'Helper Runtime POC'),
              helperRuntime ? react.createElement('div', null,
                react.createElement('div', { style: { fontSize: '11px', opacity: .75, marginBottom: '6px' } }, `runtime ${helperRuntime.id.slice(0, 18)}… · scripts ${(helperRuntime.scripts || []).length}${helperRuntime.sessionId ? ' · session ' + helperRuntime.sessionId : ''}`),
                react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' } },
                  react.createElement('select', { value: helperEventName, onChange: event => setHelperEventName(event.target.value), style: { padding: '4px 7px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit', fontSize: '11px' } },
                    ['MESSAGE_RECEIVED', 'USER_MESSAGE_RENDERED', 'CHARACTER_MESSAGE_RENDERED', 'GENERATION_STARTED', 'GENERATION_ENDED', 'CHAT_CHANGED', 'READY'].map(name => react.createElement('option', { key: name, value: name }, name))
                  ),
                  react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: helperRuntimeBusy, style: { width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px' }, onClick: emitHelperEvent }, '发送事件'),
                  react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: helperRuntimeBusy, style: { width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px' }, onClick: syncHelperRuntime }, '同步到 Tavern'),
                  react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: helperRuntimeBusy, style: { width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px' }, onClick: stopHelperRuntime }, '停止')
                ),
                react.createElement('textarea', { value: helperEventPayload, onChange: event => setHelperEventPayload(event.target.value), style: { boxSizing: 'border-box', width: '100%', minHeight: '54px', padding: '6px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2)', background: 'rgba(0,0,0,.12)', color: 'inherit', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }),
                react.createElement('pre', { style: { marginTop: '8px', padding: '8px', maxHeight: '22vh', overflow: 'auto', borderRadius: '7px', background: 'rgba(0,0,0,.16)', fontSize: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify({ variables: helperRuntime.variables, messages: helperRuntime.messages, injections: helperRuntime.injections, slashCommands: helperRuntime.slashCommands, diagnostics: helperRuntime.diagnostics, eventLog: helperRuntime.eventLog }, null, 2).slice(0, 10000)),
                helperSyncResult ? react.createElement('pre', { style: { marginTop: '8px', padding: '8px', maxHeight: '18vh', overflow: 'auto', borderRadius: '7px', background: 'rgba(0,0,0,.16)', fontSize: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, '同步结果\n' + JSON.stringify(helperSyncResult, null, 2).slice(0, 6000)) : null
              ) : react.createElement('div', null,
                react.createElement('input', {
                  value: helperSessionId,
                  placeholder: '可选 Tavern sessionId，用于载入 chat.messages',
                  onChange: event => setHelperSessionId(event.target.value),
                  style: { boxSizing: 'border-box', width: '100%', marginBottom: '6px', padding: '5px 7px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit', fontSize: '11px' }
                }),
                react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: helperRuntimeBusy, style: { width: 'auto', margin: 0, padding: '5px 10px' }, onClick: startHelperRuntime }, helperRuntimeBusy ? '启动中…' : '为当前卡启动 Helper Runtime')
              )
            ),
            importResult ? react.createElement('pre', { style: { marginTop: '10px', padding: '10px', maxHeight: '24vh', overflow: 'auto', borderRadius: '9px', background: 'rgba(0,0,0,.16)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, 'Tavern 导入结果\n' + JSON.stringify(importResult, null, 2).slice(0, 8000)) : null
          ) : react.createElement('div', { style: { opacity: .55 } }, '选择一张人物卡开始编辑')
        )
      )
    }

    function CreativeWorkspaceView() {
      const [workspaceMode, setWorkspaceMode] = react.useState('resources')
      // P4-7: conditional layout takeover — only take over the conversation
      // layout when at least one Story project exists. The host slot API has
      // no conditional flag, so the gate lives in-component: unknown/no
      // project → render null and the host keeps its default layout.
      const [hasProject, setHasProject] = react.useState(null)
      react.useEffect(() => {
        let stopped = false
        fetch('/plugins/creative-suite/story/projects', { headers: { accept: 'application/json' } })
          .then(response => response.json())
          .then(payload => { if (!stopped) setHasProject(Array.isArray(payload.projects) && payload.projects.length > 0) })
          .catch(() => { if (!stopped) setHasProject(false) })
        return () => { stopped = true }
      }, [])
      const [resourceKind, setResourceKind] = react.useState('cards')
      const [summary, setSummary] = react.useState({})
      const [list, setList] = react.useState([])
      const [selected, setSelected] = react.useState(null)
      const [lineageGraph, setLineageGraph] = react.useState(null)
      const [lineageBusy, setLineageBusy] = react.useState(false)
      const [error, setError] = react.useState('')

      async function loadLineageGraph() {
        if (!selected || !selected.id) return
        setLineageBusy(true)
        try {
          const response = await fetch(`/plugins/creative-suite/lineage/${encodeURIComponent(resourceKind)}/${encodeURIComponent(selected.id)}/graph?mode=full&maxDepth=6`, { headers: { accept: 'application/json' } })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setLineageGraph(payload)
          setError('')
        } catch (err) {
          setError(String(err && err.message || err))
        } finally {
          setLineageBusy(false)
        }
      }

      const [projects, setProjects] = react.useState([])
      const [projectId, setProjectId] = react.useState('')
      const [newProjectName, setNewProjectName] = react.useState('')
      const [projectKind, setProjectKind] = react.useState('novel')
      const [newFilePath, setNewFilePath] = react.useState('')
      const [files, setFiles] = react.useState([])
      const [selectedPath, setSelectedPath] = react.useState('')
      const [fileText, setFileText] = react.useState('')
      const [fileSavedText, setFileSavedText] = react.useState('')
      const [storyBusy, setStoryBusy] = react.useState(false)
      const [storyError, setStoryError] = react.useState('')
      const [storyPipelineBusy, setStoryPipelineBusy] = react.useState(false)
      const [storyPipelineResult, setStoryPipelineResult] = react.useState(null)
      const [storyPipelineError, setStoryPipelineError] = react.useState('')
      const [quickPlayCard, setQuickPlayCard] = react.useState('')
      const [storyGenerateBusy, setStoryGenerateBusy] = react.useState('')
      const [storyGenerateResult, setStoryGenerateResult] = react.useState(null)
      const [storyGenerateError, setStoryGenerateError] = react.useState('')
      const [adventureBusy, setAdventureBusy] = react.useState(false)
      const [adventureResult, setAdventureResult] = react.useState(null)
      const [adventureError, setAdventureError] = react.useState('')
      const [storyRoles, setStoryRoles] = react.useState([])
      const [storyTools, setStoryTools] = react.useState([])
      const [storyRoleBusy, setStoryRoleBusy] = react.useState('')
      const [storyRoleResult, setStoryRoleResult] = react.useState(null)
      const [storyRoleError, setStoryRoleError] = react.useState('')

      react.useEffect(() => {
        if (workspaceMode !== 'resources') return undefined
        let stopped = false
        async function load() {
          try {
            const summaryResponse = await fetch('/plugins/creative-suite/resources', { headers: { accept: 'application/json' } })
            const summaryPayload = await summaryResponse.json()
            const listResponse = await fetch(`/plugins/creative-suite/resources/${resourceKind}`, { headers: { accept: 'application/json' } })
            const listPayload = await listResponse.json()
            if (!stopped) {
              setSummary(summaryPayload.resources || {})
              setList(listPayload.resources || [])
              setSelected(null)
              setLineageGraph(null)
              setError('')
            }
          } catch (err) {
            if (!stopped) setError(String(err && err.message || err))
          }
        }
        load()
        return () => { stopped = true }
      }, [resourceKind, workspaceMode])

      async function loadProjects() {
        try {
          const response = await fetch('/plugins/creative-suite/story/projects', { headers: { accept: 'application/json' } })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setProjects(payload.projects || [])
          if (!projectId && payload.projects && payload.projects.length > 0) setProjectId(payload.projects[0].id)
          setStoryError('')
        } catch (err) {
          setStoryError(String(err && err.message || err))
        }
      }

      async function loadFiles(id) {
        if (!id) { setFiles([]); return }
        try {
          const response = await fetch(`/plugins/creative-suite/story/projects/${encodeURIComponent(id)}/files`, { headers: { accept: 'application/json' } })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setFiles(payload.files || [])
          setStoryError('')
        } catch (err) {
          setStoryError(String(err && err.message || err))
        }
      }

      async function createFile() {
        const relative = String(newFilePath || '').trim()
        if (!projectId) { setStoryError('请先选择项目'); return }
        if (!relative) { setStoryError('请输入新文件路径'); return }
        setStoryBusy(true)
        setStoryError('')
        try {
          const response = await fetch(`/plugins/creative-suite/story/projects/${encodeURIComponent(projectId)}/file`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ path: relative, text: '' })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setNewFilePath('')
          setSelectedPath(relative)
          setFileText('')
          setFileSavedText('')
          await loadFiles(projectId)
        } catch (err) {
          setStoryError(String(err && err.message || err))
        } finally {
          setStoryBusy(false)
        }
      }

      async function openFile(path) {
        if (!projectId) return
        try {
          const response = await fetch(`/plugins/creative-suite/story/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(path)}`, { headers: { accept: 'application/json' } })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setSelectedPath(path)
          setFileText(payload.text || '')
          setFileSavedText(payload.text || '')
          setStoryError('')
        } catch (err) {
          setStoryError(String(err && err.message || err))
        }
      }

      async function saveFile() {
        if (!projectId || !selectedPath) {
          setStoryError('请先选择文件')
          return
        }
        setStoryBusy(true)
        setStoryError('')
        try {
          const response = await fetch(`/plugins/creative-suite/story/projects/${encodeURIComponent(projectId)}/file`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ path: selectedPath, text: fileText })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setFileSavedText(fileText)
          await loadFiles(projectId)
        } catch (err) {
          setStoryError(String(err && err.message || err))
        } finally {
          setStoryBusy(false)
        }
      }

      async function deleteFile() {
        if (!projectId || !selectedPath) {
          setStoryError('请先选择文件')
          return
        }
        if (!window.confirm(`确定删除文件 ${selectedPath} 吗？此操作不可恢复。`)) return
        setStoryBusy(true)
        setStoryError('')
        try {
          const response = await fetch(`/plugins/creative-suite/story/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(selectedPath)}`, {
            method: 'DELETE',
            headers: { accept: 'application/json' }
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setSelectedPath('')
          setFileText('')
          setFileSavedText('')
          await loadFiles(projectId)
        } catch (err) {
          setStoryError(String(err && err.message || err))
        } finally {
          setStoryBusy(false)
        }
      }

      async function createProject() {
        if (!newProjectName.trim()) { setStoryError('请输入项目名称'); return }
        setStoryBusy(true)
        setStoryError('')
        try {
          const response = await fetch('/plugins/creative-suite/story/projects', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ name: newProjectName.trim(), kind: projectKind })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setNewProjectName('')
          await loadProjects()
          setProjectId(payload.project.id)
        } catch (err) {
          setStoryError(String(err && err.message || err))
        } finally {
          setStoryBusy(false)
        }
      }

      async function runStoryPipeline(importToTavern) {
        if (!projectId) { setStoryPipelineError('请先选择 Story 项目'); return }
        const textFiles = files.filter(file => file.type === 'file' && /\.(md|txt|html|json)$/i.test(file.path)).slice(0, 30)
        if (textFiles.length === 0) { setStoryPipelineError('项目里没有可读取的文本文件'); return }
        setStoryPipelineBusy(true)
        setStoryPipelineError('')
        setStoryPipelineResult(null)
        try {
          const parts = []
          for (const file of textFiles) {
            const response = await fetch(`/plugins/creative-suite/story/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(file.path)}`, { headers: { accept: 'application/json' } })
            const payload = await response.json()
            if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
            parts.push(`# ${file.path}\n\n${payload.text || ''}`)
          }
          const text = parts.join('\n\n---\n\n')
          if (text.replace(/\s/g, '').length < 50) throw new Error('项目文本内容太少，无法提取')
          const project = projects.find(item => item.id === projectId)
          const response = await fetch('/plugins/creative-suite/pipeline/novel-to-card', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              name: project ? project.name : projectId,
              storyProjectId: projectId,
              storyProjectName: project ? project.name : projectId,
              text,
              importToTavern: importToTavern === true,
              maxCharacters: 1
            })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setStoryPipelineResult(payload)
        } catch (err) {
          setStoryPipelineError(String(err && err.message || err))
        } finally {
          setStoryPipelineBusy(false)
        }
      }

      async function playGeneratedCard(card) {
        if (!card || !card.id) { setStoryError('人物卡资源缺失'); return }
        setStoryBusy(true)
        setStoryError('')
        try {
          let tavern = card.tavern || null
          if (!tavern || !tavern.path) {
            const response = await fetch(`/plugins/creative-suite/import/tavern/card/${encodeURIComponent(card.id)}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: '{}'
            })
            const payload = await response.json()
            if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
            tavern = payload.tavern || null
            setStoryPipelineResult(previous => previous && Array.isArray(previous.cards)
              ? { ...previous, cards: previous.cards.map(item => item.id === card.id ? { ...item, tavern, tavernError: null } : item) }
              : previous)
          }
          const sourceCard = String(tavern && tavern.path || '').replace(/^cards\//, '')
          if (!sourceCard) throw new Error('人物卡没有可进入 Tavern 的文件路径')
          setQuickPlayCard(sourceCard)
          setWorkspaceMode('tavern')
        } catch (err) {
          setStoryError(String(err && err.message || err))
        } finally {
          setStoryBusy(false)
        }
      }

      async function runStoryGenerate(kind) {
        if (!projectId) { setStoryGenerateError('请先选择 Story 项目'); return }
        setStoryGenerateBusy(kind)
        setStoryGenerateError('')
        setStoryGenerateResult(null)
        try {
          const response = await fetch(`/plugins/creative-suite/story/projects/${encodeURIComponent(projectId)}/generate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ kind })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setStoryGenerateResult(payload)
          await loadFiles(projectId)
          if (payload.path) {
            setSelectedPath(payload.path)
            setFileText(payload.text || '')
          }
        } catch (err) {
          setStoryGenerateError(String(err && err.message || err))
        } finally {
          setStoryGenerateBusy('')
        }
      }

      async function runDramaToAdventure() {
        if (!projectId || !selectedPath || !fileText.trim()) {
          setAdventureError('请先选择包含短剧文本的文件')
          return
        }
        setAdventureBusy(true)
        setAdventureError('')
        try {
          const response = await fetch('/plugins/creative-suite/drama/to-adventure', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ projectId, path: selectedPath, text: fileText })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setAdventureResult(payload)
        } catch (err) {
          setAdventureError(String(err && err.message || err))
        } finally {
          setAdventureBusy(false)
        }
      }

      async function runStoryBatch() {
        if (!projectId) { setStoryGenerateError('请先选择 Story 项目'); return }
        setStoryGenerateBusy('batch')
        setStoryGenerateError('')
        setStoryGenerateResult(null)
        try {
          const response = await fetch(`/plugins/creative-suite/story/projects/${encodeURIComponent(projectId)}/generate-batch`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ kinds: ['outline', 'chapter'], maxTokens: 1800, attempts: 3 })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setStoryGenerateResult({ kind: 'batch', batch: payload.results || [] })
          await loadFiles(projectId)
        } catch (err) {
          setStoryGenerateError(String(err && err.message || err))
        } finally {
          setStoryGenerateBusy('')
        }
      }

      react.useEffect(() => {
        let stopped = false
        Promise.all([
          fetch('/plugins/creative-suite/story/roles', { headers: { accept: 'application/json' } }).then(response => response.json()),
          fetch('/plugins/creative-suite/story/tools', { headers: { accept: 'application/json' } }).then(response => response.json())
        ]).then(([rolePayload, toolPayload]) => {
          if (stopped) return
          if (rolePayload && rolePayload.ok) setStoryRoles(rolePayload.roles || [])
          if (toolPayload && toolPayload.ok) setStoryTools(toolPayload.tools || [])
        }).catch(() => {})
        return () => { stopped = true }
      }, [])

      async function runStoryRole(roleId) {
        if (!projectId) { setStoryRoleError('请先选择 Story 项目'); return }
        setStoryRoleBusy(roleId)
        setStoryRoleError('')
        setStoryRoleResult(null)
        try {
          const response = await fetch(`/plugins/creative-suite/story/roles/${encodeURIComponent(roleId)}/run`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ projectId, maxTokens: 1500, attempts: 2 })
          })
          const payload = await response.json()
          if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`)
          setStoryRoleResult(payload)
        } catch (err) {
          setStoryRoleError(String(err && err.message || err))
        } finally {
          setStoryRoleBusy('')
        }
      }

      react.useEffect(() => {
        if (workspaceMode !== 'story') return undefined
        loadProjects()
        return undefined
      }, [workspaceMode])

      react.useEffect(() => {
        if (workspaceMode !== 'story') return undefined
        loadFiles(projectId)
        return undefined
      }, [projectId, workspaceMode])

      // P0-6: 与 sidebar MODES 同源（见文件顶部 MODE_TAXONOMY），取 scopes 含 workspace 的子集。
      const workspaceModes = MODE_TAXONOMY
        .filter(item => item.scopes.includes('workspace'))
        .sort((a, b) => (a.workspaceOrder || 0) - (b.workspaceOrder || 0))
        .map(item => ({ id: item.id, label: item.workspaceLabel || item.label }))
      const modeNav = react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } },
        workspaceModes.map(item => react.createElement('button', {
          key: item.id,
          type: 'button',
          className: 'dsh-tavern-entry-btn',
          style: { width: 'auto', margin: 0, padding: '6px 12px', opacity: workspaceMode === item.id ? 1 : .6 },
          onClick: () => setWorkspaceMode(item.id)
        }, item.label))
      )

      const resourcePane = react.createElement(react.Fragment, null,
        react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } },
          RESOURCE_KINDS.map(item => react.createElement('button', {
            key: item.id,
            type: 'button',
            className: 'dsh-tavern-entry-btn',
            style: { width: 'auto', margin: 0, padding: '6px 10px', opacity: resourceKind === item.id ? 1 : .62 },
            onClick: () => setResourceKind(item.id)
          }, `${item.label}${summary[item.id] && summary[item.id].count !== undefined ? ' ' + summary[item.id].count : ''}`))
        ),
        error ? react.createElement('div', { style: { color: '#ef8f8f', marginBottom: '10px' } }, error) : null,
        react.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: '14px', alignItems: 'start' } },
          react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
            list.length === 0
              ? react.createElement('div', { style: { opacity: .55 } }, '暂无资源')
              : list.map(item => react.createElement('button', {
                  key: item.id,
                  type: 'button',
                  className: 'dsh-tavern-entry-btn',
                  style: { width: '100%', margin: 0, textAlign: 'left', padding: '7px 9px', opacity: selected && selected.id === item.id ? 1 : .82 },
                  onClick: () => setSelected(item)
                }, item.name || item.id))
          ),
          react.createElement('div', null,
            selected ? react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', style: { width: 'auto', margin: '0 0 8px', padding: '6px 10px' }, disabled: lineageBusy, onClick: loadLineageGraph }, lineageBusy ? '加载血缘图…' : '查看完整血缘图') : null,
            react.createElement('pre', {
              style: { margin: 0, padding: '12px', minHeight: '240px', maxHeight: '65vh', overflow: 'auto', borderRadius: '10px', background: 'rgba(0,0,0,.18)', border: '1px solid var(--dsw-alias-border-l2)', fontSize: '11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
            }, selected ? JSON.stringify({ resource: selected, lineageGraph }, null, 2).slice(0, 30000) : '选择左侧资源查看详情')
          )
        )
      )

      const storyPane = react.createElement(react.Fragment, null,
        storyError ? react.createElement('div', { style: { color: '#ef8f8f', marginBottom: '10px' } }, storyError) : null,
        react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } },
          react.createElement('input', {
            value: newProjectName,
            placeholder: '新项目名称',
            onChange: event => setNewProjectName(event.target.value),
            style: { boxSizing: 'border-box', minWidth: '180px', padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit' }
          }),
          react.createElement('select', {
            value: projectKind,
            onChange: event => setProjectKind(event.target.value),
            style: { padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit' }
          },
            react.createElement('option', { value: 'novel' }, '小说'),
            react.createElement('option', { value: 'drama' }, '短剧'),
            react.createElement('option', { value: 'game' }, '互动游戏'),
            react.createElement('option', { value: 'video' }, '视频解说')
          ),
          react.createElement('button', {
            type: 'button', className: 'dsh-tavern-entry-btn', disabled: storyBusy,
            style: { width: 'auto', margin: 0, padding: '6px 10px' },
            onClick: createProject
          }, storyBusy ? '处理中…' : '创建项目')
        ),
        react.createElement('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' } },
          react.createElement('select', {
            value: projectId,
            onChange: event => setProjectId(event.target.value),
            style: { padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit' }
          }, projects.map(project => react.createElement('option', { key: project.id, value: project.id }, `${project.name} · ${project.kind}`))),
          react.createElement('button', {
            type: 'button', className: 'dsh-tavern-entry-btn', disabled: storyBusy,
            style: { width: 'auto', margin: 0, padding: '6px 10px' },
            onClick: () => loadFiles(projectId)
          }, '刷新文件')
        ),
        react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } },
          react.createElement('input', {
            value: newFilePath,
            placeholder: '新文件路径，如 chapters/第02章.md',
            onChange: event => setNewFilePath(event.target.value),
            style: { boxSizing: 'border-box', minWidth: '240px', padding: '6px 8px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit' }
          }),
          react.createElement('button', {
            type: 'button', className: 'dsh-tavern-entry-btn', disabled: storyBusy || !projectId,
            style: { width: 'auto', margin: 0, padding: '6px 10px' },
            onClick: createFile
          }, '新建文件')
        ),
        react.createElement('div', { style: { marginBottom: '12px', padding: '10px', borderRadius: '9px', background: 'rgba(0,0,0,.10)', border: '1px solid var(--dsw-alias-border-l2)' } },
          react.createElement('div', { style: { fontWeight: 700, marginBottom: '6px' } }, 'Story 工作台 POC'),
          react.createElement('div', { style: { opacity: .6, fontSize: '11px', marginBottom: '8px' } }, '当前支持大纲、续写章节、短剧、游戏设计、视频解说脚本。'),
          react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: !!storyGenerateBusy || !projectId, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: runStoryBatch }, storyGenerateBusy === 'batch' ? '生成中…' : '生成完整包（大纲+章节）'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: !!storyGenerateBusy || !projectId, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: () => runStoryGenerate('outline') }, storyGenerateBusy === 'outline' ? '生成中…' : '生成大纲'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: !!storyGenerateBusy || !projectId, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: () => runStoryGenerate('chapter') }, storyGenerateBusy === 'chapter' ? '生成中…' : '续写下一章'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: !!storyGenerateBusy || !projectId, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: () => runStoryGenerate('drama') }, storyGenerateBusy === 'drama' ? '生成中…' : '生成下一集'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: !!storyGenerateBusy || !projectId, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: () => runStoryGenerate('game') }, storyGenerateBusy === 'game' ? '生成中…' : '生成游戏设计'),
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: !!storyGenerateBusy || !projectId, style: { width: 'auto', margin: 0, padding: '6px 10px' }, onClick: () => runStoryGenerate('video') }, storyGenerateBusy === 'video' ? '生成中…' : '生成视频脚本')
          ),
          storyGenerateError ? react.createElement('div', { style: { color: '#ef8f8f', marginTop: '6px', fontSize: '11px' } }, storyGenerateError) : null,
          storyGenerateResult ? react.createElement('div', { style: { marginTop: '6px', fontSize: '11px', opacity: .75 } }, storyGenerateResult.kind === 'batch'
            ? `已生成完整包：${(storyGenerateResult.batch || []).map(item => item.kind + '→' + item.path).join('，')}`
            : `已生成：${storyGenerateResult.kind} → ${storyGenerateResult.path}`) : null,
          react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', disabled: adventureBusy || !projectId || !selectedPath || !fileText.trim(), style: { width: 'auto', margin: '8px 0 0', padding: '6px 10px' }, onClick: runDramaToAdventure }, adventureBusy ? '接入冒险中…' : '剧本接入 MuseAI 冒险'),
          adventureError ? react.createElement('div', { style: { color: '#ef8f8f', marginTop: '6px', fontSize: '11px' } }, adventureError) : null,
          adventureResult ? react.createElement('div', { style: { marginTop: '6px', fontSize: '11px' } },
            '剧本已生成，可进入MuseAI冒险模式 · 会话已创建',
            react.createElement('button', { type: 'button', className: 'dsh-tavern-entry-btn', style: { width: 'auto', margin: '6px 0 0 8px', padding: '5px 9px' }, onClick: () => setWorkspaceMode('museai') }, '进入冒险模式')
          ) : null
        ),
        react.createElement('div', { style: { marginBottom: '12px', padding: '10px', borderRadius: '9px', background: 'rgba(0,0,0,.10)', border: '1px solid var(--dsw-alias-border-l2)' } },
          react.createElement('div', { style: { fontWeight: 700, marginBottom: '6px' } }, 'Story Skill / Role / Tool POC'),
          react.createElement('div', { style: { fontSize: '11px', opacity: .7, marginBottom: '6px' } }, `DSH Skills 已注册 · 角色 ${storyRoles.length} · 工具 ${storyTools.length}`),
          react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            storyRoles.map(role => react.createElement('button', {
              key: role.id,
              type: 'button',
              className: 'dsh-tavern-entry-btn',
              disabled: !!storyRoleBusy || !projectId,
              style: { width: 'auto', margin: 0, padding: '5px 9px', fontSize: '11px' },
              onClick: () => runStoryRole(role.id)
            }, storyRoleBusy === role.id ? '运行中…' : role.name))
          ),
          storyTools.length > 0 ? react.createElement('div', { style: { marginTop: '6px', fontSize: '10px', opacity: .55 } }, `Tools: ${storyTools.map(tool => tool.name).join(' · ')}`) : null,
          storyRoleError ? react.createElement('div', { style: { color: '#ef8f8f', marginTop: '6px', fontSize: '11px' } }, storyRoleError) : null,
          storyRoleResult ? react.createElement('pre', { style: { marginTop: '8px', padding: '8px', maxHeight: '20vh', overflow: 'auto', borderRadius: '8px', background: 'rgba(0,0,0,.22)', fontSize: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, (storyRoleResult.text || '').slice(0, 6000)) : null
        ),
        react.createElement('div', { style: { marginBottom: '12px', padding: '10px', borderRadius: '9px', background: 'rgba(0,0,0,.10)', border: '1px solid var(--dsw-alias-border-l2)' } },
          react.createElement('div', { style: { fontWeight: 700, marginBottom: '6px' } }, 'Story → 人物卡 → Tavern'),
          react.createElement('div', { style: { opacity: .6, fontSize: '11px', marginBottom: '8px' } }, '把当前项目中的 Markdown / 文本文件合并后送入小说→卡片流水线。'),
          react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            react.createElement('button', {
              type: 'button', className: 'dsh-tavern-entry-btn', disabled: storyPipelineBusy || !projectId,
              style: { width: 'auto', margin: 0, padding: '6px 10px' },
              onClick: () => runStoryPipeline(false)
            }, storyPipelineBusy ? '生成中…' : '生成人物卡'),
            react.createElement('button', {
              type: 'button', className: 'dsh-tavern-entry-btn', disabled: storyPipelineBusy || !projectId,
              style: { width: 'auto', margin: 0, padding: '6px 10px' },
              onClick: () => runStoryPipeline(true)
            }, storyPipelineBusy ? '生成中…' : '生成并导入 Tavern')
          ),
          storyPipelineError ? react.createElement('div', { style: { color: '#ef8f8f', marginTop: '6px', fontSize: '11px' } }, storyPipelineError) : null,
          storyPipelineResult ? react.createElement(react.Fragment, null,
            react.createElement('pre', { style: { margin: '8px 0 0', padding: '8px', maxHeight: '180px', overflow: 'auto', borderRadius: '8px', background: 'rgba(0,0,0,.22)', fontSize: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify({
              story: storyPipelineResult.story,
              novel: storyPipelineResult.novel && { id: storyPipelineResult.novel.id, name: storyPipelineResult.novel.name },
              worldbook: storyPipelineResult.worldbook && { id: storyPipelineResult.worldbook.id, name: storyPipelineResult.worldbook.name, entryCount: storyPipelineResult.worldbook.entryCount },
              cards: storyPipelineResult.cards && storyPipelineResult.cards.map(card => ({ id: card.id, name: card.name, valid: card.valid, tavern: card.tavern && card.tavern.path || null, tavernError: card.tavernError || null }))
            }, null, 2)),
            Array.isArray(storyPipelineResult.cards) && storyPipelineResult.cards.length > 0 ? react.createElement('div', { style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' } },
              react.createElement('div', { style: { fontWeight: 700, fontSize: '11px' } }, '生成的卡可直接进入原生游玩'),
              storyPipelineResult.cards.map(card => react.createElement('div', { key: card.id, style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
                react.createElement('span', { style: { fontSize: '11px', flex: '1 1 180px' } }, `${card.name}${card.valid ? '' : ' · 校验未通过'}`),
                react.createElement('button', {
                  type: 'button',
                  className: 'dsh-tavern-entry-btn',
                  disabled: storyBusy || card.valid === false,
                  style: { width: 'auto', margin: 0, padding: '4px 8px', fontSize: '11px' },
                  onClick: () => playGeneratedCard(card)
                }, card.tavern && card.tavern.path ? '原生游玩' : '导入并原生游玩')
              ))
            ) : null
          ) : null
        ),
        projects.length === 0 ? react.createElement('div', { style: { opacity: .6 } }, '还没有项目，先创建一个。') : null,
        projectId ? react.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) 1fr', gap: '12px', alignItems: 'start' } },
          react.createElement('div', { style: { maxHeight: '65vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' } },
            react.createElement('div', { style: { fontWeight: 700, fontSize: '11px', opacity: .7, marginBottom: '2px' } }, `文件 ${files.filter(file => file.type === 'file').length}`),
            files.length === 0 ? react.createElement('div', { style: { opacity: .55, fontSize: '12px' } }, '项目为空，先新建文件。') :
              files.map(file => file.type === 'dir'
                ? react.createElement('div', {
                    key: 'dir:' + file.path,
                    style: { fontSize: '12px', opacity: .55, padding: '4px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                  }, `📁 ${file.path}`)
                : react.createElement('button', {
                  key: file.path,
                  type: 'button',
                  className: 'dsh-tavern-entry-btn',
                  style: { width: '100%', margin: 0, textAlign: 'left', padding: '6px 8px', opacity: selectedPath === file.path ? 1 : .78 },
                  onClick: () => openFile(file.path)
                }, file.path))
          ),
          react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            react.createElement('div', { style: { opacity: .65, fontSize: '12px' } }, selectedPath ? `${selectedPath}${fileText !== fileSavedText ? ' · 未保存*' : ''}` : '选择一个文件'),
            react.createElement('textarea', {
              value: fileText,
              onChange: event => setFileText(event.target.value),
              disabled: !selectedPath,
              style: { boxSizing: 'border-box', width: '100%', minHeight: '320px', padding: '10px', borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l2)', background: 'rgba(0,0,0,.18)', color: 'inherit', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' }
            }),
            react.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              react.createElement('button', {
                type: 'button', className: 'dsh-tavern-entry-btn', disabled: storyBusy || !selectedPath,
                style: { width: 'auto', margin: 0, padding: '6px 10px' },
                onClick: saveFile
              }, storyBusy ? '保存中…' : '保存'),
              react.createElement('button', {
                type: 'button', className: 'dsh-tavern-entry-btn', disabled: storyBusy || !selectedPath,
                style: { width: 'auto', margin: 0, padding: '6px 10px' },
                onClick: deleteFile
              }, '删除文件')
            )
          )
        ) : null
      )

      return react.createElement('div', {
        style: { boxSizing: 'border-box', width: '100%', height: '100%', overflow: 'auto', padding: '18px 20px', color: 'var(--dsw-alias-label-primary)' }
      },
        // P4-7 takeover gate: no projects yet → yield layout back to host.
        react.createElement('h2', { style: { margin: '0 0 4px' } }, '创作工作台'),
        react.createElement('div', { style: { opacity: .65, marginBottom: '14px', fontSize: '12px' } }, 'DSH Creative Suite · 原生工作台'),
        hasProject === true ? null
          : react.createElement('div', { style: { opacity: .6, fontSize: '13px', marginBottom: '12px' } },
              hasProject === null ? '正在检查 Story 项目…' : '还没有 Story 项目 — 新建一个项目以接管此布局。'),
        hasProject === true ? modeNav : null,
        hasProject === true ? (
        workspaceMode === 'resources' ? resourcePane
          : workspaceMode === 'cards' ? react.createElement(CardWorkbenchPane)
          : workspaceMode === 'regex' ? react.createElement(RegexLabPane)
          : workspaceMode === 'story' ? storyPane
          : workspaceMode === 'museai' ? react.createElement(MuseAIPane)
          : react.createElement(TavernModePane, {
              presetSourceCard: quickPlayCard,
              onPresetConsumed: () => setQuickPlayCard('')
            })
        ) : null
      )
    }

    // P1: ErrorBoundary——渲染期错误降级，不让整面板白屏。
    // 注意：createElement 工厂内无 JSX，用“函数组件 + 手动 catch”无法捕获渲染错误；
    // 此处采用轻量守卫：包装两个注入组件，渲染异常时显示降级提示并上报 console。
    function withErrorGuard(Component, label) {
      return function GuardedComponent(props) {
        try {
          return react.createElement(Component, props)
        } catch (err) {
          try { console.error(`[creative-suite] ${label} render failed:`, err) } catch (_e) {}
          return react.createElement('div', {
            style: { padding: '12px', color: '#ef8f8f', fontSize: '12px' }
          }, `${label} 加载失败，请刷新重试。`)
        }
      }
    }

    function apply(ctx) {
      const GuardedPoc = withErrorGuard(CreativeSuitePoc, '创作套件')
      const GuardedWorkspace = withErrorGuard(CreativeWorkspaceView, '创作工作台')
      ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'dsh-creative-suite-poc',
        priority: 998
      }, GuardedPoc)), 'creative-suite: sidebar POC entry')
      ctx.effect(() => ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'creative-suite',
        order: 15,
        label: () => '创作'
      }, GuardedWorkspace)), 'creative-suite: conversation view')
    }

    return { inject, apply }
  }
})
