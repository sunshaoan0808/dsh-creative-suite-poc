# DSH Creative Suite Status

## Implemented

| Area | Status |
|---|---|
| DSH native plugin skeleton | Done |
| Installer / status / smoke CLI | Done |
| Host/version matrix generator CLI | Done |
| Automated profile smoke test | Done |
| Host row | Done |
| Browser half | Done |
| Sidebar POC entry | Done |
| Four-mode placeholder | Done |
| Resource library UI | Done |
| DSH model catalog bridge | Done |
| File-backed shared resource store | Done |
| ST JSON card import | Done |
| ST PNG card import | Done |
| ST worldbook import | Done |
| ST preset import | Done |
| Card-worldbook binding | Done |
| Novel chapter parsing | Done |
| Novel character extraction | Done |
| LLM worldbook generation | Done |
| LLM character generation | Done |
| ST card generation | Done |
| Native card workbench: edit / save / validate / export / import | Done |
| Regex preview lab from shared presets | Done |
| Native play display mode: projection / raw / POC regex | Done |
| Card static validation | Done |
| Import card into Tavern | Done |
| Resource lineage v1 | Done |
| End-to-end novel-to-Tavern pipeline | Done |
| Tavern session feedback route | Done |
| Continuation outline generation | Done |
| Feedback fallback for model timeout | Done |
| Client feedback panel | Done |
| Tavern chat list endpoint / selector | Done |
| Tavern snapshot transcript reader | Done |
| Feedback-to-outline/card pipeline | Done |
| Client feedback-to-content button | Done |
| Tavern card migration into shared library | Done |
| Native `conversation.view` tab | Done |
| Native resource library view | Done |
| Native Story mode | Done |
| Story project/file APIs | Done |
| Story templates: novel / drama / game / video | Done |
| Story project -> novel-to-card pipeline | Done |
| Story workbench generation: outline / chapter / drama / game / video | Done |
| Story workbench outputs registered as shared scripts + lineage | Done |
| Story generation retry / empty-output guard | Done |
| Story batch generation route / UI | Done |
| DSH runtime skills: creative-novel / drama / game / video | Done |
| Helper runtime quotas / timeouts / audit log | Done |
| Story POC roles: novelist / dramatist / game designer / video director / lore keeper | Done |
| Story POC tools: list/read/write/generate | Done |
| Story Skill / Role / Tool UI panel | Done |
| Card runtime diagnostics: helper / regex / MVU counts | Done |
| Story project resource lineage (`stories` -> novels -> worldbooks -> cards) | Done |
| Story project -> direct native-play handoff | Done |
| Native MVU/status simple escaped HTML panel | Done |
| Raw text / projected display toggle | Done |
| Full Tavern launch fallback for `requiresBrowser` cards | Done |
| Browser runtime compatibility assessment | Done |
| Native MuseAI pages: background / chat / adventure / bond / settings | Done |
| MuseAI Story-project resource binding | Done |
| MuseAI session CRUD | Done |
| MuseAI card + worldbook context builder | Done |
| MuseAI chat / adventure through DSH `ctx.llm` | Done |
| MuseAI bonds aggregation from feedback | Done |
| MuseAI model switch via DSH default model service | Done |
| Native Tavern bridge view | Done |
| Tavern snapshot transcript API | Done |
| Tavern gameplay API proxy | Done |
| Native Tavern compatibility play view | Done |
| Native play uses projected display text first (regex/display layer friendly) | Done |
| Native play simple posture / variables / MVU snapshot display | Done |
| Native MVU/chat variable write POC via `updateTavernHelperVariables` | Done |
| Minimal Tavern Helper runtime: vm scripts + event bus + variables | Done |
| Helper host API subset: chat messages / prompts / triggerSlash | Done |
| Helper runtime -> Tavern bidirectional sync | Done |
| Helper runtime lifecycle hooks around native turns | Done |
| Helper runtime tool bridge (registerTool / callTool) | Done |
| Helper metadata / messages / eventOnce / macros / extension / worldbook APIs | Done |
| Lifecycle events: streaming / rendered / updated compatibility names | Done |
| Migration all: Tavern cards / worldbooks / presets | Done |
| Package build script | Done |
| Security notes / release checklist | Done |
| Browser E2E script with dependency preflight | Done (blocked by host libs) |
| Package build script / security notes / release checklist | Done |
| Helper runtime sourceCard loading + from-tavern reload | Done |
| Helper runtime optional Tavern session message binding | Done |
| Session operation POC: regen / rollback / undo rollback / retry MVU | Done |
| Session patch client confirmation bridge | Done |
| Fusion apply path tested on creative profile | Done |
| Fusion apply path tested on clean web-profile copy | Done |
| Fusion link mode fallback | Done |
| Main web profile fusion applied by link | Done |
| Session patch client bridge | Done |
| MVU settlement watchdog around native sends | Done |
| Auto retry failed MVU settlement once by default | Done |
| Settlement / MVU / background status panel entries | Done |
| Fusion dry-run / apply CLI for main profile | Done |
| Tavern independent session create / send / state / cancel / delete | Done |
| Tavern independent session dispose (chat + automation cleanup) | Done |
| Tavern candidates display / selection (experimental) | Done |
| Candidate hard timeout + auto cancel | Done |
| Candidate fallback to manual input | Done |
| Dispose waits for candidate task stop before deleting chat | Done |
| MuseAI sessions stored as shared `sessions` resources | Done |

