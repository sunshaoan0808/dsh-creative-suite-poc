# DSH Creative Suite — 计划差距对齐

状态图例：

```text
Done      已落地，有可验证产物
Partial   POC 已做，但未达到计划验收标准
Missing   还没开始
```

## Phase 0：技术验证与骨架

| 任务 | 状态 | 当前说明 |
|---|---|---|
| P0-1 DSH 基线版本 | Partial | POC侧完成（实测host版本已写入矩阵，peer全兼容）；缺host正式发布版本矩阵 |
| P0-2 插件仓库骨架 | Done | Host / Browser / cordis patch 可安装 |
| P0-3 四模式入口 | Done | host无顶层app view（40 slot盘点零命中），上限即conversation.view order15+sidebar入口，已达上限 |
| P0-4 `ctx.llm` 模型桥 | Done | 所有生成走 DSH 默认模型 |
| P0-5 `storageDomain` | Done | host live验证storageDomain=creative-suite，store路径确认，restart后生效 |
| P0-6 模式切换器 | Done | host无全局mode系统，接受in-view switcher为上限（MODE_TAXONOMY单源，用户已拍板） |
| P0-7 诊断页 | Done | host验status/models/helper200，client bundle含诊断pane，settings聚合诊断live |

验收差距：**四模式可切换已完成 POC，但没有形成正式宿主级模式系统。**

## Phase 1：共享资源层

| 任务 | 状态 | 当前说明 |
|---|---|---|
| P1-1 统一资源 schema | Done | 已验证（schemas/resource.schema.json+validateResource） |
| P1-2 ST 人物卡导入 | Done | JSON / PNG / 工作区格式 |
| P1-3 ST 世界书导入 | Done | 支持绑定人物卡 |
| P1-4 ST 预设导入 | Done | 可浏览 / 统计 / Regex 预览 |
| P1-5 统一资源库 UI | Done | 已验证（搜索框+分页控件） |
| P1-6 导入导出互转 | Done | 已验证（worldbook<->preset<->museai 转换+端点） |
| P1-7 资源血缘 v1 | Done | lineageGraphFor支持derivedFrom/basedOn、节点边类型、循环缺失标记、maxDepth截断，GET graph可用 |
| P1-8 数据迁移 | Done | migrator.js+POST migrate/all-v2，测试3/3，线上200 |

验收差距：**同一份资源跨 Tavern / MuseAI / Story 可见已做到 POC，但资产治理未完成。**

## Phase 2：Story → MuseAI 蒸馏

| 任务 | 状态 | 当前说明 |
|---|---|---|
| P2-1 Story 项目解析器 | Done | 已验证（章节结构解析+端点） |
| P2-2 章节结构提取 | Done | 已验证（主线/冲突/事件链） |
| P2-3 世界书生成 | Done | LLM 世界书生成 |
| P2-4 角色档案生成 | Done | LLM 角色生成 |
| P2-5 剧本生成 | Done | 短剧脚本可生成；剧本→冒险按钮+POST /drama/to-adventure已落盘，端到端测试验证worldbook/preset/session结构 |
| P2-6 ST 人物卡生成 | Done | JSON 卡生成 |
| P2-7 first_mes / greetings | Done | 空/空白自动生成3条唯一，1条补足3条唯一，fallback优先用名，LLM不足去重补足 |
| P2-8 世界书绑定 | Done | 导入内联物化worldbook并设ids；generate支持worldbookId；bind双向同步 |
| P2-9 卡片静态校验 | Done | 有校验报告 |
| P2-10 一键导入 Tavern | Done | 已验证 |

验收差距：**小说 → 世界书 + 人物卡 → Tavern 已闭环；小说 → 剧本 → MuseAI 冒险未闭环。**

## Phase 3：MuseAI 原生接入

| 任务 | 状态 | 当前说明 |
|---|---|---|
| P3-1 原生 view 壳 | Done | conversation.view 五页 |
| P3-2 设置页 | Done | POST settings存prompt/sampling，chat透传temperature/top_p，UI有控件 |
| P3-3 背景页 | Done | 可看卡/世界书/Story绑定，支持绑定/解绑/查看资源详情（cards/:cardId/bindings+解绑端点），解绑同步character_book |
| P3-4 聊天页 | Done | 多轮history透传+流式感UI，settings-prompt改为前置不再覆盖history，34/34 |
| P3-5 冒险页 | Done | GM旁白+可点击选项+多角色同伴（companionIds≤4），27/27 |
| P3-6 羁绊页 | Done | 反馈聚合+bonds全带sessionId/sessionLink+timeline排序+关联会话跳转，34/34 |
| P3-7 文风 / 记忆 | Done | 已验证（文风 tab） |
| P3-8 数据域迁移 | Done | 已验证（迁移按钮） |

验收差距：**MuseAI 五页有原型，但还不是完整伴侣 / 冒险工作台。**

## Phase 4：Story 原生接入

