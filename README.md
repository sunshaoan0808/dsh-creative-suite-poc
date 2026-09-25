# DSH Creative Suite POC

Phase 0-2 backend MVP for the DSH Creative Suite.

## Goal

One DSH native plugin that can eventually host:

- Coding
- Tavern
- MuseAI
- Story

This POC already proves the content flywheel backend:

```text
Novel
  -> parse chapters / characters
  -> LLM worldbook generation
  -> LLM character generation
  -> SillyTavern card generation
  -> static validation
  -> import into DSH Tavern
  -> resource lineage
```

## Current Features

### DSH-native plugin

- Host half
- Browser half
- `cordis.patch.yml` row
- Separate `creative` profile friendly
- Client status / mode placeholder
- Sidebar resource library UI
- One-click novel-to-card UI

### Shared resource store

File-backed POC store:

```text
$DSH_HOME/storages/creative-suite.json
```

Resource kinds:

```text
cards
worldbooks
presets
styles
novels
scripts
summaries
sessions
stories
```

### Import APIs

```text
POST /plugins/creative-suite/import/card
POST /plugins/creative-suite/import/card-png
POST /plugins/creative-suite/import/worldbook
POST /plugins/creative-suite/import/preset
POST /plugins/creative-suite/import/novel
```

### Generate APIs

```text
POST /plugins/creative-suite/generate/worldbook
POST /plugins/creative-suite/generate/characters
POST /plugins/creative-suite/generate/card
```

### Pipeline API

```text
POST /plugins/creative-suite/pipeline/novel-to-card
POST /plugins/creative-suite/feedback/session
POST /plugins/creative-suite/pipeline/feedback-to-content
```

Supports:

```json
{
  "name": "小说名",
  "text": "小说文本",
  "maxCharacters": 1,
  "generateWorldbook": true,
  "generateCharacters": true,
  "importToTavern": true
}
```

### Native DSH View

The browser half also registers a `conversation.view` tab:

```text
创作
```

It renders four native modes inside the DSH conversation view system, instead of using an iframe:

- `资源库`
- `Story`
- `MuseAI`
- `酒馆桥接`

The MuseAI mode contains five pages:

- `背景`
- `聊天`
- `冒险`
- `羁绊`
- `设置`

It uses the selected shared card / worldbook as context, persists sessions as shared `sessions` resources, and calls the DSH default model through `ctx.llm`. No second API key or model configuration is needed.

MuseAI background page can also bind from a Story project:

```text
GET /plugins/creative-suite/story/projects/:id/resources
  -> stories / novels / worldbooks / cards
  -> auto-select first card and first worldbook in MuseAI
  -> persist `storyProjectId` on the MuseAI session
```

The Tavern bridge mode reads the active Tavern session list and latest snapshot transcript through DSH-side routes, then can generate feedback / continuation outlines with the same shared feedback pipeline.

It also has a compatibility native play mode:

- lists Tavern cards
- creates an independent Tavern gameplay session through the production gameplay API
- sends input and polls state
- uses projected `displayText` first, so regex/display-layer output is preferred over raw model text, with a raw/projection toggle
- shows a simple escaped HTML MVU / status panel built from `chat.variables`, `posture`, `ledger` and `mvu`
- has a variable-write POC for cards that enable Tavern Helper / MVU runtime
- has a session-operation POC for regen / rollback / undo rollback / retry MVU settlement
- waits for background settlement completion after sending, and auto-retries failed MVU settlement once by default
- falls back to `/tavern/launch` (full Tavern workbench) for `requiresBrowser: true` cards

Session operation routes:

```text
POST /plugins/creative-suite/tavern/chat/regen
POST /plugins/creative-suite/tavern/chat/rollback
POST /plugins/creative-suite/tavern/chat/undo-rollback
POST /plugins/creative-suite/tavern/chat/retry-mvu
```

These proxy to Tavern's `regenBody`, `rollbackTurn`, `undoRollbackTurn` and `retryMvuSettlement` RPCs.

The POC also exposes:

```text
POST /plugins/creative-suite/tavern/session-patch/ensure
```

It reads Tavern's session patch status and, when the server half is ready but no Tavern browser client has confirmed, confirms the protocol from the POC. That removes the `页面尚未完成会话补丁握手` blocker for independent POC sessions.

Variable write route:

```text
POST /plugins/creative-suite/tavern/gameplay/variables
```

