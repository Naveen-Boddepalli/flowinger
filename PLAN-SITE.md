# Plan: an interactive, catchier site

Branch: `feat/interactive-site`. Scope: the documentation site in `site/` (Astro 7 + Starlight 0.42), mostly its
landing page (`site/src/content/docs/index.mdx`). The library (`src/`) and the demo (`demo/`, which the Playwright
suite drives) are not touched.

## Where it is now

The landing page is Starlight's stock `splash` template: a static logo as the hero image, install tabs, one live
editor (`LiveEditor.tsx`), a uniform grid of six cards, a comparison table and four link cards. It is clear and
fast, but it looks like every other Starlight site, and the one thing that sets Flowinger apart, that it draws
live, draggable graphs, does not show until the second screen.

## The idea: the site is made of the product

Flowinger draws node graphs, so the page should be one. Every moving part below is either Flowinger itself (the
hero, the playground, the connectors between sections) or plain CSS. The site makes the library's pitch by
example: no animation library, no WebGL, no extra dependency, the same "small and only what you use" rule the
package keeps.

## Guardrails (they hold for every phase)

- **No new runtime dependencies.** No GSAP, Framer Motion, Lottie or three.js. Native CSS (transitions,
  `@keyframes`, scroll-driven animations, `@view-transition`), `IntersectionObserver`, and Flowinger.
- **A JavaScript budget.** The landing page ships at most 15 kB gzipped more than it does today, measured from
  `astro build` output before and after each phase.
- **`prefers-reduced-motion: reduce` turns motion off**, not down: no parallax, no drawing-in, no flowing dashes,
  no counting up. Every section reads complete with motion off.
- **Server-rendered first paint, no layout shift.** The hero graph and the playground render on the server (as
  `LiveEditor` does now), and animations start from the final layout, so CLS stays 0.
- **Both themes.** Every colour comes from Starlight's variables (`--sl-color-*`), so the light/dark switch keeps
  working, as `.flowinger-live` already does.
- **Phones.** A canvas in the page flow must not trap the finger: decorative canvases do not pan or zoom on
  touch, and the page still scrolls over them. Nothing scrolls sideways at 360 px.
- **Accessibility.** Decorative graphs are `aria-hidden`; anything interactive is reachable by keyboard with a
  visible focus ring. Lighthouse accessibility and performance scores do not drop.
- **The docs pages stay calm.** Reading pages get only the page transitions and small hover polish (phase 1);
  the bigger effects live on the landing page.

## Phase 1: foundations and smooth transitions

Small, site-wide, and nearly free; it sets up what the later phases use.

1. **Page transitions.** Cross-document view transitions with CSS alone:
   `@view-transition { navigation: auto; }`, with the header and sidebar given `view-transition-name`s so they
   stay put while the content cross-fades and slides a few pixels. No JavaScript and no router; browsers without
   support navigate as they do now.
2. **Motion tokens** in `site.css`: `--fl-ease-out`, `--fl-ease-spring` (a `linear()` spring), `--fl-dur-1/2/3`,
   all set to `0s` under reduced motion, so later CSS uses tokens and never hard-codes durations.
3. **Micro-interactions.** Buttons lift and glow on hover, links get an animated underline, the header gains a
   translucent blur once the page scrolls (a scroll-driven animation on `:root`, no scroll listener), and code
   blocks' copy button gives a short "copied" tick.
4. **A section reveal utility.** `.fl-reveal` fades and rises sections as they enter the viewport, using
   `animation-timeline: view()` where supported and an `IntersectionObserver` fallback of about twenty lines
   elsewhere.

## Phase 2: a live hero and a dynamic background

The first screen, where it matters most.

1. **A custom hero** (`site/src/components/Hero.astro`, wired through Starlight's `Hero` component override) laid
   out as a split: headline, tagline and actions on the left, a live Flowinger graph on the right in place of the
   static logo.
2. **The hero graph** (`HeroGraph.tsx`): about eight nodes that spell out what Flowinger does (`Your data` →
   `nodes` / `edges` → `<FlowingerCanvas>` → `pan · zoom · drag · connect`). On load the edges draw in
   (`stroke-dashoffset`) one after another and the nodes pop in with a spring; then the edges carry slow flowing
   dashes. Nodes can be dragged on desktop; the canvas does not pan, zoom or catch touch, so it is a toy, not a
   scroll trap. A small "drag me" hint fades out after the first drag.
3. **The dynamic background** behind the hero: Flowinger's own dot grid, a soft accent-coloured glow that trails
   the pointer (one CSS variable set from `pointermove`, throttled to animation frames), and a slow drift of the
   grid for depth. It pauses when the hero leaves the viewport or the tab is hidden, and is still under reduced
   motion.
4. **Headline polish**: a gradient sweep across "node-graph" in the headline and a one-line rotating subtitle of
   real numbers ("20.9 kB core", "0 dependencies", "10,000 nodes in 0.8 s") that cross-fades.

## Phase 3: layout changes that tell the story

1. **A bento grid for "Why Flowinger".** The six equal cards become a grid of mixed sizes: "Small" and "Fast at
   10,000 nodes" large, with their own small visual; the rest compact. Cards get a spotlight border (a radial
   gradient that follows the pointer) and lift on hover.
