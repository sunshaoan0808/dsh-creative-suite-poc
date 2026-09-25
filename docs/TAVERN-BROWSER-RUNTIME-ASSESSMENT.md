# Tavern Browser Runtime Compatibility Assessment

## Current POC State

The native play view in DSH Creative Suite uses Tavern's production gameplay API:

```text
POST /api/dsh-tavern/gameplay.create
POST /api/dsh-tavern/gameplay.send
GET  /api/dsh-tavern/gameplay.state
```

Tavern reports:

```json
{
  "version": 1,
  "transport": "production-session",
  "browserScriptRuntime": false
}
```

So the pure API path does **not** host a browser template runtime, card HTML runtime, MVU browser bridge, or card helper-script runtime.

## What Works

- Simple ST JSON cards
- Cards without browser-script requirements
- Text-only cards
- Server-side worldbook / preset / model flow that Tavern already handles
- Native projected text (`displayText` / `projectionText`) produced by Tavern's server-side display layer

## What Fails Closed

When `gameplay.create` returns:

```json
{ "requiresBrowser": true }
```

the native POC does not send input. This is intentional and safer than sending a partial turn.

Typical cards that fall into `requiresBrowser: true`:

- cards whose presentation depends on in-card HTML
- cards requiring browser-side MVU state panel runtimes
- cards using Tavern Helper scripts that must run in the page
- cards whose regex / display pipeline expects a browser template executor
- cards using custom page-level DOM or injected UI

## Compatibility Options

### A. Fallback to Full Tavern Workbench (Implemented)

The POC now exposes:

```text
GET /plugins/creative-suite/tavern/launch
```

It reads the active Tavern authenticated URL from `tavern.log`.

The native play view shows:

```text
在完整酒馆工作台打开
```

when `requiresBrowser: true`.

This is the current production-safe fallback: the user stays in the POC for simple cards, and moves to the full Tavern workbench for complex cards.

### B. Headless Browser Runtime

Tavern's own automated tests already use a headless browser path for template execution.

Potential integration:

```text
DSH Creative Suite
  -> asks Tavern gameplay API for a browser-backed session
  -> Tavern launches / reuses a headless browser template runtime
  -> native POC continues to use gameplay.send / state
```

Benefits:

- keeps the POC UI
- preserves browser-script fidelity
- reuses Tavern's existing test/runtime infrastructure

Costs:

- process and memory overhead
- browser lifecycle management
- authentication / isolation concerns
- harder to run on Android

### C. Native JS Shim Runtime

Implement a limited native runtime inside the POC:

- MVU variable read / write
- simple status panel projection
- subset of Tavern Helper events
- subset of regex display processing
- no arbitrary card HTML execution

Benefits:

- low dependency on a browser
- enough for many cards
- fits the current native POC

Costs:

- high compatibility risk
- easy to diverge from Tavern semantics
- cannot cover arbitrary card scripts or DOM injection

## Recommendation

Short term:

```text
Use native gameplay for simple cards.
Use `requiresBrowser` as a hard guard.
Fall back to the full Tavern workbench via /tavern/launch.
```

Medium term:

```text
Add a native MVU / regex / helper shim that covers read-only status and simple output processing.
```

Long term:

```text
Integrate Tavern's headless browser template runtime as an optional capability,
or move these cards to a single native DSH + Tavern runtime.
```

The POC should not claim full card compatibility until either the headless runtime or a faithful native runtime is in place.
