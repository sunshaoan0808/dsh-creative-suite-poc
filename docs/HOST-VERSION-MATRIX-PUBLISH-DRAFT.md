# DSH Host 正式版本矩阵（发布稿草案，P0-1 关闭用）

Status: **DRAFT，归属 host**。POC 侧实测已全部完成，只缺 host 确认发布并填 2 个 TBD（capabilities version / browserScriptRuntime live 值），填完 P0-1 即可从 Partial → Done。
日期：2026-09-25。POC 版本：`dsh-creative-suite-poc@0.17.0`。POC 测试：39/39 绿（已推送）。

## 1. 正式矩阵（host 发布即生效）

| 组件 | Host 实测值（2026-09-25，/root/dsh-deploy） | POC 声明 / 支持范围 | 结论 |
|---|---|---|---|
| `@deepseek-ai/dsh`（host） | **0.1.0-rc.8** | — | 基线锁定，不盲目追新 |
| web-app bundle | **0.1.0-rc.8** | — | 与 host 同版本 |
| `@deepseek-ai/cordis`（host runtime 实际加载） | **4.0.1** | POC peer `^4.0.1`（POC dev 装机 4.0.4，同 major） | ✅ 全兼容 |
| `react`（host runtime 实际加载） | **18.3.1** | POC peer `^18.2.0`（POC dev 装机 18.3.1，一致） | ✅ 全兼容 |
| `dsh-creative-suite-poc` | **0.17.0** | `GET /plugins/creative-suite/status` 返回 `version: '0.17.0'`（handler 硬编码，须与 host 安装 bundle 版本交叉核对，不盲信） | POC 侧完成，待 host 交叉核对机制 |
| `STORE_VERSION`（文件 store 格式版） | — | POC `lib/index.js:16` `const STORE_VERSION = 1`；`normalizeStore()` 非 1 即回退空 store | POC 侧 pin |
| `storageDomain` | — | POC `lib/index.js:24` `STORAGE_DOMAIN = 'creative-suite'`；文件 `<dshHome>/storages/creative-suite.json`（原子写 tmp+rename，ENOENT→空 store）＋ story 工程 `<dshHome>/profile-data/creative-suite/projects` | POC 侧声明；待 host 确认为 canonical（quota/归属/跨插件隔离/碰撞检查待发） |
| Tavern gameplay capabilities `version`（API v） | **TBD（host live 填）** | POC 仅做代理：`GET /plugins/creative-suite/tavern/gameplay/capabilities → tavernGameplayRequest(dshHome,'capabilities')`（`lib/index.js:3479-3480`）；client 显示 `API v{capabilities.version}`（`lib/client.js:1646`） | host 填 live 值 |
| `browserScriptRuntime` | **TBD（host live 填）** | POC 仅透传；client 按 `=== true` 判完整/兼容模式（`lib/client.js:1759-1760`） | host 填 live 值 |
| modes | — | `['coding','tavern','museai','story']` 数据回显；in-repo 无全局 mode 系统（P0-6 上限即 in-view switcher，已拍板） | 上限确认 |
| views | — | host 无顶层 app view 概念（40 slot 盘点零命中；P0-3 上限即 conversation.view order15 + sidebar 入口） | 上限确认 |
| 诊断 | — | host 已验 status/models/helper 200，client bundle 含诊断 pane，settings 聚合诊断 live（P0-7 Done） | Done |

## 2. 验证证据（可复核）

- host dsh：`/root/dsh-deploy/package.json` deps `@deepseek-ai/dsh = 0.1.0-rc.8`；`/root/dsh-deploy/node_modules/@deepseek-ai/dsh/package.json` version 0.1.0-rc.8。
- host cordis：`/root/dsh-deploy/node_modules/.pnpm/@deepseek-ai+cordis*@…/node_modules/@deepseek-ai/cordis/package.json` version **4.0.1**（多路径一致）。
- host react：`/root/dsh-deploy/node_modules/.pnpm/react@18.3.1/node_modules/react/package.json` version **18.3.1**。
- POC 声明：`package.json:2-3` version 0.17.0；`peerDependencies` cordis `^4.0.1` / react `^18.2.0`。
- POC dev 装机：`node_modules/@deepseek-ai/cordis` 4.0.4；`node_modules/react` 18.3.1。
- POC store：`lib/index.js:16` STORE_VERSION、`lib/index.js:24` STORAGE_DOMAIN、`lib/index.js:169,179` stamp/normalize。
- POC 能力代理：`lib/index.js:3479-3480`；client 面板：`lib/client.js:1646,1755-1760`。
- 详情见 `docs/VERSION-MATRIX.md`（POC-local，grep-verified）。

## 3. Host 发布前拍板清单（共 5 项，其中 2 个填值）

1. 确认发布本矩阵（host version / cordis 范围 / react 范围 / API v / browserScriptRuntime）。
2. 填 capabilities live `version`＋`browserScriptRuntime`（`GET /plugins/creative-suite/tavern/gameplay/capabilities` 实测值）。
3. 定 `GET /status` 硬编码 `version: '0.17.0'` 与 host 安装 bundle 版本的交叉核对机制。
4. 定 storageDomain：`creative-suite` 是否为 canonical；`<dshHome>/storages/creative-suite.json` 碰撞检查；quota/归属/跨插件隔离策略；`profile-data/tavern/…` POC 只读，写回/迁移需 host 批准。
5. 定统一诊断 UI 放置。

## 4. P0-1 关闭条件

host 发布本文（填完 2 个 TBD）→ P0-1 Partial → Done。其余 P0（P0-3/P0-5/P0-6/P0-7）已 Done；POC 侧 peer 全兼容（cordis 4.0.1 / react 18.3.1）已入 `docs/VERSION-MATRIX.md`。
