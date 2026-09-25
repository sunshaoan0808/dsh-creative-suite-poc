# 原生 Tavern 运行时计划（彻底去掉第二服务）

> 修订目标：不再启动第二个 DSH / Tavern 服务，复杂 SillyTavern 人物卡也必须在当前 DSH 内直接运行。
> 当前 bridge 方案只作为迁移兼容层，不作为最终形态。
>
> 源码对照基线（2026-09-25 已扒取验证）：
>
> ```text
> A. flizzywine/dsh-tavern @ /tmp/src-dsh-tavern（main f821c100，plugin 2.1.0）
>    tavern-plugin/lib/index.js 5053 行，中央 dispatchMethod + POST /api/dsh-tavern/<method>
>    gameplay-api.js 119 行：capabilities → { version:1, transport:'production-session',
>      browserScriptRuntime:false }（与 docs/TAVERN-BROWSER-RUNTIME-ASSESSMENT.md 一致，
>      系上游真实返回值）
> B. yejiming/dsh-museai-tavern @ /tmp/src-museai-tavern（HEAD a7a077a）
>    0.0.1，tsdown 构建；conversation.view 注册 order 15（Trajectory 10 右、gomoku 20 左）
>    与 POC 非同源（POC client.js 手写 createElement 189KB vs 上游 8.5MB antd/zustand bundle，
>    零共享代码；POC MuseAIPane 仅 ~340 行占位）
> C. zenstory-ai/oh-story-dsh @ /root/oh-story-dsh（@oh-story/dsh 0.1.0，dsh rc.8）
>    client 仅 inject [slots]，走 conversation.session.header.actions split-bridge（src/client/index.tsx:516），
>    不替换 conversation.view；无 game/video（仅 story+drama）；无 ctx.llm/ctx.database/migrator，
>    模型走 subagents.spawn 继承，存储走会话 workspace 文件
> ```
>
> 关键正名：POC 调的 `/api/dsh-tavern/*` 前缀正确，上游确有其路由；
> POC 调的所有方法（gameplay.state/cancel/capabilities/cards/create/requests/send/candidates、
> getSessionPatchStatus/confirmSessionPatch、importCard、Helper CRUD、regen/rollback/retry）上游全部存在，
> 无 404。真正缺的是 live 服务本身（本机无 tavern profile、无 tavern.log），不是接口定义。

## 1. 总目标

在 DSH Creative Suite 内部实现一套完整 Tavern 运行时，覆盖：

- 简单文本卡
- 世界书 / 预设 / 正则
- Tavern Helper 脚本
- MVU 变量与状态栏
- HTML / DOM / 浏览器脚本卡
- 候选、回退、重生成、编辑
- 小手机、状态面板、场景插画
- 群聊 / 多角色 / 剧本模式
- 旧 Tavern 数据迁移
- 完全使用 DSH `ctx.llm`、`storageDomain`、`session`、`approval`

最终形态：

```text
一个 DSH
  -> 一个 Tavern native runtime
  -> 不再启动第二 DSH / Tavern 服务
```

## 2. 当前差距

当前实现：

```text
native-runtime-poc:
  helper-runtime
  MVU variable bridge
  regex preview
  simple-card gameplay API bridge
```

缺口：

```text
1. 正文生成 loop 仍走 Tavern gameplay API
2. 卡 WORLDINFO / 宏 / depth 注入不完整
3. Helper 事件循环不完整
4. MVU settlement / schema / UI 不完整
5. 浏览器脚本 / DOM / HTML 卡没有 runtime
6. 候选 / 回退 / session surface 仍依赖 Tavern
7. 会话存储和 Tavern 文件格式耦合
8. 小手机 / 场景插画 / 群聊未原生
```

## 3. 目标架构

