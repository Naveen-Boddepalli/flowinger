# Plan: Flowinger 2.0

The next major version is `2.0.0`. From 1.0, a change that breaks anything [docs/stability.md](docs/stability.md)
covers waits for it. This page is the plan for that release: when it starts, what it breaks, what stays in `1.x`,
what has to be seen working first, and in what order. Each section says whether it is decided, proposed, or waiting
on a measurement. Decisions are the owner's; "proposed" means a recommendation not yet taken.

## Where it stands (2026-10-17)

- `1.0.1` on npm, a day after `1.0.0`. About 1,260 downloads in the 30 days to 2026-10-12 (557 in its last week).
  One known consumer, QueryLens, which put its trial of 1.0 off until after its own 2.0.
- Size: the core is 19.91 kB gzipped against a 20 kB budget, and the whole canvas 37.01 against 38. The core has
  less than 0.1 kB of room.
- React Flow: `latest` is 12.12.0 (2026-09-24) and `next` is **13.0.0-next.0** (2026-10-11). Checked today by
  running `scripts/audit-react-flow.mjs` against each and by diffing their declarations with 12.11.6's. 12.12.0's
  types are the same as 12.11.6's, and so are 13.0.0-next.0's public ones: 211 of 211 exports and 302 of 302
  members, all still named and all doing something here, with no type changed. So far 13 changes only how React
  Flow is shipped and built:
  - ESM only: its `exports` has no `require` condition.
  - `engines.node` is `>=20`, and React is `>=18` (was `>=17`).
  - zustand 5, and `@xyflow/system` 1.0.
  - It is compiled with the React Compiler, which adds `react-compiler-runtime` as a dependency.

  Defaults and behaviour are not in the types. They have to be read from 13's source, as the test behind
  `reactFlowDefaults` does for 12.

So **2.0 is not now.** A major version in the same month as the first stable one would tell users the contract is
cheap. Most of what is planned next can ship in a `1.x` minor anyway (see *Until then* below), and the one outside
event that would force a major, React Flow 13, has not shipped.

## When 2.0 starts

2.0 has a trigger, not a date. Work on it starts when one of these is true:

1. **React Flow 13.0.0 is on `latest`.** The stability page promises that `<ReactFlow>` follows a changed React
   Flow default or behaviour only in a major release. If 13 changes any, that is 2.0 (D1). If it changes none, as
   in next.0, 2.0 is mostly the packaging question (D2), which can wait for a better reason.
2. **Someone outside needs a change that cannot ship without breaking something covered.** They reported it in an
   issue, and there is no additive way round it.

These are not triggers: the size budget (D3 says why), a faster store, a new feature or pro module, or a change to
the feature API (still `@experimental`, so it can change in a minor).

## Decisions

### D1. Follow React Flow 13 on `<ReactFlow>` — **proposed; waiting on 13.0.0**

1.0's split stays: `<ReactFlow>` behaves like React Flow, while `<FlowingerCanvas>` and `<FlowingerCore>` keep
flowinger's own defaults. 2.0 moves `<ReactFlow>` from React Flow 12 to 13. When 13.0.0 is out, the audit and the
`reactFlowDefaults` test are run against it, and every difference goes into a table like 1.0's D1, sorted by what
kind of change it is:

| What 13 does | Where it lands in flowinger |
|---|---|
| Adds a name (export, prop, instance method) | A `1.x` minor, as the stability page already allows |
| Removes or renames a name | Flowinger keeps the old one (aliases are free), marked `@deprecated` with 13's replacement. Nothing is removed |
| Changes a default | 2.0, on `<ReactFlow>` only. `reactFlowDefaults` takes 13's values, and 12's stay exported as `reactFlow12Defaults` for one major. Props given to `<ReactFlow>` win over its defaults, so `<ReactFlow {...reactFlow12Defaults}>` keeps what a 1.x `<ReactFlow>` did |
| Changes behaviour (what a change event carries, when a callback fires) | 2.0. On `<ReactFlow>` only where the component can tell, otherwise on all three canvases, with its own line in the upgrade guide |

"Flowinger follows React Flow 12.11.6's API" becomes "13.x". The `@xyflow/react` dev dependency moves to 13, and
the audit in CI runs against it.

**Done so far:** next.0 checked; it has no differences in types. The test that reads defaults from React Flow's
source has not been run against 13 yet. The upstream watch (step 0) does that.

### D2. Packaging: ESM only — **proposed; measure first**

Today flowinger ships three things for `require`:

- an ESM and a CJS build;
- a second copy of the declarations under `dist/cjs/` (`scripts/cjs-types.mjs`), because a CJS declaration may not
  import an ESM one;
- `typesVersions` and nine stub directories (`history/`, `pro/`…) for TypeScript's `node10` resolution.

