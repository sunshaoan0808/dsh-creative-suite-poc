# Release Checklist

## Current Tooling

```sh
npm run smoke
node ./scripts/build-package.mjs
```

## Required Before Public Release

- [ ] Single tarball build
- [ ] Versioned release notes
- [ ] Install / upgrade / rollback test
- [ ] Data migration wizard
- [ ] Security audit
- [ ] Real browser E2E
- [ ] Regression suite
- [ ] Rollback instructions

## Current State

- CLI install / smoke / fusion: working
- Package build script: present
- Main web profile fusion: applied
- Browser E2E: blocked by missing Playwright system dependencies in this environment
