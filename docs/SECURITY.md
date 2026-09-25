# Security Notes

## Current POC Boundaries

- The Helper runtime uses Node `vm`. It is a compatibility experiment, not a hardened security sandbox.
- Card Helper scripts are local, user-supplied code. Run only cards you trust.
- `/tavern/launch` returns a local authenticated Tavern URL. Treat it as a secret.
- Static resource proxy and runtime routes are local-only POC surfaces.
- Shared resource files live under `$DSH_HOME/storages/creative-suite.json`.

## Implemented POC Mitigations

- Script size limit: 256 KiB
- Variables size limit: 256 KiB
- Message count limit: 2000
- Prompt injection limit: 256
- Handler count limit: 128 per event
- Tool count limit: 64
- Event queue limit: 1024
- Event recursion depth limit: 16
- Handler timeout: 3000 ms
- Tool timeout: 5000 ms
- Slash command count limit: 2000
- Audit log entries: 500
- Runtime snapshot exposes `limits` and `audit`

## Recommended Hardening

1. Replace `node:vm` with `isolated-vm` or a worker-based sandbox.
2. Add explicit allowlists for Helper APIs.
3. Add route-level capability checks for runtime start/event/sync.
4. Never expose `/tavern/launch` to non-local origins.
5. ~~Add audit logs for runtime variable writes and message creation.~~ Done: variable writes (`variable-set/delete/merge/reset`) and settlements (`settlement-begin/settled/failed/timeout`) are audit-logged in `helper-runtime.js` (cap 500 entries, exposed in runtime snapshot); message creation flows through settlements/variables, no unaudited direct message writer exists.
6. Add size/time quotas per Helper script and per event.
7. Sign or hash shared cards before importing into Tavern.

## Status

This document is a POC security gap list, not a completed audit.
