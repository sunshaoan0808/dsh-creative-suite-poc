# Main-Profile Fusion Test

## Purpose

Validate the `fusion --apply` path against a profile that contains the real web-profile plugin stack, without modifying the user's main `web` profile.

## Method

1. Create a clean copy of the web profile package layer:

```sh
mkdir -p /root/.dsh/profiles/fusion-test
cp /root/.dsh/profiles/web/package.json /root/.dsh/profiles/fusion-test/package.json
cp /root/.dsh/profiles/web/cordis.yml /root/.dsh/profiles/fusion-test/cordis.yml
cp /root/.dsh/profiles/web/cordis.patch.yml /root/.dsh/profiles/fusion-test/cordis.patch.yml
cp /root/.dsh/profiles/web/pnpm-workspace.yaml /root/.dsh/profiles/fusion-test/pnpm-workspace.yaml
```

2. Apply fusion:

```sh
node ./bin/dsh-creative-suite.mjs fusion --profile fusion-test --apply
```

3. Smoke test the fused profile:

```sh
node ./bin/dsh-creative-suite.mjs smoke --profile fusion-test
```

4. Remove the temporary profile and its backup afterwards.

## Result

Fusion apply completed:

```text
+ dsh-creative-suite-poc link:/root/dsh-creative-suite-poc
```

Bundles after fusion:

```text
@deepseek-ai/dsh-base
@deepseek-ai/dsh-web-app
dsh-device-shell-guide
dsh-task-notifier
dsh-status-overlay
dsh-web-mobile
dsh-app-integration
dsh-tavern-entry
dsh-creative-suite-poc
```

Smoke result:

```json
{
  "ok": true,
  "profile": "fusion-test",
  "status": {
    "name": "DSH Creative Suite POC",
    "version": "0.6.0"
  }
}
```

## Link Mode Fallback

The live `web` profile's `node_modules` was created by a different pnpm store version, so `dsh plugin add` failed with `ERR_PNPM_UNEXPECTED_STORE`.

A link-mode fallback was added:

```sh
node ./bin/dsh-creative-suite.mjs fusion --profile <name> --apply --link
```

It:

- backs up `package.json`
- writes the dependency and bundle entries directly
- creates `node_modules/dsh-creative-suite-poc -> /root/dsh-creative-suite-poc`
- skips pnpm

It was validated against a real web-profile copy.

## Applied To Live Web Profile

The main `web` profile was then fused with link mode:

```text
/root/.dsh/profiles/web/package.json       updated
/root/.dsh/profiles/web/node_modules/dsh-creative-suite-poc -> /root/dsh-creative-suite-poc
```

`dsh --profile web --dump-config` now contains:

```text
# == dsh-creative-suite-poc
- id: creative-suite
  name: dsh-creative-suite-poc
```

Backup:

```text
/root/.dsh/backups/web-package-2026-09-24T00-00-27-562Z.json
```

Rollback:

```sh
cp /root/.dsh/backups/web-package-2026-09-24T00-00-27-562Z.json /root/.dsh/profiles/web/package.json
rm -rf /root/.dsh/profiles/web/node_modules/dsh-creative-suite-poc
```

DSHA must be restarted to load the new profile bundle.

## Conclusion

The fusion layer works on a copy of the real web profile stack. The main `web` profile was not modified; applying to it is now a matter of:

```sh
node ./bin/dsh-creative-suite.mjs fusion --profile web --apply
```

and then restarting DSHA.
