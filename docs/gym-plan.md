# Gym log: importing Strong, and an openGym-shaped feature

Status: built, 2026-11-02. The research below is what the build was based on; `docs/gym.md` has the screens and the
schema, and `docs/learning.md` the choices worth remembering.

## The references

| | |
|---|---|
| openGym | `~/cud/openGym`, v1.4.3, commit `b6cfe2bb` (2026-10-28) |
| Licence | AGPL-3.0, with an app-store exception |
| Shape | self-hosted Node API + Vite/React PWA + Capacitor shells for iOS and Android |
| Strong importer | `frontend/src/lib/import-csv.js` (1051 lines, one importer for Strong, Hevy, FitNotes, Gravl, GymMane and its own CSV) |
| Exercise catalogue | `catalogue/exercises/<id>.json`, 5,632 entries, ids that are never reused |
| The export | the owner's Strong CSV, 14,200 rows, kept outside the repo (personal data) |

openGym is not a React Native app and has no SQLite: it keeps one JSON state per profile and syncs
it through its own API. Its UI, storage and sync do not port. Its **CSV importer, exercise
catalogue and workout data model** are the useful parts.

## Is openGym compatible with Strong?

Yes, first-class. The README lists Strong among the apps it imports without editing, and there is a
dedicated test file (`import-csv.strong.test.js`) written against a real export.

How it reads a Strong file:

- One row per **set**. Rows are grouped into a workout by `Date` (the session start, written on every
  row) plus `Workout Name`, so a morning and an evening session on one day stay two workouts.
- The delimiter is decided from the header: Strong's current export is `;`-separated, older ones are
  `,`. Both work.
- `Duration (sec)` (older files: `Duration`, e.g. `1h 5m`) is the **whole workout's length**, written
  on every row. `Seconds` is the set's own time. Getting these two the wrong way round was a real bug
  they fixed; it turned every weightless row into an hour of cardio.
- `Weight (kg)` / `Weight (lbs)` is taken per row with its unit; a file with no unit column is read in
  the unit the user picks at import time.
- `RPE` rides on weighted rep sets. `Distance (meters)` becomes km and a speed.
- Exercise names are matched against the 5,632-entry catalogue by a sorted bag of words with a
  synonym table (`bb` → barbell, `machine` → lever, `smith machine` → smith), then a curated alias
  table, then a near-miss pass. Anything left becomes one of the user's own custom exercises, so no
  row is dropped.
- Days that already have a workout are skipped, so importing twice does not duplicate.

## What the owner's export holds

14,200 set rows, 509 workouts, 90 distinct exercise names, 2021-08-30 to 2026-11-02.

| | |
|---|---|
| Workouts per year | 2021: 32, 2022: 91, 2023: 68, 2024: 65, 2025: 138, 2026: 115 |
| Sets per workout | 1 to 67, mean 27.9 |
| Exercises per workout | mean 7.2, max 14 |
| Distinct workout names | 9 (`Push`, `Pull`, `Leg + arms`, `Chest`, `Back`, `Leg`, `Cardio`, `Evening Workout`, `Afternoon Workout`) |
| Total volume | ~4,353 t |
| Workout length | median 49.5 min; 14 workouts over 3 h, 4 over 6 h (the timer left running, up to 47 h) |
| `RPE` | empty in every row |
| `Distance (meters)` | 18 rows only: 2 rowing, 16 treadmill. The rowing distances (24 km, 32 km) are machine counters, not distance |
| `Seconds` | 965 rows, 931 of them the same exercise: `hang` |
| `Notes` | 125 rows, and **all of them sit on a note-only row** (`Set Order` is the word `Note`) |
| `Workout Notes` | 1 workout |
| Empty rows | 126 (`Set Order` `Note` or `Rest Timer`, no weight, reps, time or distance) |
| Duplicate `Set Order` | 6 rows in 2 workouts (an exercise listed twice, e.g. incline press at 20 kg then 15 kg) |

## What openGym does with it (measured, its own importer)

| | |
|---|---|
| Workouts | 509 |
| Exercises (entries) | 3,649 |
| Sets | 14,069 of 14,200 |
| Rows skipped | 131: the 126 note/rest rows and 2 rows with 444 reps |
| Names matched to its catalogue | 53 of 89 |
| Sets on a catalogue exercise | 7,926 (56%) |
| Names that became custom exercises | 36 |
| Sets on a custom exercise | 6,147 (43%) |

Three things it gets wrong on this file:

1. **`hang` becomes cardio.** 931 sets (6.6% of the file, the second most common "exercise") are
   dead hangs with only `Seconds`. Its rule is "seconds with nothing else is a hold only if the name
   says what it is"; `hang` says nothing, so all 931 land as `{ min: 0.4 }` cardio at zero speed
   instead of timed holds.
2. **The 125 notes are lost.** They sit on rows with no weight, reps, time or distance, and the
   importer skips such a row before reading its note. Every note in this file is on one of those
   rows, so none survives.
3. **The 47-hour workout is kept as 47 hours.** `Duration (sec)` is used as it is; there is no
   sanity cap, so a forgotten timer becomes a 2,831-minute session.

