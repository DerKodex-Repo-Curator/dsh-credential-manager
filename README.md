# dsh-credential-manager

**English** | [简体中文](README.zh.md)

Named user credentials for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): let the model use your API keys, tokens, and logins **by reference** — secret values never enter the conversation.

One credential is one flat record holding exactly one secret value. The model creates empty placeholder records with its `credential_create` tool; you enter the secret value in **Settings → Credentials**. Every configured secret is injected into each model shell execution as a `DSH_CM_<ID>` environment variable, resolved per execution, so the value reaches commands without ever being printed into the transcript.

## What you get

| Piece | Kind | Purpose |
|---|---|---|
| `credential-manager` | host service plugin | Metadata sidecar (storage domain), secret values behind the `ctx.credentials` seam, `DSH_CM_*` shell-env injection |
| `tool-credential-manager` | host tools plugin | Model-facing tools `credential_list` / `credential_create` / `credential_read` / `credential_update_note` + a system-prompt policy section |
| Settings → Credentials | web client plugin (`dsh.client`) | The page where you enter/manage secret values; talks to the host over a self-mounted Typert Remote namespace |

## Install

From GitHub (builds on install via its `prepare` script; pnpm will ask you to allow the build once):

```sh
dsh plugin --profile web add github:accpowered/dsh-credential-manager
```

If pnpm prints an `allowBuilds` prompt, add the printed key under `allowBuilds` in the profile's `pnpm-workspace.yaml` and re-run the `add` — this is install-time code execution permission, so only allow sources you trust (pinning a commit, `github:accpowered/dsh-credential-manager#<sha>`, is recommended).

From a local checkout:

```sh
dsh plugin --profile web add ./dsh-credential-manager
```

Restart `dsh web` (or your profile) and hard-refresh the browser.

## How it works with the harness

The bundle patch ([cordis.patch.yml](cordis.patch.yml)) inserts two host rows; the `dsh.client` declaration makes the web plane serve the settings page automatically:

```yaml
- insert:
    - id: credential-manager
      name: dsh-credential-manager
    - id: tool-credential-manager
      name: dsh-credential-manager/tools
```

No harness source is modified:

- The tools register into the **host** tool registry, so every agent preset sees them.
- The settings page mounts its own Typert Remote contribution through the public `ctx.remote.$mount` seam — no `api/remotes` edit needed.
- The host service is a `TypertRemoteService`; the gateway discovers its `@Remote` methods dynamically (SRC markers), so no code generation step is required to deploy.

**Stock-upstream note:** the upstream `api/remotes` forwarded-event allowlist does not include `credential-manager/updated`, so the settings page does not receive live push invalidations from *other* surfaces; it still converges through authoritative mutation replies and connection-reset refetches. If you run a harness that forwards the event, the page lights up live automatically.

## Configuration

Both host rows work with zero configuration; every knob carries a schema default. To tune, restate the row in your profile's `cordis.patch.yml` (a patch replaces the row's whole config):

```yaml
- id: credential-manager
  name: dsh-credential-manager
  config:
    maxNoteBytes: 8192        # UTF-8 byte cap for one user/LLM note field

- id: tool-credential-manager
  name: dsh-credential-manager/tools
  config:
    promptOrder: 116          # ordering weight of the system-prompt policy section
```

To mount only the service and the settings page (no model-facing tools), delete the `tool-credential-manager` row from the bundle patch.

## Usage

1. In a conversation, when the model needs a credential it calls `credential_create` with a name only (never a value) and asks you to fill it in.
2. Open **Settings → Credentials**, find the placeholder, and enter the secret value (write-only; it is never read back into any page or transcript).
3. The model uses the value through the listed `DSH_CM_<ID>` variable in `bash`/`pwsh` commands: `curl -H "Authorization: Bearer $DSH_CM_MYAPI" ...`.
4. `credential_read` exists as a deliberate last-resort escape hatch for non-shell use; the harness instructs the model to prefer the variable path.

Expired credentials keep working (the expiry day is informational) but are flagged in the page and in `credential_list` so the model can tell you to rotate them.

## Uninstall

```sh
dsh plugin --profile web remove dsh-credential-manager
```

The service, tools, system-prompt section, settings page, and Remote namespace all detach with the plugin fiber. Persisted metadata rows (`storages/credential_manager.json` in the harness home) and stored secret values are left untouched.

## Development

```sh
pnpm install
pnpm build       # tsc declarations + tsdown (node lib + browser client bundle)
pnpm test        # vitest: service CRUD / seam confinement / tool mapping
```

Layout: `src/index.ts` (host service, default export), `src/tools.ts` (tools plugin), `src/types.ts` + `src/spec.ts` (wire types + storage domain), `src/client/` (settings page; `remote.ts` is the hand-maintained Typert Remote contribution — keep it in sync with the service's `@Remote` methods).

## License

MIT
