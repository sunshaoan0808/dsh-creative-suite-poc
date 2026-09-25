# Release Checklist

## Current Tooling

```sh
npm run smoke
node ./scripts/build-package.mjs
```

## Required Before Public Release

| Item | Status | Notes |
|---|---|---|
| Single tarball build | Done | `node scripts/build-package.mjs` creates a tarball |
| Versioned release notes | Done | See `docs/RELEASE-NOTES-0.17.1.md` |
| Install / upgrade / rollback test | Partial | install / fusion / smoke tested; full upgrade + rollback regression still open |
| Data migration wizard | Partial | backend + CLI `migrate` exists; guided UI still open |
| Security audit | Partial | quota / timeout / audit + SECURITY.md exist; external audit still open |
| Real browser E2E | Partial | CI/build scripts and route-level E2E exist; target-host browser dependencies need reproducible evidence |
| Regression suite | Done | `npm test` now runs `node --test test/*.test.mjs` |
| Rollback instructions | Done | Fusion CLI prints backup + rollback command; INSTALL/FUSION-TEST document it |

## External Dependencies

See `docs/EXTERNAL-DEPENDENCIES.md` for host publication, push credential ownership, target-host browser E2E and external audit ownership.

## Current State

- CLI install / smoke / fusion: working
- `npm test` / `npm run ci`: added
- GitHub Actions workflow: added
- Package build script: working
- Main web profile fusion: applied
- Browser E2E: route-level evidence exists; target-host system dependency evidence still needs reconciliation
