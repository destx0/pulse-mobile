# Gym tab hill-climb, 2026-11-04

Snapshot: `22e785e` (0.8.4) plus this session's gym edits; the emulator build carries `versionName` 0.8.4 from
`expo prebuild` + `assembleRelease` on the working tree.
Evidence: Tier A, live device (`pulse_pixel`, Android) with the owner's own import — 509 workouts, 14,055 sets,
9 templates, 75 records — captured dark and light, top and bottom, in `.opencode/hill-climb/{r2,r3,r4,final}/`.
Rounds: 4 · Outcome: **round limit, not certified**

Every reviewer opened the captures it was given (r2–r4); round 1 was source-only because the screenshots sat in
`/tmp`, which subagents cannot read. That round's scores are therefore not comparable and are kept only to show the
correction.

## Scores

| Category | Structural R1 → R2 → R3 → R4 | Aesthetic R1 → R2 → R3 → R4 |
| --- | --- | --- |
| Typography & scale | 7.5 → 6.5 → 9.0 → 8.8 | 8.0 → 9.0 → 9.0 → 9.0 |
| Colour & contrast | 7.0 → 6.0 → 8.9 → 8.9 | 8.5 → 8.5 → 9.5 → 9.2 |
| Spacing & alignment | 7.0 → 7.0 → 8.8 → 9.0 | 8.0 → 8.5 → 9.5 → 9.3 |
| Iconography & hierarchy | 6.5 → 6.0 → 8.7 → 8.8 | 8.0 → 8.0 → 9.5 → 9.1 |
| Consistency & polish | 6.5 → 6.5 → 8.9 → 8.9 | 8.0 → 9.0 → 9.5 → 9.3 |

R2 scored lower than the blind R1 because the first pixel round found things source reading cannot see: pure-black
row dividers, a search field that vanishes into the light ground, an unlabelled 1RM. A blind baseline is not a
baseline.

## What changed

**R1 → R2 — affordances and structure**
- Template cards gained a play plate: the card starts a workout but its only visible mark was a kebab menu.
- "New template" and both "See all" links became one `HeaderAction` recipe (12 px bold caps, 14 px glyph, 44 dp
  target, press feedback) instead of two type ranks and two icon sizes.
- The search entry point reads as the app's field (`bg-field`, `h-13`, button role, press state) rather than a
  44 dp lookalike.

**R2 → R3 — a rendering bug and the icon system**
- `border-border/60` painted **pure black** in both schemes: `--border` already carries alpha, so the modifier
  produced an invalid colour and React Native fell back to black. Fixed in all 8 gym screens (10 places); verified by
  pixel sample (now `rgb(231,231,231)` light, `rgb(60,63,66)` dark).
- Hand-drawn overflow dots replaced with the kit's `MoreHorizontal` at 18 px.
- Play plate enlarged (32 dp / 15 px, ringed), trophy toned apart from the chevron.

**R3 → R4 — alignment and numeric consistency**
- One 1RM precision across the Records column (`91.0`, `63.3`) instead of `91` beside `63.3`.
- Record dividers moved to a wrapper so the rounded row cannot clip them; row inset dropped so dividers and text
  share an edge.
- Template summary and Recent exercise text share one grey (`foreground-secondary`); week tiles use 12 dp gutters.
- Final pass: tile values dropped from a one-off 19 px rank to 17; the summary is built at item granularity so the
  clamp can no longer leave an orphan "5…"; the start plate is one size (36/16) on both the card and the resume
  strip; the card header row no longer reserves dead height for the menu target.

## Still open

- **Block order.** Search → CTA → nine full-width templates → Recent → Week → Records puts the only at-a-glance
  numbers about three screens down on a 509-workout account. Both reviewers called it the biggest hierarchy problem;
  it is a spec-level order change (the screen is a port), so it is not this loop's to make.
- **Light-mode surface step.** `field` sits at 1.04:1 and `secondary` at 1.11:1 against the light ground, against
  1.4–1.7:1 in dark, so light mode is structurally flatter. Fix belongs in the palette, not the screen.
- **Template card body.** Nine cards of comma-separated exercises is ~1,500 dp before Recent; the compact form
  ("13 exercises · 57 sets") needs a query hint the engine does not expose yet.
- **Records repetition.** A trophy and a per-row "1RM" label on every row add twelve repeated elements for four
  values. Removing either is a visual-direction call.
- **`StatTile` vs the kit.** It duplicates `KeyStatRow variant="tile"`; folding it in would settle the tile surface
  hierarchy in both schemes.

## Evidence

`.opencode/hill-climb/r2/`, `r3/`, `r4/`, `final/` — four shots each (light top/bottom, dark top/bottom), 1080×1920,
never committed.