```text
DSH Creative Suite
  ├─ Resource Layer
  │    cards / worldbooks / presets / regex / scripts / assets
  │
  ├─ Card Parser
  │    ST V2/V3 JSON / PNG / DSH workspace
  │
  ├─ Prompt Composer
  │    card fields / macros / worldbook / injection / depth / order
  │
  ├─ Session Engine
  │    messages / branches / swipes / surfaces / rollback
  │
  ├─ Model Adapter
  │    DSH ctx.llm stream / tools / reasoning
  │
  ├─ Regex + Display Engine
  │    placement / markdownOnly / promptOnly / runOnEdit
  │
  ├─ Helper Runtime
  │    event bus / variables / messages / prompts / tools / worldbook
  │
  ├─ MVU Runtime
  │    stat_data / schema / settlement / retry / status panel
  │
  ├─ Browser Runtime
  │    isolated DOM / Web APIs / card HTML+JS
  │
  ├─ Media Runtime
  │    scene image / TTS / music hooks
  │
  └─ Native Tavern UI
       chat / candidates / status / small phone / cards / diagnostics
```

## 4. 模块合同

### 4.1 Resource Layer

必须提供：

```text
listCards()
readCard(cardId)
writeCard(cardId, patch)
importCard(json|png)
listWorldbooks()
readWorldbook(id)
listPresets()
listRegexScripts(source)
listHelperScripts(cardId)
```

资源存储：

```text
DSH storageDomain: creative-suite
不用 Tavern 文件目录作为运行时真源
```

### 4.2 Card Parser

输入：

```text
ST JSON V2
ST JSON V3
PNG chara / ccv3
DSH character workspace
```

输出统一：

```text
CardModel {
  id, name, description, personality, scenario,
  firstMes, alternateGreetings, mesExample,
  systemPrompt, postHistoryInstructions,
  tags, characterBook, extensions,
  regexScripts, helperScripts, mvuConfig, raw
}
```

### 4.3 Prompt Composer

必须支持：

```text
{{user}} / {{char}} / {{persona}} / {{description}}
{{scenario}} / {{personality}} / {{mes_example}}
{{time}} / {{date}} / {{random}}
worldbook activation by keys
constant entries
position: before / after / in_chat / depth
insertion_order
depth / role / should_scan
group / probability / useProbability
```

输出：

```text
PromptPlan {
  system: string,
  messages: ChatMessage[],
  diagnostics: PromptDiagnostic[]
}
```

### 4.4 Session Engine

必须实现：

```text
createSession(cardId)
appendUserMessage
appendAssistantMessage
swipe
regenerate
rollback
undoRollback
editMessage
deleteMessage
branch
persist to DSH storageDomain
```

不能依赖 Tavern 的 `sessions.json` / `chats/` 作为唯一真源。

复用来源（三方对照）：

```text
A. dsh-tavern（会话语义参考，不照搬存储）：
   domain/chat-persistence.js createChatPersistence：chats/<chatId>.json，乐观 3-way merge
   chat-journal-store 617 行 / round-history 651 行 / story-timeline 672 行： journal/回合/时间线
   rollback-surface.js 546 行：回退面；candidate-generation/selection/tasks：候选任务；
   turn-orchestration.js 756 行：回合编排；surface-restoration / session-events
   注意：gameplay.* 只支持 test-<uuid> 自动化会话（gameplay-api.js:12,41），非生产聊天，
   N0 必须新建生产级 native session engine，不可复用 gameplay 网关
B. dsh-museai-tavern（存储与会话模式直接复用，src/domain.ts + src/routes.ts）：
   museaiStore facade：MemoryMuseaiStore 即时可用 → ctx.get('storageDomain') 后升级
     DomainMuseaiStore（memory-flush + close effect；lean-profile 回退 memory + warn）
   SessionRecord：sessionKey('<kind>:<id>')，zod 校验，含 thinking/thinkingBlocks/tools/todos
   路由：GET/PUT /store/<key>（envelope round-trip，空→{state:{},version:0}）、
     GET /sessions/<kind>（摘要+messageCount）、GET/PUT/DELETE /sessions/<kind>/<id>
   syncStorage.ts createSyncStorage：server envelope 优先 + localStorage 镜像双写迁移
C. oh-story-dsh（存储纪律参考，不照搬 API）：
   会话 workspace 文件即真源；sha256 版本 + 412 冲突 + 原子 tmp+rename + maxBytes；
   路由只做窄前缀文件服务（/oh-story/file），绝不在路由里起 agents/runs/streams/models
```

