## What changes for a user

<!-- What someone using the package sees differently. If nothing, say what is now easier to maintain. -->

## Why

<!-- The bug or the need; link the issue. Anything you chose *not* to do, and why. -->

## Checked

- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`
- [ ] `pnpm size --max-full 27 --max-lean 17` — the core did not grow, or the description says why
- [ ] `pnpm check:package` if `package.json`, `exports` or the build changed
- [ ] New behaviour has a test; a new guard has a test that fails without it
- [ ] Looked at in a real browser (`pnpm dev`) if it depends on layout, pointer capture, wheel or touch — what I did:
- [ ] README table / "Coming from React Flow" list updated if a prop, field or export changed
- [ ] A line under **Unreleased** in `CHANGELOG.md`
- [ ] No code copied from another project (or it is credited in `NOTICE.md`)
