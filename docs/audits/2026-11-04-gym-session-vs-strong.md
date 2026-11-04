# Session screen vs Strong, 2026-11-04

The owner set a competitive bar: Pulse's workout screen must be **better than Strong's** and feel **very clean**.
Two reviewers scored both products on the same five categories, from Strong's own screenshot
(`.opencode/hill-climb/strong/strong-session.png`) and four captures of Pulse
(`.opencode/hill-climb/vs*`, `final-vs/`).

Snapshot: `22e785e` (0.8.4) plus this session's edits.
Rounds: 3 · Outcome: **Pulse ahead in 9 of 10 category-scores, strongest on structure, not yet 9.5 across the board**

## Head-to-head (round 3, final scored round)

| Category | Strong | Pulse — structural | Pulse — aesthetic |
| --- | --- | --- | --- |
| Typography & scale | 7.8–8.0 | **9.0** | **8.6** |
| Colour & contrast | 7.3–8.0 | **9.0** | **9.0** |
| Spacing & alignment | 7.8–8.5 | **9.0** | 8.4 |
| Iconography & hierarchy | 7.5–7.6 | **9.0** | **8.6** |
| Consistency & polish | 7.0–7.8 | **8.8** | **9.0** |
| **Mean** | **7.6** | **9.0** | **8.7** |

Strong's losses are structural, not cosmetic: its `PREVIOUS` column samples at 2.05:1 (the feature's core
reference is the dimmest text on its screen), exercise boundaries are carried by nothing but a gap and a blue
name, every row draws a ✓ in the unchecked state, and `+0%` prints a zero delta on every exercise.

## What Pulse changed to win

**Round 1 → 2**
- PREVIOUS right-aligned against the value cells (it left a 91 dp void, 189 dp on duration rows).
- Set numerals 15 → 17 px: Strong's data was louder than its own label; ours was quieter than its label.
- The tick-all became a 44 dp icon-only control — it had shared a 36 dp ring with the row ticks and its hit
  area overlapped set 1, so a thumb aiming at the first set could tick the whole exercise.
- Removed the decorative dumbbell beside the exercise name; `0 SETS` → `0 / 57 SETS` (a done-count wearing a
  total's label); ADD SET to a 44 dp target; the footer add became a card-surface control.

**Round 2 → 3**
- **FINISH stopped being a filled black pill.** The largest bright mass on a data screen was the action you take
  once, at the end. It is now a 44 dp caps action in the accent, matching ADD SET — and the filled primary
  belongs to the confirm dialog it opens.
- **One spine**: the value cells sit in a fixed 116 dp group, so PREVIOUS keeps one right edge whether a card
  shows KG+REPS or a single SEC. This was the one category Strong still won (it jumped 70 dp between cards).
- Units stopped repeating (`45 × 10` under a `KG` header); one tick glyph; the next-set wash deleted (fill
  behind fill); the card menu and header actions all 44 dp; ADD EXERCISE matched ADD SET's voice.

**Final (unscored)**
- Off-card blue moved to `strain-deep` in light (FINISH 4.44:1 and ADD EXERCISE 4.13:1 both failed AA on the
  page ground; 6.64:1 now), with `dark:text-strain-text` because `strain-deep` is 2.35:1 on the dark ground.
- One caps spec (12 px / 700 / 0.1 em) across FINISH, ADD SET, ADD EXERCISE and the rest skip; the header's
  tick-all cell is 36 dp so its glyph sits on the tick column.

## Still open

- **The header's three caps ranks** are within 1 px of each other (title 12, subtitle 11, FINISH 12), so the
  workout's own name has the rank of an action. Fixing it means a subtitle style in `DetailHeader` — shared
  with Recovery and Sleep.
- **`Check` means both "tick this set" and "tick every set".** The header control is discoverable but shares the
  row's glyph; moving it into the exercise menu would be cleaner and one tap slower.
- **The finished-session summary, rest bar, PR badge, superset chip and dialogs** were never captured, so none of
  them is scored against Strong.
