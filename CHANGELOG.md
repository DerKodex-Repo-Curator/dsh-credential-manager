# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-09-19

Adapted to and verified on `@deepseek-ai/dsh` 0.1.5-rc.2 (vanilla upstream, no core patches).

### Changed

- `Context.remote` is now declared as `ClientRemote` from `@deepseek-ai/dsh-api-gateway/client`; the previous broader `TypertClientRemote` declaration collides with the upstream augmentation (TS2717).
- `@deepseek-ai/dsh-client-runtime` was removed upstream: the store engine moved to `@deepseek-ai/dsh-client-store` and the `slots` service to `@deepseek-ai/dsh-client-ui-renderer`. The browser build's frozen module table (`tsdown.config.ts`) now mirrors the new `PLATFORM_MODULES` (adds `dsh-client-store` and `dsh-client-ui-dockkit`; drops `dsh-client-web-react`, `ui-attachment` and `schema-form`).
- The client bundle vendors its own `bindSnapshotSelector` (uSES) instead of importing `@deepseek-ai/dsh-client-web-react`: `dsh-client-ui-renderer` does not re-export it publicly and is not part of the shell's frozen module table, so it can only be inlined.
- Peer dependency ranges moved to `^0.1.5-rc.2`, `@deepseek-ai/cordis` to `^4.0.2`, `@deepseek-ai/schemastery` to `^3.18.2`; `@deepseek-ai/dsh-api-gateway` was added as an optional peer. `zod` is pinned to `4.4.3` to match the harness and avoid duplicate schema type conflicts.

### Fixed

- Tests follow the `CallId` → `ToolCallId` rename in `@deepseek-ai/dsh-llm`.

## [0.1.0] - 2026-08-18

Initial public release.

### Added

- Named credential manager as a standalone DSH bundle plugin, merging three pieces into a single package:
  - `credential-manager` host service plugin: metadata sidecar (storage domain), secret values behind the `ctx.credentials` seam, `DSH_CM_*` shell-env injection resolved per execution.
  - `tool-credential-manager` host tools plugin: model-facing tools `credential_list` / `credential_create` / `credential_read` / `credential_update_note` plus a system-prompt policy section.
  - Settings → Credentials web client plugin (`dsh.client`): the page where secret values are entered and managed, talking to the host over a self-mounted Typert Remote namespace.
- No harness source modifications; installs via bundle patch (`cordis.patch.yml`) on the vanilla upstream harness.
- 14 unit tests (vitest).
