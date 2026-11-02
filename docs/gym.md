# The gym log

A strength log inside Pulse Mobile: Strong's layout, Pulse's colours and type, the owner's history imported from
Strong's CSV. It is its own data: nothing here writes to Health Connect and nothing in the scoring pipeline reads it, so
Recovery, Strain and Training Load are exactly what they were.

## Screens

| Route | What it is |
|---|---|
| `/gym` (tab) | The templates page: a workout in progress, "My Templates" in a two-column grid, the last sessions, the week's totals, recent records |
| `/gym/session/[id]` | The tracking page, and the same page read back after a workout ends. Every edit is saved as it happens |
| `/gym/history` | Every finished workout, grouped by month |
| `/gym/exercise/[id]` | One lift: its estimated 1RM, the 1RM curve, and every session it was trained in |
| `/gym/exercises` | The picker: search, the lifts trained recently, and the owner's own exercises |
| `/gym/routine/[id]` | The template editor; `new` starts a blank one |
| `/gym/records` | The best estimated 1RM of every exercise, newest first |
| `/gym/measurements` | Weight, body fat and tape measurements, with the weight's line |
| `/gym/tools` | A set's 1RM with its percentage table, and plate maths |
| `/gym/import` | Read a Strong export, see what it holds, write it |

The tab replaced Journal, which is still a route: More › Journal, or the round check-in action.

## The tracking page

Strong's page, kept: one card per exercise, a row per set with the last time's numbers beside the weight and reps, a
tick at the end of the row, `ADD SET` under it, and the workout's timer under its name. What differs:

- **Every write is immediate.** The session row exists before the first set; a tick, an edit or a note is its own small
  write. Kill the app, reboot the phone, open it a day later: the workout and its sets are there, and the Gym tab offers
  Resume. The rest timer is stored as a start instant and a length, so it comes back at the right point in the countdown.
- **Set types.** Tap the set number to make it a working, warmup, drop or failure set, or to write a note. Warmups are
  left out of volume, PRs and the +% change.
- **Supersets.** The exercise menu ties an exercise to the next one. Both wear a Superset badge, and a tick in the group
  starts no rest until the other exercise has nothing left to tick.
- **Units per exercise.** The menu switches one exercise between kg and lb (as Strong does). Weight is stored in
  kilograms; the unit is only how it is typed and shown.
- **The previous column** is the last session before this one that trained the exercise, by set number.
- **The +% badge** is today's volume against that same session's. Strong's "+0%", computed from the sets, not a stored
  number.

## Data

Six tables in the one SQLite file (`src/data/db.ts`), all behind the `Store` interface:

```
gym_exercises        id, name, body part, equipment, custom, hold, unit, note
gym_routines         id, name, notes, position, updated_at
gym_routine_items    routine_id, exercise_id, position, sets, reps, rest_sec, note
gym_sessions         id, day, start_ts, end_ts, name, notes, routine_id, finished, rest_started_ts, rest_sec
gym_sets             id, session_id, exercise_id, position, set_no, weight_kg, reps, seconds, distance_m,
                     rpe, type, superset_id, completed, ts, note
gym_measurements     id, day, kind, value
gym_import           id, data (the last import's counts and dates)
```

A session's exercises are its sets' `position` (0-based, first trained = 0), so there is no join table for "the
exercises of a session" and a session with no sets has no exercises. `set_no` is what the left column shows; deleting a
set renumbers the rest of that exercise.

## The numbers

- **Volume** is weight × reps over completed sets that are not warmups. Holds and cardio add nothing.
- **Estimated 1RM** is Epley, `w·(1 + r/30)`, or Brzycki `w·36/(37 − r)` when it is higher, up to ten reps; Epley alone
  past that. A single is its own weight. Zero for bodyweight, holds and cardio.
- **A record** is a set whose estimate beats every earlier one on that exercise. Ties are not records.
- **Plates** are greedy from the heaviest plate. What no plate can make is shown as a remainder, never rounded away.
  A missing plate and a target lighter than the bar are said out loud.

## The Strong import

`src/core/gym/csv.ts` reads the file; `src/actions/gym.ts` writes it. What it does with a real export (14,200 rows,
509 workouts, 2021 to 2026):

- Sessions are grouped by start instant and name, so two sessions in a day stay two.
- `Duration (sec)` is the workout's length, capped at six hours (four workouts had a timer left running); the shortest is
  a minute. `Notes` rows and `Rest Timer` rows are not sets: their text is kept on the exercise above them (125 notes in
  the real file), which a naive reader drops.
- `Seconds` with no weight and no reps is a timed hold; with a distance it is cardio.
- Names resolve against the bundled catalogue and an alias table (`rowing cable` → Seated Cable Row, `hang` → Dead Hang,
  `trap dumbbell` → Shrug (Dumbbell), and so on). A name neither knows becomes the owner's own exercise, so a row is
  never dropped. In the real export that leaves six names (`latai`, `seam raise`, `lat pulldown back`,
  `forearm rotation clock`, `lat pulldown ground`, `row wide grip`).
- A session already in the log with the same start instant is skipped, so importing the same file twice adds nothing.
- After the workouts, one template is made per workout name the file used (Push, Pull, Leg + arms, Chest, Back, Leg,
  Cardio), from the most recent session with that name: its exercises, their set counts and their most common reps.

## Limits

- The gym does not feed Strain, Training Load or Recovery. That was a deliberate choice for this build.
- The rest timer is in-app only: no notification when the phone is in another app or asleep. The countdown is still
  correct when you come back.
- A superset keeps each exercise's sets together rather than interleaving A1, B1, A2, B2 as Strong's tracking page does.
- No plate inventory per gym: the calculator uses the common kg and lb sets.

## Tests

`src/core/gym/gym.test.ts` (the maths, the previous column, records, the CSV reader) and
`src/actions/gym.test.ts` (starting from a template, ticking, renumbering, finishing, the import and the view models)
run on the in-memory store.
