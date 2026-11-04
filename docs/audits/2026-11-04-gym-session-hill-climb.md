# Workout tracking page hill-climb, 2026-11-04

Scope: `/gym/session/[id]` **opened from a saved template** — the state with prefilled sets, a PREVIOUS column, and
empty tick circles. Rendered by `src/screens/gym/SessionScreen.tsx`.

Snapshot: `22e785e` (0.8.4) plus this session's edits; the emulator build is `expo prebuild` + `assembleRelease` on
the working tree.
Evidence: Tier A, live device, owner's imported Strong data — a session started from the "Leg + arms" template
(6 exercises, 57 sets). Captures in `.opencode/hill-climb/session*/`, both schemes.
Rounds: 3 · Outcome: **round limit, not certified**

## Scores

| Category | Structural R1 → R2 → R3 | Aesthetic R1 → R2 → R3 |
| --- | --- | --- |
| Typography & scale | 8.5 → 9.0 → 9.2 | 9.0 → 9.3 → 9.4 |
| Colour & contrast | 7.4 → 8.9 → 9.2 | 8.5 → 9.0 → 9.4 |
| Spacing & alignment | 9.1 → 8.8 → 9.3 | 8.5 → 9.2 → 9.3 |
| Iconography & hierarchy | 7.3 → 8.5 → 8.6 | 8.5 → 9.1 → 9.4 |
| Consistency & polish | 8.2 → 9.0 → 9.2 | 9.0 → 9.1 → 9.3 |

Round 3's 8.6 (structural, iconography) predates the last fix batch — the completed-tick fill and the exercise badge —
so the shipped state is unverified by a reviewer.

## What changed

**R1 → R2**
- **A false regression on every workout.** The exercise header compared *completed* volume against the *whole of last
  time* (450 kg vs 2,300 kg after set one) and painted it red as `-80%`. It now appears only once every set of that
  exercise is ticked; when the numbers match, nothing shows.
- **The tick ring was 1.4:1** (1.2:1 dark) — the control pressed 57 times a workout was the faintest mark on screen,
  next to a ticked state at 18:1. Ring is `muted-foreground`, 36 dp, matching the value cells.
- `ADD SET`, `RECORD` and `COMPLETE` were `text-strain` at **3.30:1**; now `strain-text` (4.77:1). The positive delta
  had been darker than the negative one for the same reason.
- Copy glyph 11 → 13 px; exercise name 15 → 17 px so it outranks the numerals it introduces; caption row no longer
  reserves 32 dp of dead height; FINISH no longer touches the kebab; menu icons stopped contradicting their labels
  (rename had a dumbbell, add-exercise had a clock).

**R2 → R3**
- **"Add exercise" had no surface in light** — `secondary` on the page ground is 1.07:1 with no border. Now card
  ground with a `border-border` edge, so it reads the same in both schemes.
- **Completed work looked softer than pending work** — set numbers brightened while their own weight/reps faded to
  history grey. Values keep full contrast now; state lives in the tick.
- **The live clock jittered** — proportional figures in an 11 px caption, reflowing every second. `tabular-nums`.
- Column labels moved off a private 10 px/0.06 em recipe onto the kit's 11 px/0.1 em rank; the SEC cell now occupies
  the 54 pt REPS slot instead of 62 pt, so the numeric column stops jumping between cards.

**Final (unscored)**
- The completed tick no longer borrows the primary ink: `bg-secondary` + a `strain-text` check, so four finished sets
  stop out-shouting FINISH and the pending ring stays the live affordance.
- The unreadable 14 px balance-scale smudge after each exercise name is the dumbbell the exercise list already uses.

## Still open

- **`0 SETS` is completed-only.** The header's one progress figure says "0 SETS" over a page of 57 prefilled rows, and
  never says how far in you are. A `4 / 13` reading needs a copy decision.
- **Prefill vs PREVIOUS disagree by design** — weight comes from last time, reps from the template (15 vs 12 on Hack
  Squat). Nothing marks which is authoritative; the copy affordance would silently overwrite the live value.
- **The header fade cuts a line of text in half** at the scroll boundary (`HEADER_FADE = 24` in the kit); a full line
  box needs ~32–36.
- **No mark for the next unticked set** — with 57 imported sets the eye starts in a field of identical rows.
- **The PREVIOUS column leaves ~72 dp of void** before the weight cell; the copy glyph floats at the far side of it.

## Evidence

`.opencode/hill-climb/session/`, `session2/`, `session3/`, `session-final/` — never committed.

## Owner changes after the loop

Requested directly, and shipped on top of the scored state:

- **"Last done …" removed** from every exercise card.
- **The per-row copy affordance removed** — the PREVIOUS column is now read-only history.
- **Prefill comes from last time** — weight *and* reps (`src/actions/gym.ts`, `startSession`). It used to take the
  weight from last time but the reps from the template, so a row read `70 kg × 12` above fields holding `70 / 15`
  with nothing saying which won.
- **An exercise-level tick** in the column-header row: one tap ticks every set of that exercise, another unticks
  them. It uses the same write path as a row tick, so an empty set still refuses; it shows a check when all sets are
  done, a dash when some are, and an empty ring when none are.

The new label is `session.allSets`; the gym area is still English-only (its 8 other locales fall back), which is the
open G79 issue, not something this loop introduced.