Two smaller ones: a body part is guessed for every custom exercise and is often wrong
(`butterfly` → upper legs, `rowing cable` → upper legs, `rear delt fly cable` → chest), and the
duplicate `Set Order` rows are kept as separate sets, which is the right call.

## The 36 names it could not match

Twelve are ordinary Strong names its catalogue spells only with qualifiers, so the word-bag match
ties and gives up (2,602 sets):

| name | sets | the catalogue has |
|---|---|---|
| Lat Pulldown (Cable) | 652 | only qualified variants |
| Face Pull (Cable) | 564 | a band face pull |
| Triceps Pushdown (Cable - Straight Bar) | 470 | no straight-bar entry |
| Triceps Dip (Assisted) | 299 | no assisted entry |
| Hack Squat | 245 | machine and Smith variants |
| Chest Fly | 206 | dumbbell and machine variants |
| Triceps Extension | 103 | qualified variants |
| Running (Treadmill) | 20 | a generic treadmill entry under another name |
| Squat (Bodyweight) | 16 | no bodyweight entry |
| Triceps Extension (Dumbbell) | 12 | qualified variants |
| Plank | 11 | 115 plank variants, none plain |
| Skullcrusher (Barbell) | 4 | `ez barbell` only |

Twenty-four are the owner's own shorthand (3,545 sets) and need a human to say what they mean:

| name | sets | likely meaning |
|---|---|---|
| hang | 931 | Dead Hang (timed hold) |
| shoulder press dumpbell | 648 | Shoulder Press (Dumbbell) |
| rowing cable | 644 | Seated Cable Row |
| trap dumbbell | 380 | Shrug (Dumbbell) |
| rear delt fly cable | 378 | Rear Delt Fly (Cable) |
| butterfly | 157 | Pec Deck / Chest Fly (Machine) |
| trap smith machine | 73 | Shrug (Smith Machine) |
| triceps extension v | 70 | Triceps Pushdown (V-bar) |
| lat pulldown ground | 64 | Lat Pulldown, kneeling |
| forearm curl | 45 | Wrist Curl |
| forearm curl reverse | 32 | Reverse Wrist Curl |
| shoulder press barbell | 28 | Shoulder Press (Barbell) |
| triceps kickback | 19 | Triceps Kickback (Dumbbell) |
| latai | 16 | ? (a lat movement) |
| row wide grip | 12 | Row, wide grip |
| bench press real rod | 11 | Bench Press (Barbell) |
| lounge walk | 9 | Walking Lunge |
| triceps rope extension | 6 | Triceps Pushdown (Rope) |
| lat pulldown back | 6 | ? |
| rowing cable seat | 6 | Seated Cable Row |
| seam raise | 3 | ? |
| neck curl | 3 | Neck Curl |
| single arm cable cross | 3 | Single Arm Cable Crossover |
| bench press proper barbell | 3 | Bench Press (Barbell) |
| forearm rotation clock | 2 | ? |
| rear delt raise | 2 | Rear Delt Raise |

The four question marks are worth a minute with the owner: `latai`, `lat pulldown back`, `seam raise`,
`forearm rotation clock`.

## What this means for Pulse

- **The format is not the problem.** Strong's export is one row per set with a date, a name and a
  measure; a Pulse importer can read all 14,200 rows and lose nothing if it keeps note rows.
- **The catalogue is the problem.** Pulse has no exercise library today: `Exercise` in
  `src/data/types.ts` is a Health Connect cardio session, not a strength set. A gym log needs its own
  table for sessions, entries and sets, plus an exercise identity. openGym's 5,632-entry catalogue is
  the shape to copy (id, name, body part, equipment, target, secondary muscles, `hold`), but its
  **media is licensed to openGym only** and its 1,324 original entries are ExerciseDB text under MIT.
  Names and muscle groupings we can write ourselves; the pictures and clips we cannot take.
- **Licence.** openGym is AGPL-3.0; Pulse Mobile is PolyForm Noncommercial 1.0.0. Copying openGym
  code into this repo would relicense the whole app under the AGPL, which is incompatible with
  PolyForm Noncommercial. Read it as a reference, write the code here. The CSV format, the column
  names and the exercise names are facts, not code.
- **Units.** Pulse already has `DisplayPrefs` in `src/lib/units.ts`; the file is in kg, so the import
  needs no conversion, but the store should keep kg like `Metrics.weightKg` does.
- **Health Connect already has cardio.** The imported strength sessions and the Health Connect
  exercise sessions will describe the same treadmill runs; the gym log should not double count them
  in strain, or should say which one it reads.

## Open questions for the owner

1. What should the four unknown names mean, and is the "likely meaning" column right?
2. Should the 9 workout names become routines/plans, or is the history just a log?
3. Are dead hangs worth keeping as a timed hold, or are they noise?
4. Should the 4 workouts with a broken timer be capped (6 h) or dropped?
5. Does the gym log feed strain and recovery, or stay a separate screen that only shows volume and PRs?