POC 现状差距：POC 存储是 `$DSH_HOME/storages/creative-suite.json` 直接写（P0-5 Partial，
无 blessing、无版本/冲突机制）。N0 按 B 建 StoreFacade + envelope，按 C 加版本/冲突/原子写纪律。

### 4.5 Model Adapter

统一走：

```text
ctx.llm.stream
ctx.llm.listProviders
ctx.llm.listModels
```

禁止：

```text
第二个 API Key
第二个 baseURL 配置
绕过 DSH approval
```

复用来源（B. dsh-museai-tavern `src/routes.ts`，已验证可直接移植模式）：

```text
resolveModelTarget()：followDefault → ctx.agentDefaultModel.currentSelection()，否则显式 provider/model
resolveReasoningEffort()：ctx.llm.resolveModelInfo + ReasoningEffortId（不支持则丢弃，gomoku 式）
buildGenerateOptions()：{ provider, model, messages, system, temperature, maxTokens, reasoningEffort, signal }
toLlmMessages()：createUserMessage / createAssistantMessage
POST /plugins/museai/chat：ctx.llm.stream + BlockAssembler，NDJSON 事件
  start/delta/thinking_delta/done{text,reasoning}/error/aborted，单请求超时 + 客户端断开 abort
POST /plugins/museai/complete：assemble(stream) → { text, reasoning }（标题/归档/蒸馏用）
GET /plugins/museai/models：listProviders/listModels 目录 { groups, failures } + defaultSelection
 credential-free：只传 provider/model id 或 followDefault
```

POC 现状差距：POC 的 `generateText()`（lib/index.js）只有裸 `ctx.llm.stream` 调用，
缺 reasoningEffort 映射、BlockAssembler NDJSON、models 目录、超时/abort 全套。N0 按上游补齐。

### 4.6 Regex + Display Engine

必须支持：

```text
findRegex
replaceString
placement
markdownOnly
promptOnly
runOnEdit
substituteRegex
depth / order
```

区分：

```text
prompt projection
display projection
edit projection
```

复用来源（A. dsh-tavern，已验证文件清单）：

```text
tavern-regex-display.js：regex 脚本解析 + display 流水线
tavern-macro-engine.js：{{user}}/{{char}}/{{persona}}/{{description}}/{{scenario}}/
  {{personality}}/{{mes_example}}/{{time}}/{{date}}/{{random}} 等宏展开
worldbook-*.js：activation / recall / library / filter / placement / search / snapshot /
  version / bm25 / merge（activation 含 keys/constant/position/depth/role/should_scan/
  group/probability/useProbability 全套语义）
presetLibrary.updatePresetRegex：预设级 regex 更新
```

POC 现状差距：POC 只有 regex preview（P5-4），缺完整 ST regex 语义、worldbook activation、
macro 全套、depth/order、三投影区分。N3 按上游移植。

### 4.7 Helper Runtime

当前已有基础（POC lib/helper-runtime.js 333 行），需要补全：

```text
event loop
lifecycle: READY / CHAT_CHANGED / GENERATION_* / MESSAGE_*
variables: get/replace/update
messages: get/set/create/delete
prompts: inject/get/clear
tools: register/call/unregister
worldbook
extension settings
macros
toast/notify
sandbox isolation
```

复用来源（A. dsh-tavern `tavern-script-host-adapter.js` + `helper-generation/`，已验证可迁移核心逻辑）：

```text
tavern-script-host-adapter.js 762 行：Helper CRUD 完整实现
  create/updateMessages, updatePrompts, updateVariables, saveChatData/ExtensionSettings/WorldInfo
helper-generation/：tavern-helper-context（上下文传播）/ tavern-helper-scripts（脚本编译执行）
  / tavern-helper-variable-macros（变量宏存储替换）/ tavern-helper-worldbook（世界书绑定查询）
事件总线 on/emit/off + lifecycle 状态机；工具 register/call/unregister + 元数据；
worldbook 只读视图；extension settings 持久化；toast/notify 队列；sandbox isolation
```