The [design record](site/src/content/docs/design-record.md) rejected going ESM-only because it "breaks CJS-based
test runners and toolchains, for nothing at this size". Three things have changed since:

- **`require` loads ES modules on every supported Node.** Node 20 reached end of life in April 2026, and 22 and 24
  both `require()` an ES module without a flag (from 20.19 and 22.12). Checked today on Node 24.16: `require` of
  flowinger's ESM build (`dist/index.js`) loads it, with 93 runtime exports and `ReactFlow` a function.
- **TypeScript dropped `node10` resolution.** Checked with the compilers in this repository: TypeScript 7.0.2
  rejects `moduleResolution: node10` (TS5108, "has been removed"), and 6.0 fails on it unless
  `ignoreDeprecations` is set (TS5107). `typesVersions` and the stub directories now help only TypeScript 5 or
  older projects on `node10`.
- **React Flow 13 is ESM only.** A project moving from React Flow 13 has already solved this.

| Option | What ships | Who it breaks |
|---|---|---|
| A. Keep both (today) | Nothing changes | Nobody |
| B. ESM only | Drop the CJS build and `dist/cjs/`. `exports` keeps `types` and `default`, so `require` still works through Node's `require(esm)`. Add `engines.node` `>=20.19` | Tools with their own module loader that cannot load ESM through `require`: Jest in its default CommonJS mode is the one to measure. Also Node older than 20.19 |
| **C. B, and drop `typesVersions`, the stub directories and `main` / `module`** | `exports` is the whole entry map | As B, plus TypeScript ≤5 on `node10`, and bundlers that ignore `exports` (webpack 4) |

**Proposed: C, if the measurement passes.** That means one build, one set of declarations and a smaller tarball,
the same shape as React Flow 13. The measurement extends `pnpm check:registry` to a toolchain matrix, all run from
an empty project against the packed tarball:

- `require` and `import` on Node 22 and 24;
- Jest (current, default config) rendering a `<ReactFlow>`;
- Vitest;
- Next.js with the app router and with the pages router;
- TypeScript 5.x on `bundler` and `node16`;
- Are the Types Wrong with its ESM-only profile.

If something in common use breaks and has no one-line fix, the answer is A until 3.0, and the design record says
why again.

### D3. The core's size — **to measure, same rule as 1.0's D2**

At 19.91 of 20 kB, the next thing the core needs breaks the budget. Taking behaviour out of the core and putting it
into a feature is a breaking change only for `<FlowingerCore>` users, who would lose behaviour they had without
naming a feature. `<ReactFlow>` and `<FlowingerCanvas>` carry every feature, so for them nothing changes.

The rule is 1.0's: map the lean bundle (which module each byte comes from), measure what each part a
display-only viewer does not use costs, and move only what saves at least 0.1 kB gzip. The measurement changes
nothing, so it runs in 1.x. If nothing reaches the bar, as with 1.0's instance methods, 2.0 moves nothing and the
core's budget goes up in a minor release, with the reason in the changelog. The stability page already says
budgets are CI gates, not a promise.

### D4. React 18 — **decided: kept**

React Flow 13 still supports React 18, CI runs 18 and 19, and dropping 18 saves nothing that has been measured.
Revisit when React Flow drops it.

### D5. 1.x after 2.0 — **proposed**

This will be the first time two stable lines exist, with one maintainer.

- **Fixes:** 1.x gets security fixes and fixes for crashes and regressions for 6 months after `2.0.0`, from a `v1`
  branch cut at the last 1.x tag. No new features go there.
- **Publishing:** releases come from that branch through `release.yml` with a `v1` dist-tag, so a 1.x patch never
  moves `latest`. `release.yml` needs to learn both: a tag from a branch other than `main`, and the dist-tag.
- **Docs:** the roadmap's condition for versioned docs ("a `1.x` has users on more than one version") is met at
  2.0. The site keeps the 1.x pages under `/v1/`.

### Considered and left as they are

- **The `react-flow__*` class names and `rf__*` test ids.** They are what stylesheets and tests select on, and
  React Flow 13 keeps them.
