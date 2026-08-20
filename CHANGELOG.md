# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-18

Initial public release.

### Added

- Named credential manager as a standalone DSH bundle plugin, merging three pieces into a single package:
  - `credential-manager` host service plugin: metadata sidecar (storage domain), secret values behind the `ctx.credentials` seam, `DSH_CM_*` shell-env injection resolved per execution.
  - `tool-credential-manager` host tools plugin: model-facing tools `credential_list` / `credential_create` / `credential_read` / `credential_update_note` plus a system-prompt policy section.
  - Settings → Credentials web client plugin (`dsh.client`): the page where secret values are entered and managed, talking to the host over a self-mounted Typert Remote namespace.
- No harness source modifications; installs via bundle patch (`cordis.patch.yml`) on the vanilla upstream harness.
- 14 unit tests (vitest).
