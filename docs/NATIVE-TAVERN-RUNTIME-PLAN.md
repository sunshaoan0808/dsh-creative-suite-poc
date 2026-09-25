# 原生 Tavern 运行时计划（彻底去掉第二服务）

> 修订目标：不再启动第二个 DSH / Tavern 服务，复杂 SillyTavern 人物卡也必须在当前 DSH 内直接运行。
> 当前 bridge 方案只作为迁移兼容层，不作为最终形态。

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

### 4.7 Helper Runtime

当前已有基础，需要补全：

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

## 5. 分阶段计划

### Phase N0：抽掉 gameplay API 依赖

目标：

```text
简单卡不依赖 Tavern 服务
```

任务：

- native session engine 最小版
- DSH ctx.llm 正文生成
- 卡字段 -> prompt
- 世界书基础注入
- helper runtime 挂到 native turn
- native UI 显示正文

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

- regen
- rollback
- undo rollback
- candidate generation
- edit message
- branch

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