It proxies to Tavern's `updateTavernHelperVariables` using `option: { type: 'chat' }`. If a card does not enable Tavern Helper / MVU runtime, Tavern fails closed and the UI shows the error.
- supports candidate display / selection, cancel and full cleanup

Important boundary: this mode uses the Tavern pure API session, so it works for cards that do not require browser script runtime. MVU / HTML / card helper-script heavy cards should still use the full Tavern workbench.

Candidate generation is wired through the official gameplay API and now has a POC-level safety wrapper:

- hard timeout (default 60 seconds, configurable)
- automatic `gameplay.cancel` on timeout
- wait for the candidate request to leave running state before returning
- fallback to manual input when submission, completion or timeout fails
- dispose defers `deleteChat` when the candidate task has not stopped yet

It is still marked experimental because model/tool behavior and per-card background tasks vary, but it no longer waits forever or deletes a chat out from under a live candidate task.

The Story mode provides a minimal workspace:

- Create a story project
- Select a project
- Recursively list project files
- Open and edit text files
- Save files back to disk

### Story APIs

```text
GET  /plugins/creative-suite/story/projects
POST /plugins/creative-suite/story/projects
GET  /plugins/creative-suite/story/projects/:id/files
GET  /plugins/creative-suite/story/projects/:id/file?path=...
POST /plugins/creative-suite/story/projects/:id/file
GET  /plugins/creative-suite/story/projects/:id/resources
```

The Story native view now has a generation workbench POC:

```text
生成大纲
续写下一章
生成下一集短剧
生成游戏设计
生成视频解说脚本
```

Backend route:

```text
POST /plugins/creative-suite/story/projects/:id/generate
```

It reads project Markdown / text files, calls the DSH model, writes the result into the project (for example `outline.md`, `chapters/第NN章.md`, `episodes/第NN集.md`, `design/game-design.md`, `script/解说脚本.md`) and returns the generated path and text.

The Story layer now registers real DSH skills:

```text
creative-novel
creative-drama
creative-game
creative-video
```

It also exposes POC roles and tools:

```text
GET  /plugins/creative-suite/story/roles
POST /plugins/creative-suite/story/roles/:id/run
GET  /plugins/creative-suite/story/tools
POST /plugins/creative-suite/story/tools/:name/run
```

Tools include `list_files`, `read_project`, `write_file`, and the five Story generation operations.

Generation now uses `generateTextWithRetry` (default 3 attempts, increasing token budget) and supports a batch route:

```text
POST /plugins/creative-suite/story/projects/:id/generate-batch
```

Default batch kinds are `outline` and `chapter`.

Every generated workbench output is also registered as a shared `scripts` resource with lineage:

```text
stories/<projectId>
  -> scripts/<generated-output>
```

The Story native view can also merge the project's Markdown / text files and feed them into the existing `pipeline/novel-to-card` flow:

```text
Story project files
  -> combined text
  -> novel-to-card pipeline
  -> shared stories / novel / worldbook / cards
  -> optional import into Tavern
  -> direct "native play" handoff
```

Lineage now supports the top-level Story project:

```text
stories/<projectId>
  -> novels
  -> worldbooks
  -> cards
```

Generated cards can be selected in Story and handed to the native Tavern play view with `presetSourceCard`. If a card is not yet in Tavern, the Story view imports it first and then switches to the Tavern mode.

Projects live under:

```text
$DSH_HOME/profile-data/creative-suite/projects/
```

### Client UI

The sidebar POC includes:

- Four-mode placeholder
- Resource tabs: cards / worldbooks / presets / styles / novels / scripts / summaries
- Resource list and detail preview
- One-click novel-to-card pipeline
- Tavern feedback / continuation outline panel

### MuseAI APIs

```text
GET    /plugins/creative-suite/museai/settings
POST   /plugins/creative-suite/museai/model
GET    /plugins/creative-suite/museai/sessions
POST   /plugins/creative-suite/museai/sessions
GET    /plugins/creative-suite/museai/sessions/:id
DELETE /plugins/creative-suite/museai/sessions/:id
POST   /plugins/creative-suite/museai/chat
GET    /plugins/creative-suite/museai/bonds
```

### Tavern bridge APIs