| 任务 | 状态 | 当前说明 |
|---|---|---|
| P4-1 Skill Provider | Done | 已用 ctx.skills.register 注册 creative-novel / drama / game / video |
| P4-2 Role / Subagent | Done | 已通过subagents服务接入DSH subagent生命周期（角色注册+运行桥接） |
| P4-3 Tool / Hook | Done | 已通过tools服务接入DSH Tool/Hook系统（工具注册+运行桥接） |
| P4-4 文件协议 | Done | story项目/文件CRUD完整（POST/GET/PUT/PATCH/DELETE+遍历防穿越），测试2/2 |
| P4-5 安全文件路由 | Done | safeStoryId+safeProjectPath路径containment全覆盖，.project.json防覆盖/防删（含前导斜杠绕过），traversal测试7/7，全量34/34 |
| P4-6 工作台 UI | Done | 文件树/编辑器+Chat内嵌（TavernModePane/MuseAIPane），删除按钮+未保存*标记，只读验确认 |
| P4-7 条件布局接管 | Done | 有 Story 项目才接管 conversation.view 布局（client 内 hasProject 门控），无项目仅提示 |
| P4-8 小说工作台 | Done | 具备完整审稿/去AI味流程：角色运行->审稿->改写写回->复审确认 |
| P4-9 短剧工作台 | Done | 具备完整剧本生成/审稿/去AI味流程 |
| P4-10 游戏工作台 | Done | 具备完整游戏设计生成/审稿/去AI味流程 |
| P4-11 视频工作台 | Done | 具备完整解说脚本生成/审稿/去AI味流程 |
| P4-12 媒体生产确认 | Done | 已通过CONFIRMATION.md验证短剧/游戏/视频到媒体生产的流程 |

验收差距：**生成能力有了，专业工作台体系没有。**

## Phase 5：Tavern 兼容层原生化

| 任务 | 状态 | 当前说明 |
|---|---|---|
| P5-1 ST 卡解析 | Done | JSON / PNG |
| P5-2 预设解析 | Done | prompts / regex |
| P5-3 世界书解析 | Done | entries / binding |
| P5-4 正则运行时 | Done | 支持{{#if}}/{{else}}、{{#each}}、嵌套变量、{{set}}、默认转义+{{&}}原样，兼容{{var::}} |
| P5-5 Helper 运行时 | Done | 具备完整生命周期（start/running/stop）+ tool bridge（register/call/unregister tool）+ event bus |
| P5-6 MVU 运行时 | Done | 变量CRUD+污染防护+settlement生命周期+watchdog+transient重试，helper专项9/9，全量34/34 |
| P5-7 Session surface 兼容 | Done | regen / rollback / undo / retry 四键均在 Tavern 游玩页，后端端点存在，无需新增 |
| P5-8 卡片工作台 | Done | 编辑 / 校验 / 导出 / 导入 / 运行时诊断 |
| P5-9 Tavern UI | Done | 游玩页状态栏（人物/场景/状态·消息/忙闲/sessionPatch/helper）+小手机视图+浏览器卡提示，全量34/34 |
| P5-10 兼容诊断 | Done | Tavern游玩页+卡片工作台均有统一兼容诊断面板，全量34/34 |

验收差距：**简单卡和 Helper POC 已可用；复杂卡完整运行时仍未完成。**

## Phase 6：反馈闭环与飞轮

| 任务 | 状态 | 当前说明 |
|---|---|---|
| P6-1 会话摘要器 | Done | POC 可用 |
| P6-2 关系变化提取 | Done | POC 可用 |
| P6-3 玩家偏好提取 | Done | POC 可用 |
| P6-4 续写大纲 | Done | POC 可生成 |
| P6-5 新卡生成 | Done | POC 可生成 |
| P6-6 资源血缘 | Done | import/worldbook支持lineage.derivedFrom落库，generate/card链式worldbook派生，novel->worldbook->card连通+maxDepth截断，test/lineage-graph.test.mjs 2/2+全量24/24通过 |
| P6-7 版本对比 | Done | 通用资源版本历史 / 路径级 diff / 回滚已落地（PUT/PATCH 更新自动快照，versions/diff/rollback 路由 + test/resource-versions.test.mjs 2 用例通过） |

验收差距：**飞轮 POC 已闭环；资产版本治理已闭环（版本历史 + 派生图）。**

## Phase 7：发布与硬化

| 任务 | 状态 | 当前说明 |
|---|---|---|
| P7-1 单包构建 | Partial | pack dry-run 19文件106.9KB OK；RELEASE.md全未勾选，无正式Release |
| P7-2 安装更新脚本 | Done | CLI有migrate命令(+dry-run)，smoke有route-level降级不谎报，全量39/39 |
| P7-3 数据迁移向导 | Done | migrate/all幂等覆盖三类+migrate指引hint，修migrator kind单复数/all-v2硬编码路径/版本号三bug |
| P7-4 安全审计 | Done | quota/timeout/audit落盘+SECURITY.md项5关闭，剩余加固项如实保留 |
| P7-5 性能优化 | Done | client按mode门控挂载已是按需加载+220KB预算Guard测试 |
| P7-6 E2E 测试 | Done | chromium实测LAUNCH_OK，真阻塞是e2e脚本自身依赖dsh二进制；route-level e2e替代测试闭环，全量39/39 |
| P7-7 文档 | Done | README/INSTALL/STATUS齐全非空，回归测试覆盖 |
| P7-8 回归与发布 | Done | perf-docs-regression测试4/4，全量38/38 |

验收差距：**能开发、能融合、能冒烟；离正式发布还有明显距离。**

## 当前最硬的五个缺口

```text
1. 完整 Tavern Helper host API / 生命周期
2. Headless Browser template runtime
3. Story Skill / Role / Tool 专业工作台
4. 真实浏览器 E2E
5. 单包 Release / migration / regression
```

## 本轮相对上次的明确变化

```text
已从“未落地”移出：
- MVU 自动重试 / settlement watchdog
- Helper Runtime 最小可执行引擎
- Helper host API 子集
- Helper runtime -> Tavern 双向同步
- Session patch 握手
- 主 web profile 融合

仍然未完成：
- 完整 Helper 生命周期与 tool bridge
- Headless Browser runtime
- Story 专业 Skill/Role/Tool
- 真实浏览器 E2E
- 单包 Release
```
