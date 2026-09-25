# HOST-INTEGRATION.md — host 需提供的 slot / services / 路由契约清单 (P0-3)

> **STATUS (2026-09-25):** 本文保留 host 集成协商历史；P0-3 / P0-5 / P0-6 / P0-7 现已 Done。
> 当前状态以 `docs/GAP.md` 和 `docs/VERSION-MATRIX.md` 为准，host 侧真正剩余的是 P0-1 正式版本矩阵发布。
>
> 范围：只列 host ↔ POC 的集成契约。POC 侧业务代码逻辑不改；
> 未落定的 host 能力标为 HOST-TODO，由 host 确认后再推进。

POC 实际挂载代码：`lib/client.js` 末尾 `apply(ctx)`；包元数据：`package.json` (`dsh.*`)；
host 行声明 stub：`cordis.patch.yml`。

## 1. Slot 契约

| slot | 用途 | 注册参数 (POC 侧现状) | host 需提供 | 状态 |
|---|---|---|---|---|
| `conversation.view` | 主工作台：四模式（资源/卡片/正则/故事/MuseAI/Tavern）+ 无项目时让出布局 (P4-7 接管门) | `{ name, id: 'creative-suite', order: 15, label: () => '创作' }`，经 `ctx.slots.inject(name, () => ctx.slots.register(spec, View))` 注册，外包 `ctx.effect(..., 'creative-suite: conversation view')` | `ctx.slots.inject` / `ctx.slots.register` / `ctx.effect` 语义与现有一致 | ✅ 已验证可用 |
| `sidebar.footer.action` | 侧边栏底部轻量入口 | `{ name, id: 'dsh-creative-suite-poc', priority: 998 }`，effect 名 `'creative-suite: sidebar POC entry'` | 同上；**HOST-TODO-3**：若 host 无此 slot，允许忽略（`optional: true`），只保留主 view | ⚠️ 待 host 确认存在性 |
| 顶层 app view slot | P0-3 目标：脱离 `conversation.view` 的顶层入口 | id 保持 `creative-suite`、label 保持 `创作`；order 在新 slot 下的语义待定 | **HOST-TODO-1 / 2**：slot 名称、注册签名、排序语义全部待 host 定义，POC 侧先行准备、不硬编码 | ❌ 待 host 定义 |

约定：
- id 全局唯一，host 不得改写（`creative-suite` / `dsh-creative-suite-poc`）。
- `order: 15` / `priority: 998` 的“小靠前”语义请 host 确认；确认前 host 按现状字面值挂载即可。
- 卸载语义跟随 `ctx.effect`（effect 释放即摘除注册项），POC 不自管订阅生命周期。

## 2. `ctx.inject` / services 契约

- POC 唯一依赖：**`ctx.slots`**（`lib/client.js`: `const inject = ['slots']`）。
- ✅ 已修正：`package.json` 中 `dsh.client.inject` 现为 `["slots"]`，与 `lib/client.js` 一致。
- POC 不依赖 `ctx.llm` 以外的模型服务（生成走 DSH 默认模型，GAP P0-4 Done）、不依赖数据库/队列等其他服务。

## 3. 路由 / webServer 契约

- POC **已有服务端路由**：`lib/index.js` 通过 `webServer.register` 注册
  `/plugins/creative-suite/*`（资源、Story、MuseAI、Tavern、Helper Runtime、诊断等）。
- host 需保证 `webServer.register` 的 prefix 语义与现有 host 一致。
- `bin/dsh-creative-suite.mjs` 只做 profile 检查 / smoke / migration / fusion，不起独立端口。

## 4. 环境契约：`DSH_HOME`

- 解析规则（`bin/dsh-creative-suite.mjs`）：`$DSH_HOME`，未设置则 fallback 到 `~/.dsh`。
- profile 路径：`$DSH_HOME/profiles/<profile>`（如 `web`、`fusion-test`，见 `docs/FUSION-TEST.md`）。
- **HOST-TODO-6**：host 只需确认“POC 可按上述规则读写 `$DSH_HOME` 下属于自己的 profile 目录”，
  不需要为 POC 单独分配环境变量。

## 5. 存储契约：`storageDomain` blessing

- 现状（GAP P0-5 Partial）：POC 直写 `$DSH_HOME/storages/creative-suite.json`（STORE_VERSION = 1），
  **不是**正式 storageDomain。
- **HOST-TODO-7**：host 授予 storageDomain blessing（含 domain 名、配额、迁移窗口）之前，
  POC 保持文件存储原样，不迁移、不改读写逻辑。blessing 落定后另起任务做迁移。

## 6. Host 联调检查清单

1. `dsh plugin add` 可安装（含 `cordis.patch.yml` 行声明解析不报错）。
2. `conversation.view` 出现 `创作` 入口（order 15 附近），四模式可切换。
3. 有 `sidebar.footer.action` 的 host 能看到 POC 入口；没有该 slot 的 host 忽略附属行且主 view 正常。
4. 无 Story 项目时主 view 显示引导文案并让出布局（P4-7 门）。
5. `node ./bin/dsh-creative-suite.mjs smoke --profile creative` 通过（见 README）。
6. 未授予 storageDomain 前，POC 读写限定在 `$DSH_HOME/storages/creative-suite.json`，不碰 host 其他存储。

## 7. HOST-TODO 汇总

| 编号 | 事项 | 位置 |
|---|---|---|
| HOST-TODO-1 | 顶层 app view slot 是否存在、叫什么 | cordis.patch.yml / §1 |
| HOST-TODO-2 | 新 slot 下 order 语义 + 追加第二行声明 | cordis.patch.yml / §1 |
| HOST-TODO-3 | `sidebar.footer.action` 存在性；无则忽略 | cordis.patch.yml / §1 |
| HOST-TODO-4 | 未来服务端路由 prefix 规则 | §3 |
| HOST-TODO-5 | inject 以 client.js 为准；package.json 后续补 `["slots"]` | §2 |
| HOST-TODO-6 | 确认 POC 的 DSH_HOME/profile 读写范围 | §4 |
| HOST-TODO-7 | storageDomain blessing（domain 名/配额/迁移窗口） | §5 |
