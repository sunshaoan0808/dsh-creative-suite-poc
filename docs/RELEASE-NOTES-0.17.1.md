# DSH Creative Suite POC 0.17.1

## Overview

0.17.1 is the first plan-closure release candidate for the DSH Creative Suite POC.

It provides a single DSH-native plugin that hosts:

```text
coding
tavern
museai
story
```

## Highlights

### Shared resources

- ST JSON / PNG card import
- ST worldbook / preset import
- unified resource schema and validation
- import/export conversion
- lineage graph, resource versions, diff and rollback
- migration backend and CLI

### Story

- Story project/file protocol
- chapter structure analysis
- outline / chapter / drama / game / video generation
- batch generation and retry
- shared `scripts` resource output + lineage
- DSH runtime skills:
  - creative-novel
  - creative-drama
  - creative-game
  - creative-video
- Story roles and tools

### Tavern

- native gameplay compatibility play
- session create / send / state / cancel / delete / dispose
- candidates with hard timeout / cancel / fallback
- session surface operations: regen / rollback / undo / retry MVU
- MVU variable write + settlement watchdog
- Helper Runtime:
  - vm execution
  - event bus and lifecycle
  - host API subset
  - tools / prompts / messages / worldbook / extension settings
  - bidirectional sync back to Tavern
  - quotas / timeouts / audit

### MuseAI

- native five-page workspace
- card/worldbook context binding
- Story resource binding
- model bridge through DSH `ctx.llm`

### Operations

- install / status / smoke / migrate / fusion CLI
- package build script
- GitHub Actions CI
- `npm test`

## Known Limitations

- Real-browser E2E evidence depends on the target host's Playwright system dependencies.
- The Helper runtime is a POC using `node:vm`, not an isolated security sandbox.
- Formal host version matrix, upgrade/rollback regression and guided migration UI are still open.
- `private: true` is still set; publication strategy is not finalized.

## Verify

```sh
npm ci
npm test
node scripts/build-package.mjs
npm run smoke
```
