# DSH Creative Suite Install / Smoke

## Requirements

- DSH CLI available as `dsh`
- `DSH_HOME` defaults to `~/.dsh`

## Status

```sh
node ./bin/dsh-creative-suite.mjs status --profile creative
```

Checks:

- profile package.json exists
- profile bundle list contains `dsh-creative-suite-poc`
- `dsh --profile <name> --dump-config` contains the host row

## Install Into A Profile

```sh
node ./bin/dsh-creative-suite.mjs install --profile creative
```

Equivalent internal command:

```sh
dsh plugin --profile creative add /root/dsh-creative-suite-poc
```

## Smoke Test

```sh
node ./bin/dsh-creative-suite.mjs smoke --profile creative
```

What it does:

1. Starts `dsh --profile creative --port 0 --no-open`
2. Reads the printed authenticated URL
3. Calls:

```text
/plugins/creative-suite/status
```

4. Prints the result
5. Terminates the temporary DSH Web process

Optional:

```sh
node ./bin/dsh-creative-suite.mjs smoke --profile creative --port 3091 --timeout 90000
```

## Package Script

```sh
npm run smoke
```

## Fusion Plan

Dry run:

```sh
node ./bin/dsh-creative-suite.mjs fusion --profile web
```

Apply:

```sh
node ./bin/dsh-creative-suite.mjs fusion --profile web --apply
```

`--apply` will:

1. Back up the target profile `package.json` under `$DSH_HOME/backups/`
2. Run `dsh plugin --profile web add /root/dsh-creative-suite-poc`
3. Run the status check
4. Print the rollback command

Do not run `--apply` against the main `web` profile until you are ready to restart DSHA and validate the new `创作` tab.
