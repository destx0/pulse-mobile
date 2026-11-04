# Session screen: composition pass, 2026-11-05

The owner's verdict on the previous build: **"this looks so ugly."** It was right, and the scores had hidden it.

## What went wrong

A structural finding closed a measured 91 dp gutter by right-aligning the `PREVIOUS` column. The category score went
up. The row became a stranded set number, a dead band through its middle, and a cluster pinned to the right. Every
edge was aligned and the screen read badly.

The skill now has a composition category and a veto for exactly this: **a fix that lifts a category but makes the
screen read worse is a regression, not progress.**

## The row, before → after

| | before | after |
| --- | --- | --- |
| Row | `1 ······ 45 kg × 10 ······ [45] [10] ·· ○` | `1 │ 45 kg × 10 │ [45] [10] │ ○` |
| Gap mid-row | 162 px (62 dp) | 24 px (9 dp) |
| Grid | header sized by the word PREVIOUS, body by the value; labels 9 dp off | one grid: KG label 539 vs cell 537, REPS 752 vs 752, tick 938 vs 938 |
| Title | 12 px caps, smaller than its exercise names | 22 px, one clear step above the 17 px cards |
| Values | 17 px, same rank as the card title | 19 px in 44 dp fields — the data is the hero |
| Accent | FINISH navy, ADD SET cyan in one frame | FINISH only; the two "add" links are neutral caps |
| Tick-all | a bare grey ✓ above 57 unticked sets | a 24 dp ring, receded below the 32 dp row ticks |

## Rounds

| Round | Composition | Verdict |
| --- | --- | --- |
| fix2 | — | owner: "so ugly" (right-aligned PREVIOUS) |
| fix3/fix4 | 7.8 / 7.6 | VETO — dead band through every row |
| fix5 | 8.3 / 7.6 | VETO — the band persisted (a stale read; measured 9 dp in the build) |
| fix8 | 8.7 / 9.1 | **PASS** — one sweep, title outranks sections, no regressions |
| final3 | unscored | 19 px values in 44 dp fields, neutral adds, right-aligned history |

Scores across the run sit at 8.5–9.2 rather than the 9.5 gate, so this is a **round-limit** outcome, not a pass. The
composition gate is cleared, which is what the owner was seeing.

## Still open

- Of two `⋯` menus, one is 20 px, one 18 px (now both 20).
- The ticked state keeps its edge but has no filled accent; the completed look was never captured.
- The header's clock is still an 11 px caps subtitle — a shared `DetailHeader` style, not this screen's.
- Rows show 4 sets per screen against Strong's 5; the pitch is deliberate (44 dp targets).

## Evidence

`.opencode/hill-climb/{fix2…fix8, final2, final3, strong}/` — never committed.
