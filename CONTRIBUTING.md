# Contributing

Thanks for your interest in improving dsh-credential-manager!

## Development setup

```sh
pnpm install
pnpm run typecheck
pnpm run build
pnpm test
```

## Ground rules

- Keep changes focused: one improvement per commit, with a message that says what and why.
- This plugin must keep working on the harness versions documented in the README; note any new core dependency in your PR.
- Never commit secrets, tokens, local absolute paths, or machine-specific configuration.
- Run `pnpm run typecheck` and `pnpm test` before opening a PR; CI runs the same checks.

## Reporting issues

Use the issue templates. Include your harness version (the npm package version or source commit), your profile setup, and a minimal reproduction.