- **The two names for one canvas** (1.0's D1), and the flowinger / React Flow name pairs. Aliases are free.
- **The React Compiler.** Using it is internal, so it is a 1.x question, not a 2.0 one. Flowinger already
  subscribes each component to its own slice of the store. On React 18 the compiler needs a runtime dependency,
  and flowinger has none. Measure it with `pnpm bench` in 1.x, and adopt it only if it wins without adding a
  dependency.
- **Covering the feature API.** Promising more is additive, so it can happen in any minor. Proposed: cover it in
  the minor after the spatial index, which is the last change to `EngineContext` that is planned.
- **The subpath names** (`flowinger/pro` and the rest).

## Until then: 1.x

Additive, so each can ship in a minor whenever it is ready. Mostly from the [roadmap](ROADMAP.md):

- The spatial index for culling (a grid of node ids).
- Connecting by keyboard.
- An NVDA pass on Windows, written up beside VoiceOver in [Accessibility](docs/accessibility.md).
- Mutation testing in CI.
- The codemod from [GROWTH.md](GROWTH.md) (`npx flowinger-migrate`).
- The feature API covered by semver (see above).
- React Flow 12.12 parity: nothing to add. Its types are 12.11.6's, checked today.
- The measurements for D2 (the toolchain matrix) and D3 (the lean-bundle map). They change nothing in the
  package.

## The order of work

### 0. The upstream watch (1.x, additive) — **to do first**

A scheduled CI job, weekly and on demand, runs two things against `@xyflow/react@next`:

- the coverage audit;
- the `reactFlowDefaults` test.

It fails on any difference. Then 13's changes show up as each `next` lands, not on release day, and D1's table
fills in as they arrive. It is the only part of this plan worth starting before the trigger.

### 1. 1.x minors

As above, for as long as React Flow 13 stays in `next`.

### 2. Decide (when the trigger holds)

- Fill D1's table from 13.0.0. Not from a `next`: the table has to describe what users will install.
- Take D2 and D3 on their measurements.
- Fix the scope: what is in 2.0 is D1–D3 as decided, and nothing else. Anything that turns up later is additive
  (2.x) or waits for 3.0.

### 3. The bridge: the last 1.x minor (non-breaking)

As 0.9 did for 1.0, everything 2.0 changes is announced in the code first:

- A development warning, once a page, for a `<ReactFlow>` that leaves out a prop whose default 13 changed. It
  names the prop, today's value and 2.0's. The bridge also exports `reactFlow12Defaults`, so the fix works before
  the upgrade as well as after it.
- If D2 is C or B, a development warning from the CJS build, where it can tell that `require` will stop working.
  The upgrade guide names the tools.
- `@deprecated` on any name 13 renamed, pointing at the new one.
- *Upgrading to 2.0* added to [docs/upgrading.md](docs/upgrading.md), and a 2.0 draft of
  [docs/stability.md](docs/stability.md).

### 4. The breaking changes (`release/2.0` branch, one PR)

One commit per decision, each with its tests and its line in the upgrade guide. Then the size budgets are
measured again, and the changelog says why for either outcome.

### 5. The proof

**Decided now, not at release time:** which items may be waived. 1.0 waived three on its release day.

| Check | Waivable? |
|---|---|
| The browser suite in Chromium, Firefox and WebKit, touch included | No |
| `pnpm check:registry` on the candidate, with D2's toolchain matrix, on React 18 and 19 | No |
| Every example built against the packed tarball | No |
| **Benchmarks re-run against React Flow 13.** The compiler and zustand 5 may change who is faster. The README's performance rows and the 60.5 → 19.0 kB chunk comparison are re-measured, and corrected where 13 wins. GROWTH.md's honesty rule applies | No |
| A real consumer on the candidate for a week (QueryLens, after its own 2.0) | Yes, with the reason in this plan |
| A phone and a screen reader, if 2.0 changes any input handling | Yes, if it changes none |

### 6. Docs for 2.0

- The stability page in the present tense: React Flow 13.x, and the `require` line as D2 decides.
- The migration guide written against 13, with its defaults read from 13's source.
- The README's *Status*, the comparison table and the size figures, updated.
- `llms.txt` updated.
- The `/v1/` docs (D5).

### 7. Release

- `2.0.0-rc.1` goes to the `next` dist-tag through `release.yml`, tagged from `release/2.0`. A second candidate
  only if the proof finds something.
- The `v1` branch is cut from the last 1.x tag before the release PR merges.
- Then `2.0.0` goes to `latest`, tagged from `main` after the PR merges (CONTRIBUTING's *Releasing*). Tagging is
  the owner's.

## Risks

- **React Flow 13's `next` series changes more than next.0 shows.** That is likely: next.0 is the first. The watch
  job sees each change as it lands, and D1 is decided against 13.0.0 only.
- **React Flow 13 takes months.** Then 2.0 waits, and nothing here is urgent. D2 could ship alone as an earlier
  major, but two majors close together cost more trust than one later.
- **ESM-only breaks a toolchain someone uses.** That is why D2 is measured before it is decided. If Jest's CommonJS
  mode breaks and is common among React Flow users, the answer is A.
- **The benchmark lead shrinks against a compiled React Flow 13.** Then the README and GROWTH.md say so, as the
  *Reach for React Flow instead when…* section already does for other trade-offs.
- **Two stable lines, one maintainer.** D5 keeps 1.x support short and limited to fixes.
- **The core is at its budget now, before any of this.** D3's measurement is a 1.x task. Until it is done, the next
  change that touches the core either finds the bytes or raises the budget in the open.
