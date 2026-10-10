# Contributing to Flowinger

Thanks for looking. Flowinger is a small node-graph renderer for React, and the interesting work in it is
mostly *keeping it small and exact* — so this page is mostly about what "done" means here.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go to
[SECURITY.md](SECURITY.md), not to a public issue.

## What fits, and what does not

Flowinger is for apps that **draw a graph** — query plans, syntax trees, dependency maps, workflow
diagrams — and care what that costs. Its API follows [React Flow](https://reactflow.dev)'s, for the part of
it such apps use.

- **Fits:** a bug (a wrong edge anchor, a gesture that misfires, a type that is wrong); a React Flow prop,
  hook or field that real code needs and that can be added without growing the core; docs, examples, a
  layout recipe; a faster path.
- **Does not fit:** a new *runtime* dependency (the only peers are `react` and `react-dom`); anything that
  makes a canvas that only *shows* a graph pay for editing it — new behaviour that acts on the graph is
  a [feature](README.md#pay-for-what-you-use), not core; a layout engine in the package (positions come from
  you, from `d3-hierarchy`, `dagre`, `elkjs`…).
- **A drop-in for all of React Flow** is not a goal — the README says which parts are covered, from a
  measurement. If you need something on its "missing" list, open an issue saying what you were building:
  that is how the list gets ordered.

If a change is bigger than a bug fix, open an issue first. A paragraph is enough, and it saves you a rewrite.

## Setting up

Node 20.19, 22.12 or later (what Vite 8 needs; CI uses 24) and [pnpm](https://pnpm.io) — `corepack enable`
picks the version in `package.json`.

```bash
pnpm install
pnpm dev           # the demo at http://localhost:5173 (index.html + demo/)
```

## The gate

A change is ready when all of these pass; CI runs them on React 18 and 19.

```bash
pnpm typecheck
pnpm test                       # vitest, jsdom — `pnpm test edges` runs the files matching "edges"
pnpm build                      # dist/: ESM, CJS and declarations for both
pnpm size --max-full 27 --max-lean 17     # gzip kB: the whole canvas, and the core with no features
node scripts/size-dist.mjs --max-lean 17  # the core again, from the built package
pnpm check:package              # publint + Are the Types Wrong, on the packed tarball
pnpm check:examples             # each app in examples/ installed against that tarball, type-checked and built
pnpm e2e                        # Playwright, a real browser against the demo (see below)
```

**The size budget is a rule, not a hint.** The lean core is what makes the package worth its name; a
feature that grows it must say why in the pull request, and raising a budget is its own reviewed change.
`src/__tests__/bundle.test.ts` fails if a feature, an unused component or the dev warnings leak into a
bundle that did not ask for them.

## How changes are tested

- **Every behaviour has a test, and a guard has a test that fails without it.** The project's habit — see
  [`plan.md`](plan.md) — is to *break the guard and watch a test fail*, then restore it. If you add an
  `if` that matters, break it once and confirm.
- **Where flowinger should behave like React Flow, ask React Flow.** `@xyflow/react` is a dev-only
  dependency, pinned, used as an oracle: several suites run the same input through both and compare
  (`positionAbsolute`, `getViewportForBounds`, the `NodeProps` handed to a custom node…). Prefer that to a
  hand-written expectation.
- **jsdom has no layout and no real pointer.** Anything that depends on measured sizes, pointer capture,
  wheel or touch needs a look in a real browser — say what you did in the pull request. `pnpm e2e` runs
  [`e2e/smoke.spec.ts`](e2e/smoke.spec.ts) against the demo with Playwright: `pnpm exec playwright install
  chromium` once, or `E2E_CHANNEL=chrome pnpm e2e` to use the Chrome you have. A behaviour that was only ever
  seen in a browser should get a test there. The bugs this project has found *only* that way are in
  `plan.md`.
- **Server rendering is part of the contract.** `ssr.test.tsx` and `hydration.test.tsx` render without a
  `document`; a hook that reads `window` at render will fail there.

## Compatibility with React Flow, and its source

Match React Flow's **behaviour** — names, props, geometry, defaults — by reading its documentation and its
published type declarations, and by running it. **Do not copy its source.** The few lines adapted from it
are listed, with its licence, in [NOTICE.md](NOTICE.md); that list should not grow without a good reason
and a line there. The same goes for any other project's code.

## Pull requests

- Small and focused beats thorough and large. One behaviour per pull request where you can.
- Explain *what a user sees change*, and anything you chose not to do.
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for anything a user could notice.
- If you add or change a prop, field or export, the README's tables are part of the change — and so is
  its "Coming from React Flow" list, which is measured: `node scripts/audit-react-flow.mjs <path to
  @xyflow/react's dist/esm/index.d.ts>` regenerates the counts.

Commit messages: say what changed and why, in plain sentences. No special format is required.

## Releasing

Maintainers only. A release is a tag; there is no npm token anywhere.

1. In a pull request: move **Unreleased** in `CHANGELOG.md` under the new version heading
   (`## [0.5.0] - YYYY-MM-DD`), and set `version` in `package.json`. The demo's label follows it. If an
   example now uses API this release adds, raise its `flowinger` range in `examples/*/package.json` — they
   ask the registry for the released package, so a copied folder works as it is.
2. After it merges: `git tag v0.5.0 && git push origin v0.5.0`.
3. [`release.yml`](.github/workflows/release.yml) re-runs the gate, publishes to npm with a provenance
   attestation, and creates the GitHub release from the changelog. A tag with a hyphen (`v0.5.0-rc.1`)
   goes to the `next` dist-tag and is marked a prerelease.

**One-time setup**, on npmjs.com: the package's *Settings → Trusted Publisher → GitHub Actions*, with this
repository's owner and name and the workflow file `release.yml` (the environment is left blank). Then, in
*Publishing access*, choose "Require two-factor authentication and disallow tokens" — trusted publishing
keeps working, and a leaked token no longer can publish. npm does not validate the form when it is saved;
the first tag push is the test, so make it a prerelease.

Anyone can check a release: `npm audit signatures` verifies the registry signature and the provenance
attestation, which names the workflow run and commit that built the tarball.