## Current POC Coverage

### Phase 3: MuseAI native pages

- Background (POC)
- Chat (POC)
- Adventure (POC)
- Bond (POC)
- Settings (POC)

### Phase 4: Story workbenches

- Novel template (POC)
- Short drama template (POC)
- Game template (POC)
- Video template (POC)

### Phase 5: Native Tavern compatibility

- Snapshot transcript bridge (POC)
- Feedback / continuation bridge (POC)
- Gameplay API compatibility play (POC, simple cards)
- Independent Tavern session create / send / state / cancel / delete / dispose (POC)
- Candidate display / selection (experimental, model/card-dependent)
- Candidate hard timeout / auto cancel / manual-input fallback (POC)
- Regex display runtime POC
- MVU read/write + settlement watchdog POC
- Helper variable bridge + card runtime diagnostics POC
- Minimal Tavern Helper runtime: vm scripts + event bus + variables
- Helper host API subset: chat messages / prompts / triggerSlash
- Helper runtime -> Tavern bidirectional sync
- Helper lifecycle hooks around native turns
- Helper runtime tool bridge (registerTool / callTool)
- Helper metadata / messages / eventOnce / macros / extension / worldbook APIs
- Migration all: Tavern cards / worldbooks / presets
- Package build script / security notes / release checklist
- DSH runtime skills + Story roles/tools
- Helper runtime quotas / timeouts / audit log
- Browser E2E preflight script (host libs missing)
- Session surface operations POC
- Browser-script-dependent card support (next)

### Phase 6: Feedback flywheel

- Tavern session summaries (POC)
- Relationship / preference extraction (POC)
- Continue-writing outlines (POC)
- New cards from play sessions (POC)

## Remaining Closure Items

1. Publish the host-side version matrix (P0-1)
2. Cut a formal GitHub Release / tag / release notes (P7-1)
3. Add guided migration wizard UI (P7-3)
4. Add full upgrade + rollback regression (P7-2)
5. Reconcile and provide reproducible real-browser E2E evidence (P7-6)
6. Keep README / STATUS / RELEASE / HOST-INTEGRATION / GAP synchronized

The CI test workflow, npm test script, migration backend, helper runtime, Story/MuseAI/Tavern POCs and main web fusion are now in place.

External ownership and evidence requirements are listed in `docs/EXTERNAL-DEPENDENCIES.md`.

## Full Tavern Compatibility Fallback

For cards where Tavern returns `requiresBrowser: true`, the native POC now exposes a same-origin launch route and a UI button to open the full Tavern workbench. See `docs/TAVERN-BROWSER-RUNTIME-ASSESSMENT.md`.