POC 现状差距：POC helper-runtime.js 只有基础函数（clone/getPath/setPath/resolveValue/renderText/
templateBrowserStatus/renderCardTemplate/withMvuRetry/createSandbox/createHelperRuntime 等），
缺事件循环、完整 lifecycle、variables/messages/prompts/tools 全量、worldbook 绑定、
extension settings、toast/notify、健全 sandbox。N1 按上游补齐。

安全目标：

```text
优先 worker_threads / isolated-vm
最低要求：vm + timeout + quota + audit
```

### 4.8 MVU Runtime

必须支持：

```text
stat_data
schema
变量初始化
前台变量更新
后台 settlement
pending submission
retry
openingVariables
status panel projection
污染防护
```

目标：

```text
即使没有 Tavern 服务，MVU 卡也能正常更新状态。
```

复用来源（A. dsh-tavern `mvu-*` + `official-mvu-assets.js`，已验证文件清单）：

```text
mvu-conversion*.js：conversion / definition / guidance / inspection / tools / validation /
  appearance / artifacts（卡 MVU 配置解析与转换）
mvu-background-settlement.js 637 行：后台 settlement 主流程
mvu-settlement-effect / mvu-settlement-reconciler：settlement 生效与对账
mvu-schema.generated.js：schema 定义
official-mvu-assets.js：官方 MVU 资源
```

POC 现状差距：POC 只有 withMvuRetry/isTransientMvuError（重试壳），缺 stat_data 读写、
schema、settlement pipeline、status panel projection 全套。N2 按上游移植。

### 4.9 Browser Runtime

这是复杂卡必须的一块。

支持方式优先级：

```text
A. 内嵌 headless browser / Playwright（DSH 内部拉起，不是第二个 DSH）
B. 受限 DOM runtime + Web API shim
C. 对纯 HTML 状态栏提供安全 renderer
```

要覆盖：

```text
card HTML
card JS
DOM
document / window
jQuery-like 调用
iframe / srcdoc / postMessage
status panel refresh
small phone
custom event hooks
```

### 4.10 Native Tavern UI

需要实现：

```text
chat view
candidate view
status panel
small phone
card workbench
diagnostics
session operations
model selector
worldbook selector
preset selector
```

全部在 DSH `conversation.view` / slots 内，不 iframe 第二 DSH。

复用来源（B + C 对照，2026-09-25 验证）：

```text
B. dsh-museai-tavern（视图注册模式直接复用）：
   src/client/index.ts：inject=['slots','locale'] → locale NS 注册（zh/en）→
     ctx.slots.inject('conversation.view', () => ctx.slots.register(
       { name:'conversation.view', id:'museai', order:15,
         label:() => t('tab.label'), locale:NS }, MuseAIView))
   order 15 语义：Trajectory(10) 右、gomoku(20) 左；MuseAIView 用 antd Tabs 一次渲染一页，
     后台状态放服务端，unmount/切页无损；.museai-view-active + [data-composer-seat] 藏原生 composer
   POC 现状：POC client.js 用同 order 15 注册 id 'creative-suite'（概念继承），
     但 MuseAIPane 仅 ~340 行占位表单，未移植上游 7k 行 pages+stores（Background 2034/Chat 1510/
     Adventure 1914/Bond 856/Settings 737 行 + 6 zustand stores + 12 utils + 8 components）。
     N0-N5 按需移植，不抄 8.5MB bundle
C. oh-story-dsh（非破坏式挂载纪律参考）：
   只 inject conversation.session.header.actions（order -100）+ tool.call.toolview，
   用 CreativeSplitBridge portal 进官方 view 旁边，绝不替换 conversation.view；
   无项目文件时只显示空引导（/story-setup、/short-drama），Chat/composer/store 照常归官方所有
   POC 注意：POC 当前是替换式 conversation.view（与 oh-story 的 augment 式不同），
     两者可共存（header.actions order -100 与 view order 15 不冲突），N6 前保持现状
```

## 5. 分阶段计划

### Phase N0：抽掉 gameplay API 依赖

目标：