```text
GET  /plugins/creative-suite/tavern/chats
GET  /plugins/creative-suite/tavern/transcript?chatId=...
GET  /plugins/creative-suite/tavern/launch

GET  /plugins/creative-suite/tavern/gameplay/capabilities
GET  /plugins/creative-suite/tavern/gameplay/cards
GET  /plugins/creative-suite/tavern/gameplay/state?sessionId=...
POST /plugins/creative-suite/tavern/gameplay/create
POST /plugins/creative-suite/tavern/gameplay/send
POST /plugins/creative-suite/tavern/gameplay/candidates
POST /plugins/creative-suite/tavern/gameplay/cancel
POST /plugins/creative-suite/tavern/gameplay/dispose
POST /plugins/creative-suite/tavern/chat/delete
```

Gameplay APIs proxy to the production Tavern `gameplay.*` API with local auth and create isolated `test-*` sessions. Simple cards are playable; browser-script-dependent cards fail closed with a clear message.

### Feedback API

```text
POST /plugins/creative-suite/feedback/session
```

Accepts either pasted transcript text or a Tavern `chatId`. When a chatId is used, it reads the latest Tavern chat snapshot (`snapshots/*.json.gz`) and falls back to model-request logs if no snapshot exists. The client can load the current profile's Tavern chat list and select a chat directly. Generates:

- summary
- relationship changes
- character growth
- unresolved hooks
- player preferences
- continuation outline
- new character candidates

If the model call fails, it falls back to a deterministic skeleton and records `generationError` in the stored summary.

### Tavern Helper Runtime POC

The project now ships a minimal Helper runtime:

- extracts enabled `tavern_helper` scripts from a shared card
- executes them in a Node `vm` context
- exposes a subset of Tavern Helper APIs:
  - `getVariables`
  - `replaceVariables`
  - `updateVariablesWith`
  - `eventOn`
  - `eventEmit`
  - `getChatMessages` / `setChatMessages` / `getLastMessage` / `createChatMessages` / `deleteChatMessages`
  - `injectPrompt` / `getPrompts` / `clearPrompts`
  - `registerTool` / `callTool`
  - `getChatId` / `getCardName` / `getCharName` / `getUserName`
  - `getLastUserMessage` / `getLastCharMessage` / `getMessage` / `getMessageById` / `getLastMessageId`
  - `eventOnce` / `eventRemoveListener` / `eventRemoveAllListeners`
  - `substituteMacros` / `substitudeMacros` / `formatAsTavernRegexedString`
  - `getExtensionSettings` / `replaceExtensionSettings` / `updateExtensionSettings`
  - `getWorldbook` / `replaceWorldbook` / `getWorldbookNames`
  - `toast` / `notify`
  - `triggerSlash`
  - `console`
- emits card/session events like `READY`, `MESSAGE_RECEIVED`, `CHARACTER_MESSAGE_RENDERED`, `GENERATION_STARTED`, `GENERATION_ENDED`, `CHAT_CHANGED`

Routes:

```text
GET  /plugins/creative-suite/helper/runtime
POST /plugins/creative-suite/helper/runtime/start
POST /plugins/creative-suite/helper/runtime/event
GET  /plugins/creative-suite/helper/runtime/:id
POST /plugins/creative-suite/helper/runtime/:id/stop
```

The card workbench exposes a `Helper Runtime POC` panel for starting a runtime, emitting test events and inspecting variables / diagnostics.

Native play now creates a helper runtime for the selected Tavern card and drives it around a turn:

```text
GENERATION_STARTED
  -> send
  -> from-tavern (reload authoritative chat)
  -> CHAT_CHANGED
  -> MESSAGE_RECEIVED
  -> GENERATION_ENDED
  -> sync back to Tavern
```

Runtime state can be synchronized back to the bound Tavern session:

```text
POST /plugins/creative-suite/helper/runtime/:id/sync
```

It writes:

- `runtime.variables` -> Tavern chat variables
- `runtime.injections` -> Tavern script prompts
- changed existing messages -> Tavern message patches
- appended runtime messages -> new Tavern Helper messages

### Card Workbench

The native `创作` view now has a `卡片工作台` mode:

- list shared cards
- edit name / description / personality / scenario / first_mes / mes_example / creator_notes / system_prompt / post_history_instructions / tags / alternate_greetings
- save back to the shared card record and re-normalize it
- run static validation
- export ST JSON
- import the edited card into Tavern

Update route:

```text
PUT /plugins/creative-suite/card/:id
```

### Regex Display Runtime POC

