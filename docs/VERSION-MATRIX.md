# DSH Creative Suite POC — Version Matrix (P0-1)

POC version: **0.17.0** (`package.json:2-3`).

Scope: everything below is **POC-local and grep-verified** inside this repo.
Anything the DSH host must own/confirm is listed under
[Host pending items](#host-pending-items-needs-dsh-host) — the POC cannot
pin or publish the host side.

## 1. POC package / resolved pins (lockfile)

| Item | Declared | Resolved (lockfile) |
|---|---|---|
| POC package | `dsh-creative-suite-poc@0.17.0` (`package.json`) | — |
| lockfile | `package-lock.json`, lockfileVersion **3**, 14 packages | — |
| `ajv` (dependencies) | `^8.20.0` | **8.20.0** (`node_modules/ajv`) |
| `playwright` (dependencies) | `^1.63.0` | **1.63.0** (`node_modules/playwright`) |

## 2. Peer ranges (host resolves the actual version at runtime)

| Peer | Range declared by POC | Resolved in POC dev install |
|---|---|---|
| `@deepseek-ai/cordis` | `^4.0.1` (`package.json` peerDependencies) | **4.0.4** (`node_modules/@deepseek-ai/cordis`) |
| `react` | `^18.2.0` (`package.json` peerDependencies) | **18.3.1** (`node_modules/react`) |

These are `^` ranges by design: the DSH host decides the actually loaded
cordis/react at runtime. The POC cannot pin the host side.

## 3. STORE_VERSION (file-store format version)

- `lib/index.js`: `const STORE_VERSION = 1`.
- `emptyStore()` stamps new stores with `version: STORE_VERSION`.
- `normalizeStore()` rejects (falls back to empty store) any persisted value
  whose `version !== STORE_VERSION`.
- 9 resource kinds (`RESOURCE_KINDS`): `cards, worldbooks, presets, styles,
  novels, scripts, summaries, sessions, stories`.
- `lib/migrator.js`: legacy migration entry; per-item `version: item.version || 1`;
  migrated payload's store `version` falls back to `'0.17.0'` string when the
  legacy store has no version (see §5 note).

## 4. Resource schema version (data contract)

- `schemas/resource.schema.json` — unified resource record (P1-1):
  `version: integer, minimum 1` (`version: item.version || 1` at write time).
- Required field: `name` only; `id/kind/source/createdAt/updatedAt/data/lineage`
  optional, `additionalProperties: true`.
- Regression tests: `test/resource-versions.test.mjs`, `test/migrator.test.mjs`.

## 5. GET /status version fields

`GET /plugins/creative-suite/status` (`lib/index.js`, `apply()` route
registration) returns:

```json
{
  "ok": true,
  "name": "DSH Creative Suite POC",
  "version": "0.17.0",
  "storageDomain": "creative-suite",
  "modes": ["coding", "tavern", "museai", "story"],
  "store": { "file": "<dshHome>/storages/creative-suite.json", "resources": { "<kind>": <count> } }
}
```

Field notes:

- `version` — hard-coded `'0.17.0'` string in the handler. Must be
  cross-checked against the host's installed bundle version, not trusted
  blindly (see host pending items).
- `storageDomain` — POC-declared storage domain identifier
  (`export const STORAGE_DOMAIN = 'creative-suite'`, `lib/index.js` top).
  Covers the shared file store (`openFileStore`: `<dshHome>/storages/
  creative-suite.json`, atomic save via `file.tmp-<uuid>` + `rename`,
  `ENOENT` → empty store) and story projects (`storyProjectsRoot`:
  `<dshHome>/profile-data/creative-suite/projects`). POC-side declaration
  only — quota/ownership and cross-plugin isolation need host confirmation.
- `modes` — data echo only (`['coding','tavern','museai','story']`); there is
  no global mode system in-repo (per-component `useState` switchers in
  `lib/client.js`).
- `store.file` / `store.resources` — live values from the opened file store.
- Client surfaces: `lib/client.js` renders `API v{capabilities.version}` and
  diag rows (status name+version, capabilities version, 完整/兼容模式）.

## 6. Related version touchpoints

- `lib/migrator.js` — `store.version = legacyStore.version || '0.17.0'`
  (string fallback for legacy payloads without a version; note this differs
  in type from numeric `STORE_VERSION = 1` and is normalized on next read).
- Tavern gameplay capabilities proxy:
  `GET /plugins/creative-suite/tavern/gameplay/capabilities` → forwards
  `tavernGameplayRequest(dshHome, 'capabilities')` (`{ version,
  browserScriptRuntime, … }`).
- Client diag pane (`TavernDiagPane`, `lib/client.js`) probes status /
  capabilities / session-patch ensure / helper runtime / cards.
- Host bundle wiring: `cordis.patch.yml` (host-row insert stub,
  `id: creative-suite`).

## Host pending items (needs DSH host)

> 2026-09-25 host实测（/root/dsh-deploy, DSH_HOME=/root/.dsh）：
> - host `@deepseek-ai/dsh` = **0.1.0-rc.8**；web-app bundle = **0.1.0-rc.8**；
>   cordis peer解析 = **4.0.1**；react = **18.3.1**；POC peer ranges（cordis ^4.0.1 / react ^18.2.0）全兼容。
> - `GET /plugins/creative-suite/status` live返回 `version 0.17.0 + storageDomain creative-suite`，store路径确认。
> - host无顶层app view概念（40 slot零命中），P0-3上限即conversation.view；host无全局mode系统，P0-6上限即in-view switcher。
> 剩余需host发布：正式版本矩阵文档、storageDomain quota/归属、统一诊断UI放置。

1. Formal host↔POC version matrix (host version, supported cordis range,
   react range, API v, `browserScriptRuntime` flag) — must be owned/published
   by the DSH host.
2. Actual resolved `@deepseek-ai/cordis` / `react` versions at runtime
   (POC declares `^` ranges only).
3. Cross-check of the hard-coded `GET /status` `version: '0.17.0'` against the
   host's installed bundle version.
4. Storage-domain confirmation: canonical `DSH_HOME`/data-root (POC assumes
   `process.env.DSH_HOME || ~/.dsh`), sanctioned path for
   `<dshHome>/storages/creative-suite.json` (collision check against
   host-managed files), quota/ownership and cross-plugin isolation policy.
   POC writes to `profile-data/tavern/…` are read-only; any write-back or
   migration into host tavern storage needs host approval.
5. Whether `storageDomain: 'creative-suite'` is accepted as the canonical
   identifier, or the host assigns a different one.
