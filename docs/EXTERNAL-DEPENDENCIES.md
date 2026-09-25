# External Dependencies and Ownership

These items cannot be completed from repository code alone.
They must have an explicit owner, evidence and a status.

| ID | Item | Owner | Required Evidence | Current Status |
|---|---|---|---|---|
| E-1 | Host version matrix publication (P0-1) | DSH / DSHA host owner | Filled `docs/HOST-VERSION-MATRIX.md` with host version, cordis, react, `capabilities.version`, `browserScriptRuntime` | Open |
| E-2 | Target-host browser E2E (P7-6) | Deployment owner | `npm run e2e:browser` passing on the target host with Playwright system dependencies | Open |
| E-3 | GitHub Release push credential | Repository owner | Tag pushed, GitHub Release created, release asset uploaded | Repository owner performs push; credentials must never be shared in chat |
| E-4 | External security audit (P7-4) | Security owner | External audit report or signed checklist | Open |
| E-5 | Publish strategy for `private: true` (P7-1) | Repository owner | Decision: keep private, publish to npm, or publish elsewhere | Open |

## Rules

- The assistant prepares patches, release notes, tarballs and verification evidence.
- The repository owner pushes with their own credential; do not send PATs into chat.
- The DSH host owner publishes host-side facts; the repo cannot invent live host values.
- Deployment owner runs browser E2E on the actual target host.
- Security owner signs off the remaining risks in `docs/SECURITY.md`.

## Closure Condition

All E-1 through E-5 rows must have:

```text
owner + evidence + status
```

Only then can the project call itself fully released.