The native `创作` view now has a `正则预览` mode:

- load shared presets
- extract `extensions.regex_scripts` / `SPreset.RegexBinding.regexes`
- run enabled scripts in order against test text
- show applied / skipped scripts

Backend routes:

```text
GET  /plugins/creative-suite/regex/scripts/:presetId
POST /plugins/creative-suite/regex/apply
```

The Tavern native play view also has a display mode selector:

```text
投影文本
原文
POC 正则
```

`POC 正则` applies the selected shared preset's regex scripts to the raw message text on the client. This is a POC, not full SillyTavern regex semantics.

### Resource APIs

```text
GET    /plugins/creative-suite/status
GET    /plugins/creative-suite/models
GET    /plugins/creative-suite/resources
GET    /plugins/creative-suite/resources/:kind
GET    /plugins/creative-suite/resources/:kind/:id
POST   /plugins/creative-suite/resources/:kind
DELETE /plugins/creative-suite/resources/:kind/:id
GET    /plugins/creative-suite/lineage/:kind/:id
```

### Migration APIs

```text
POST /plugins/creative-suite/migrate/tavern-cards
```

Imports all JSON/PNG cards from the active DSH Tavern card directory into the shared resource library without modifying the source cards.

### Card APIs

```text
GET  /plugins/creative-suite/validate/card/:id
GET  /plugins/creative-suite/export/card/:id
POST /plugins/creative-suite/import/tavern/card/:id
```

## Development

Install into a separate profile:

```sh
dsh --profile creative --from-default-profile web --dump-config
dsh plugin --profile creative add /root/dsh-creative-suite-poc
dsh --profile creative --port 3090 --no-open
```

### Installer / Smoke CLI

```sh
node ./bin/dsh-creative-suite.mjs status --profile creative
node ./bin/dsh-creative-suite.mjs install --profile creative
node ./bin/dsh-creative-suite.mjs smoke --profile creative
node ./bin/dsh-creative-suite.mjs matrix --out docs/HOST-VERSION-MATRIX.md
```

The smoke command starts a temporary DSH Web on a random port, waits for the authenticated URL, calls `/plugins/creative-suite/status`, prints the result and terminates the temporary process. See `docs/INSTALL.md`.

### Fusion Plan

The CLI can prepare and apply main-profile fusion:

```sh
node ./bin/dsh-creative-suite.mjs fusion --profile web          # dry run
node ./bin/dsh-creative-suite.mjs fusion --profile web --apply  # backup + install + status
```

Dry run is the default. `--apply` backs up the target profile package file under `$DSH_HOME/backups/` before installing.

When the target profile's existing `node_modules` comes from a different pnpm store, use link mode:

```sh
node ./bin/dsh-creative-suite.mjs fusion --profile web --apply --link
```

Link mode edits `package.json`, adds the bundle and creates a `node_modules/dsh-creative-suite-poc` symlink without invoking pnpm.

The apply path has been validated against a temporary copy of the real web profile stack, without touching the live `web` profile. See `docs/FUSION-TEST.md`.

Do not install this POC into the main `web` profile until the mode integration is ready.

## Verified

- Plugin host row loads
- Browser client bundle is served
- Model catalog uses DSH configured models
- File store survives restart
- ST JSON card import
- ST PNG card import
- ST worldbook import
- ST preset import
- Card / worldbook binding
- Novel chapter parsing
- Novel dialogue character extraction
- LLM worldbook generation
- LLM character generation
- ST card generation
- Static card validation
- One-click import into DSH Tavern
- Resource lineage graph
- End-to-end pipeline:

```text
Novel -> Worldbook -> Character -> Card -> Tavern
```

## Not Done Yet

The remaining closure items are:

- Host-published version matrix (P0-1)
- Formal GitHub Release / tag / release notes (P7-1)
- Full upgrade + rollback regression (P7-2)
- Guided migration wizard UI (P7-3)
- Formal external security audit (P7-4)
- Reproducible real-browser E2E evidence in the target host environment (P7-6)
- Decide whether `private: true` stays before publication

CI, tests, docs, migration backend, helper runtime, Story/MuseAI/Tavern POCs and the main web fusion are now in place.

## Safety / Status

- Model calls go through DSH `ctx.llm`.
- No second API key configuration.
- Media generation confirmation gate is part of the roadmap, not this POC.
- Test data is cleaned after each test.