2. **Sections joined by edges.** Thin SVG connectors in Flowinger's edge style run down the page between section
   headings and draw in as you scroll (scroll-driven), so the page reads as one flow from "Install" to "Next".
   Decorative and hidden from assistive tech.
3. **Numbers that move.** The size and speed claims become small visuals that animate once when they come into
   view: a bar comparing the 20.2 kB diagram chunk to React Flow's 59.1 kB, and a "mount 10,000 nodes" race
   (0.8 s against 1.45 s) whose bars fill in real proportion. The numbers stay in the HTML as text, so they read
   without the animation.
4. **The comparison table** gains row hover highlighting, a stronger Flowinger column, and the "Ecosystem" row
   (React Flow's win) kept honest and as visible as the rest.
5. **The examples as a gallery.** The "Next" section gets an examples strip from the screenshots already in
   `site/public/assets/` (layouts, editor, swimlanes, presence, stepper, tree, export, save-load), each card
   zooming gently on hover and linking to its example.

## Phase 4: a playground in place of "Try it"

The live editor becomes the page's centrepiece.

1. **Presets.** A segmented control switches the canvas between a few diagrams (the current query plan, an org
   chart, a state machine, a CI pipeline). Switching animates: nodes that exist in both glide to their new
   positions, new ones fade in, gone ones fade out (positions interpolated over about 400 ms with
   `requestAnimationFrame`, then committed to state).
2. **"Re-layout"** shuffles the current diagram between a vertical and a horizontal layout with the same glide,
   which shows off smooth node movement.
3. **Toggles** for animated edges, the minimap and snap-to-grid, each a one-line prop, with the line of code it
   corresponds to shown beside the toggle, so the playground teaches the API.
4. **A code peek.** A collapsible panel shows the JSX for the preset on screen, kept in sync as you switch.

## Order and size

| Phase | What lands | Rough size |
| --- | --- | --- |
| 1 | Transitions, motion tokens, micro-interactions, reveals | Small: CSS, one tiny script |
| 2 | Live hero, dynamic background, headline | Medium: the main visual change |
| 3 | Bento grid, section connectors, animated numbers, table, gallery | Medium |
| 4 | Playground with presets, re-layout, toggles, code peek | Medium to large |

Each phase is a commit (or a few) on `feat/interactive-site` and works on its own, so the branch can stop after any
phase and still ship. The branch merges to `main` by pull request once phases 1 and 2 are in, since together they
change the look of every page.

## How each phase is checked

- `pnpm site:build` passes, and the landing page's added JavaScript is measured against the budget.
- The site served with `astro preview` (the `flowinger-site` launch configuration), checked in the browser:
  screenshots in light and dark, at desktop and at 375 px, with reduced motion emulated, and the console clean.
- Keyboard pass over everything interactive; the hero and connectors absent from the accessibility tree.
- Lighthouse on the landing page before and after: performance and accessibility do not drop, CLS stays 0.
- `pnpm test` and `pnpm e2e` still pass (they should, since `src/` and `demo/` are untouched).

## Status

All four phases are in, one commit each. Where the work differed from the plan:

- **Phase 2.** The hero graph hydrates at idle (`client:idle`), so React and Flowinger now load soon after the
  page does instead of when "Try it" scrolls into view. Its entrance is CSS and needs neither.
- **Phase 3.** The thumbnails live in `site/public/thumbs/`, because `scripts/sync-docs.mjs` empties
  `site/public/assets/` on every build. The section rail is CSS only, and shows from 76rem wide.
- **Phase 4.** The presets are a query plan, an org chart and a CI pipeline (no state machine: the layout is
  for DAGs). The playground replaces `LiveEditor.tsx`, which nothing else used.
- **Size.** The landing page ships about 5.5 kB gzipped more JavaScript than before the branch, against a
  budget of 15.

## Open questions

- **The demo page** (`/demo/`, `demo/App.tsx`) is outside this plan because the browser suite drives it. Give it a
  light visual refresh later, or leave it as the plain test bed it is?
- **Brand colour.** The plan keeps Starlight's current accent. Is this the moment to pick a Flowinger accent
  (the logo's blue and violet) and set it in Starlight's theme variables?