```text
简单卡不依赖 Tavern 服务
```

任务：

- native session engine 最小版（按 §4.4：B 的 StoreFacade + SessionRecord + envelope，
  C 的版本/冲突/原子写纪律；A 的 journal/回合语义参考）
- DSH ctx.llm 正文生成（按 §4.5：B 的 resolveModelTarget/buildGenerateOptions/
  reasoningEffort/models 目录/超时 abort 全套，不止裸 stream）
- 卡字段 -> prompt（POC 已有 converters.js，按 B 的 toLlmMessages 对齐）
- 世界书基础注入（按 A 的 worldbook-activation keys/constant 起步）
- helper runtime 挂到 native turn（POC 已有 runtime/start + from-tavern/sync 去外部化）
- native UI 显示正文（order 15 注册不变，按 B 的服务端持状态/unmount 无损）

验收：

```text
无 3088 / 无第二 DSH，简单卡可对话
```

### Phase N1：完整 Helper Runtime

任务：

- event lifecycle 补全
- host API 补全
- sandbox 强化
- runtime <-> native session 双向同步
- helper script 调试器

验收：

```text
带 Helper 脚本的卡在 native runtime 可运行
```

### Phase N2：MVU Runtime

任务：

- stat_data 读写
- schema / 规则
- settlement pipeline
- retry / watchdog
- status panel projection
- 污染与版本控制

验收：

```text
MVU 卡可开局、更新变量、显示状态栏
```

### Phase N3：Regex / Worldbook / Macro 完整化

任务：

- 完整 ST regex
- worldbook activation
- macro substitution
- prompt depth/order
- edit/display/prompt 三投影

验收：

```text
含 regex + worldbook + macros 的卡可正常游玩
```

### Phase N4：Browser Runtime

任务：

- card HTML/JS runtime
- DOM/Web Shim
- iframe / srcdoc / postMessage
- status panel / small phone
- browser card fallback

验收：

```text
requiresBrowser 卡不再需要第二服务
```

### Phase N5：Session Surface / candidates / rollback

任务：

- regen（对标 A. regenBody）
- rollback（对标 A. rollback-surface.js 546 行 + rollbackTurn）
- undo rollback（对标 A. undoRollbackTurn）
- candidate generation（对标 A. candidate-generation/selection/tasks + gameplay candidates submitTask）
- edit message（对标 A. updateTavernHelperMessages 本地化）
- branch（对标 A. chat-journal-store / round-history 分支语义）

验收：

```text
完整 UI 操作链与 Tavern 等价
```

### Phase N6：数据迁移和 no-second-service 发布

任务：

- 迁移 Tavern cards/worldbooks/presets/chats
- 删除 gameplay API proxy 依赖
- 删除 second service smoke
- 更新安装/升级/回滚
- 全量兼容矩阵

验收：

```text
在一次 DSH 安装中，复杂卡可运行；
无需 3088 / 第二 profile / 第二 DSH
```

## 6. 测试策略

### 6.1 卡兼容性语料库

```text
simple-text
worldbook
regex-heavy
helper-script
MVU
HTML status panel
browser-script
group chat
```

### 6.2 差分测试

对同一张卡、同一输入，比较：

```text
official Tavern 输出
native runtime 输出
state / variables / display text
```

### 6.3 回归测试

CI 中必须跑：

```text
npm test
native-runtime smoke
no-second-service test
browser-runtime test
migration test
```

## 7. 风险

```text
1. browser runtime 安全与资源占用
2. MVU 版本差异
3. Helper API 语义漂移
4. regex 完整语义复杂
5. 旧 Tavern 数据迁移冲突
6. 多平台（Android/Desktop/CLI）差异
```

## 8. 最终验收

```text
关闭 Tavern 服务
  删除 3088
  删除第二 profile

在同一 DSH 内：
  导入复杂 ST 卡
  正确解析
  Helper 运行
  MVU 更新
  Regex 生效
  世界书注入
  HTML 状态栏渲染
  候选/回退/重生成可用
  数据持久化
```

只有全部通过，才叫：

```text
彻底去掉第二个服务
```
