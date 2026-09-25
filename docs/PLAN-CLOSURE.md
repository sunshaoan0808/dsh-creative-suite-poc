# Plan Closure Checklist

## Closed In This Pass

- [x] Remove stale contradictions from README / STATUS / GAP / RELEASE
- [x] Update HOST-INTEGRATION to current route / inject / P0 status
- [x] Add `npm test`
- [x] Add GitHub Actions CI workflow
- [x] Add release notes
- [x] Remove stray schema backup file
- [x] Keep package build dry-run working
- [x] Document remaining host-side items

## Still Open

- [ ] Publish host-side version matrix (P0-1) — owner: host
- [ ] Create formal GitHub Release / tag (P7-1) — owner: repo owner
- [ ] Add guided migration wizard UI (P7-3)
- [ ] Add upgrade + rollback regression (P7-2)
- [ ] Provide reproducible target-host browser E2E evidence (P7-6) — owner: deployment
- [ ] Decide publication strategy for `private: true` — owner: repo owner
- [ ] Optional: replace `node:vm` with isolated worker sandbox

External ownership and evidence requirements are listed in `docs/EXTERNAL-DEPENDENCIES.md`.

## Verification

- `npm test`
- `npm run ci`
- `node scripts/build-package.mjs`
- `npm run smoke`
- `npm run e2e:browser` (host dependent)
