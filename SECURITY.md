# Security policy

## Supported versions

Flowinger is `0.x`. Fixes land on the latest minor version only; upgrade to receive them.

| Version | Supported |
|---|---|
| latest `0.x` release | yes |
| anything older | no |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting: on the repository, *Security → Report a vulnerability*. That reaches the
maintainer alone, and keeps the report, the discussion and the fix private until a release is ready.

Include what you can of: the affected version, a minimal reproduction (a few lines of JSX is ideal), and what
an attacker gains. A report you are not sure is a vulnerability is still welcome.

You can expect an acknowledgement within a week, and a fix or a clear answer on whether it will be fixed
within a month. This is a volunteer-run project, so those are goals rather than guarantees. Reporters are
credited in the advisory unless they prefer otherwise.

## What counts

Flowinger runs in the browser (and renders on the server), makes no network requests and has no runtime
dependencies. The realistic problems are:

- Markup or script injection through something a consumer reasonably passes in — `label`, `data` fields the
  default node draws, `ariaLabel`, `domAttributes`, a `dragHandle` selector;
- A way to make the canvas execute or evaluate attacker-controlled strings;
- Prototype pollution, or unbounded work (a pathological graph or selector that hangs the page);
- Anything in the *published package or its release pipeline* that does not match this repository.

Not in scope: a consumer rendering untrusted HTML inside a node they wrote themselves, or a malicious
`nodeTypes` component — those run with the page's own authority already.

## Verifying a release

Releases are published from GitHub Actions with no stored token, and carry a provenance attestation.
`npm audit signatures` checks both the registry signature and that attestation, which names the workflow
run and the commit the tarball was built from.
