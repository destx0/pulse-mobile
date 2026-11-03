# Gym UX review

A living review of the gym tracker (`/gym` and everything under it): what feels wrong in use, ranked, with the
evidence and a direction. It is a review, not a plan of record; nothing here has been implemented by this review.

- **First pass:** 2026-11-02, ~20:30 IST. **Second pass:** 21:10 IST (live-tree re-check, 2-year performance seed,
  contrast/large-text pass).
- **Snapshot:** `1e2d673` (0.8.1) plus the uncommitted gym work present at 20:29. The working tree was still being
  edited while this was written, so line numbers move; the symbols and file paths are the stable reference. The second
  pass re-read the live files at 21:10; ~30 findings were already fixed by the parallel editor.
- **Method:** read every gym screen, action, query and the i18n copy; dogfooded the real action/query layer on
  `MemoryStore` with throwaway probes (started from templates, ticked sets, supersets, finished, imported, bodyweight,
  past-date data); ran typecheck and the gym tests. **No device pass yet:** the `pulse_pixel` emulator lease is held by
  another session (`t3-4e1612537268e934e5722f2a`), so layout, keyboard and notification behaviour below are read from
  code and marked as such where it matters.
- **Status:** the second pass verified ~30 fixes against the live files at 21:10. The remaining findings are from the
  20:29 snapshot; re-read the cited symbol before acting.

Severity: **P0** breaks a core flow or loses data · **P1** serious friction / wrong data most users hit · **P2**
noticeable friction or inconsistency · **P3** polish.

## What already works

Worth keeping, because several fixes below should not sand these off:

- Every tick and edit is a write; a killed app comes back to the workout. The rest timer is stored as a start instant,
  so it is still right after a sleep.
- The previous column, the per-set copy, the PR badge and the +% badge are the right Strong-shaped primitives.
- The import preview (workouts, sets, notes, new exercises, date range, duplicates) is honest before the write, and
  the import is idempotent by start instant.
- The undo toast for a deleted set/exercise is the right pattern.
- Empty/loading states exist on the main screens, the destructive dialogs ask, and the tokens keep the app's look.

## At a glance

132 findings so far (91 first pass, G92–G96 re-check, G97–G98 import pass, G99–G100 contrast/notification pass,
G101–G103 flow pass, G104–G106 lifecycle pass, G107–G109 search pass, G110–G112 first-run/ordering pass, G113–G115
accessibility/copy pass, G116–G118 date/accessibility pass, G119–G122 screen-awake/notes/data pass, G123–G124
form/superset pass, G125–G126 double-tap pass, G127–G128 import/summary pass, G129–G130 reliability/active-card
pass, G131–G132 picker/exercise-page pass). The ones to fix first:

| ID | Severity | Finding | Live tree |
|---|---|---|---|
| G01 | P0 | A second “Add exercise” in a template starts a workout instead | Fixed |
| G02 | P1 | Superset rest is inverted (none through the first lift, then after every set of the second) | Open |
| G03 | P1 | Finishing drops typed-but-unticked sets from every view | Partial (warned) |
| G04 | P1 | A weight with 0 reps is accepted as a set | Fixed |
| G05 | P1 | Rest is always 90 s; templates cannot set it | Open |
| G41 | P1 | Imported sessions never link to an existing template (“Never done” with years of history) | Fixed |
| G72 | P1 | Weight/reps inputs have no accessible names | Fixed |
| G79 | P1 | The gym is English-only in an 8-language app | Open |
| G86 | P1 | No gym export, and “Delete everything” implies Health Connect keeps a copy | Open |
| G87 | P1 | Ticking a prefilled set silently rounds the stored weight | Fixed |
| G97 | P1 | A pounds Strong export imports correctly in kg but displays as kg | New |

## Findings

### A. Tracking a workout

#### G01 — Adding a second exercise to a template starts a workout instead
**P0 · core flow broken.** The picker hands a choice back through a module-level listener; `pickedExercise()` clears
the listener set before emitting (`src/screens/gym/pending.ts`). The template editor subscribes once in a `useEffect`
and never re-subscribes. So the first “Add exercise” lands in the draft; the second one finds `hasPickerListener()`
false and falls through to “use the running workout or start one with this lift” (`PickerScreen.pick`), replacing the
editor with a session.
**Evidence:** probe: `LISTENER_BEFORE true` → `LISTENER_AFTER_FIRST_PICK false`.
**Direction:** do not clear the listener on emit (clear on unmount), or return the choice through a route param/store
that survives more than one pick.

#### G02 — Superset rest timing is inverted
**P1 · the rest timer is wrong for every superset.** The screen suppresses rest while the partner exercise has *any*
unticked set, then starts it after every partner set (`SessionScreen.tick`). With sets grouped by exercise (A1 A2 A3,
B1 B2 B3) that means no rest at all through A, then rest after B1, B2 and B3.
**Evidence:** probe with 3+3 sets: `A1:no-rest A2:no-rest A3:no-rest B1:rest B2:rest B3:rest`.
**Direction:** rest after the last set of the pair (A1→B1 no rest, B1→A2 rest), or interleave the pair on the page;
the current model can do the former by keying on the superset round, not “partner has any set left”.

#### G03 — Finishing silently drops typed-but-unticked sets
**P1 · data the user entered disappears from every view.** `finishSession` does not look at tick state. The summary
counts completed sets, history filters to completed work sets, and the exercise page too — but the rows remain in the
session, invisible.
**Evidence:** probe: 3 rows, 1 ticked → history `setCount: 1`, `vm.setCount: 1`, rows in DB: 3.
**Direction:** before finishing, count unticked rows that carry a weight/reps/time and ask “2 sets are not ticked —
finish anyway / tick them”; show them in the summary if kept.

#### G04 — A weight with zero reps is a valid set
**P1/P2 · zero-volume “sets” pollute history and records.** The tick guard is `weight <= 0 && reps <= 0 && !seconds
&& !distanceM` (`SessionScreen.tick`), so 100 kg × 0 reps passes.
**Evidence:** probe: `WEIGHT_ONLY_ALLOWED true`; finished history `{ sets: 1, vol: 0 }`.
**Direction:** require a positive rep/seconds/distance for a tick, or explicitly allow a “failed at 0 reps” type.

#### G05 — Rest is always 90 s; templates cannot set it
**P1 · every lifter's rest is different, and the data model already has `rest_sec`.** `DEFAULT_REST = 90` is the only
value the screen uses; `GymRoutineItem.restSec` is written by `saveRoutine` but never read by `startSession`, and the
template editor has no field for it.
**Direction:** a rest field per template item (with a global default in Settings), carried into the session; keep the
±15 controls.

#### G06 — A rejected set fails silently, and rest still starts
**P2 · the number looks saved but is not.** `saveSet` returns `fail("invalid")` for weight > 1000, reps > 1000, etc.,
but `SessionScreen.save/tick` ignore the result and `tick` calls `startRest` regardless. The field keeps the typed
value until a reload.
**Direction:** surface the failure on the row/toast and skip the rest start; or clamp with a visible message.

#### G07 — Finished workouts stay fully editable
**P2 · history can be changed by a stray tap.** The tick button, weight/reps cells, Add set and Add exercise all
remain live after `finished`. A tap in an old workout edits history with no “edit” mode and no confirmation.
**Direction:** make the finished page read-only by default with an explicit “Edit workout” action, or require a long
press/confirm for destructive edits.

#### G08 — No way to log or fix a workout's date/time
**P2 · logging after the fact is a normal gym habit.** `updateSession` already accepts `day`, `startTs`, `endTs`, but
no screen exposes them. A workout logged at 22:00 for a 07:00 session has the wrong day and duration forever.
**Direction:** a “Date & time” row in the workout menu (start/end), with the duration derived; allow creating a past
workout from the Gym tab.

#### G09 — A workout started from a template cannot update that template
**P2 · the common “I changed the plan mid-workout” case has no exit.** “Save as template” is hidden whenever
`session.routineId` is set (`SessionScreen` summary). The user must open the template editor and retype.
**Direction:** “Update <template>” / “Save as new template” on a routine-backed workout.

#### G10 — The set-details keyboard covers the choices
**P2, fixed in live tree.** `NoteDialog` no longer autofocuses the note, so the type/RPE pills and Save are visible
when the dialog opens; the note keyboard appears only when the field is tapped. The same autofocus remains in the
rename/notes dialogs and the measurements form (G123).

#### G11 — Set details are hidden behind a long press
**P2 · discoverability.** The only explicit way to open the type/RPE/note/delete dialog is the set number (32 px wide)
or a 350 ms long press on the row. Nothing labels the set number as a button.
**Direction:** a small “…” or chevron per row, or make the set number visibly tappable and add a first-run hint.

#### G12 — Ticking a set has no haptic
**P2 · the core action is silent in the hand.** `Press` has no haptics; only the rest end and toasts do. Lifters tap
the tick without looking.
**Direction:** `haptic.tap()` (or a short selection) on a successful tick; a distinct success on a PR.

#### G13 — Prefilled weights plus a one-tap tick can record a weight that was not lifted
**P2 · convenience becomes a data-integrity risk.** `startSession`/`addExerciseToSession` fill every set with last
time's weight and reps. A single tap on the tick accepts all of them. A user who changed plates but only edited reps,
or who taps the wrong row, records last week's load.
**Direction:** keep the prefill, but make the first tick of a prefilled set show the values in an editable/confirmable
state, or require the weight cell to be touched when it differs from the plan.

#### G14 — Rest starts after the final set
**P3.** Ticking the last set of the workout starts a 90 s countdown that nobody needs; finishing cancels it. Skip the
start when no unticked set remains anywhere.

#### G15 — Unticking a set leaves its rest running
**P3.** Only an `on` tick starts rest; an un-tick does not stop the countdown it started. `stopRest` if the untick
removes the only recent tick.

#### G16 — The rest bar ignores the safe area and covers the page foot
**P3, needs device.** `RestBar` is `absolute bottom-3` inside the screen, with no bottom inset and no extra scroll
padding; on gesture navigation it can sit under the pill, and it covers the last row/Add exercise area.
**Direction:** `bottom: insets.bottom + 12` and add matching bottom padding while resting.

#### G17 — ±15 changes the progress bar's denominator
**P3.** `RestBar` uses `session.restSec` as the total; every +15/–15 changes both sides, so the bar jumps instead of
extending. Also, `–15` at 5 s clamps to 5 s instead of ending the rest.
**Direction:** keep the original total for the bar (or draw elapsed/remaining differently); treat a non-positive
remaining as done.

#### G18 — No “repeat this workout”
**P3.** A finished session has no “do it again” action; the user goes back to the Gym tab and starts the template.
A one-tap “Start again” on the summary is the obvious affordance.

#### G19 — “No sets logged” is wrong when only warmups are ticked
**P3.** `empty` is now “no work sets”, so a session with ticked warmups but no working set says “This workout has no
ticked set” and discards the warmups without mentioning them. Say “No working sets” and keep/convert warmups.

#### G20 — The whole session re-renders every second
**P3/P2 · typing can feel heavy on a long workout.** `useNow()` ticks once a second at the top of `SessionScreen`, so
every `BlockCard`, every `SetRow` and every `TextInput` reconciles each second just to move the clock. The timer only
needs a small leaf component.
**Direction:** isolate the elapsed/rest clock in a component or a shared value; freeze the list.

#### G21 — A deep link to a deleted session spins forever
**P2.** `SessionScreen` returns a loading `DetailShell` when `vm` is null, with no “not found” state. The same is true
for a deleted routine in `RoutineScreen`. A stale rest notification or a shared link lands on a permanent skeleton.
**Direction:** distinguish “loading” from “missing” and show a “This workout was deleted” state with a way back.

#### G22 — Sparse previous column can hide “Last done”
**P3.** `getGymSession` builds `prev` by `setNo - 1`; if the previous session had a gap (a deleted set), `prev[0]` can
be empty and the card's `lastDone` footer disappears even though the exercise was done. Fill from the earliest
available set or carry the session timestamp separately.

#### G23 — “Add set” copies the last set, not the plan
**P3.** `addSet` copies the last set's weight/reps/seconds and resets type to normal. After a drop or a failure set,
the next set starts at the drop weight. Copy the last *working* set or the template's planned values.

#### G24 — No way to insert or reorder a set
**P3.** Sets can only be added at the end and deleted; a missed set in the middle means deleting and retyping the
later ones (the undo toast helps, but the order is still fixed).

#### G102 — No replace/swap exercise in a running workout
**P2 · the bench is taken, and the only way out is delete-and-rebuild.** The exercise menu has move, superset, unit,
history and remove; the picker only adds. To substitute a lift the user removes the block (losing its position, set
count and notes), adds the new exercise at the end, then moves it up and retypes the sets. A “Replace exercise” action
that keeps the block's position and set count and opens the picker in replace mode is the normal gym flow.
**Evidence:** `SessionScreen.BlockCard`'s menu; `PickerScreen.pick` with `sessionId` calls `addExerciseToSession`; no
replace action or route.
**Direction:** a replace action plus a picker mode that swaps the block's `exerciseId` while preserving position, set
count and notes (and asks what to do with completed sets).

#### G104 — A forgotten workout finishes as a 72-hour session
**P2 · a stale workout poisons the week's time and blocks a new one.** `finishSession` sets
`endTs: Math.max(now, start + 1)` with no cap, while the Strong import caps a session at six hours. Start a workout
on Friday, forget it, finish it on Monday: the history and the week's “Time” tile get 72 hours, the resume card's clock
counts past 24 hours without a day unit, and the one-workout-at-a-time rule meant a new session could not start until
the old one was opened and discarded.
**Evidence:** probe: start three days ago, finish now → `duration: 259200` (72 h), history keeps it; `clockText` has no
days; `getGymHome.active` keeps counting `now - startTs`.
**Direction:** cap a live session at the import's 6 h, or ask on resume/finish when the start is more than ~12 h ago
(“Still training? Set the end time / discard”); show days in the clock; offer “Discard and start new” on the resume
card.

#### G112 — Every empty workout is called “Workout”
**P3 · a history of identical rows.** `startSession` falls back to `"Workout"` when there is no routine and no typed
name; the header, the history and the session page all show it, and the only way to change it is the overflow menu's
“Rename workout”. A user who starts empty several times gets several “Workout” rows that are told apart only by their
exercise list.
**Evidence:** `startSession`'s name fallback; `SessionRow`'s name; `SessionScreen`'s menu.
**Direction:** auto-name from the first exercise added (“Bench Press day”) or prompt once at start; make the title an
editable chip.

#### G119 — The gym session never keeps the screen awake
**P2 · the phone locks between sets.** The gym session does not call the app's `KeepAwake` helper, while the guided
workout and breathe screens do. A rest timer or a set in progress is exactly the case where the screen should stay on;
instead the phone sleeps, and the user unlocks to tick the next set (the rest notification still fires, but the app is
behind the lock screen).
**Evidence:** `src/live/KeepAwake.tsx`; `LiveWorkoutScreen` and `BreatheScreen` render it; no `KeepAwake` import anywhere
in `src/screens/gym`.
**Direction:** render `<KeepAwake tag="gym-session" />` while the session is unfinished (optionally only while resting),
or add a “Keep screen awake” setting.

#### G124 — Superset integrity is not enforced
**P3 · pairing can leave a dangling badge.** The exercise menu offers “Superset with <next>” whenever the current block
has no superset, even if the next block is already paired with the one after it; `setSuperset` then overwrites the next
block's `supersetId`, leaving its old partner with a badge and no partner. `moveExercise` swaps positions without
touching supersets, so moving a member away leaves two non-adjacent badges that still share an ID. The rest logic groups
by ID regardless of adjacency, so the badge no longer describes what the timer does.
**Evidence:** `SessionScreen.BlockCard`'s menu (`supersetId ? remove : next ? supersetWith`); `setSuperset` overwrites
both blocks' IDs; `moveExercise` only swaps `position`.
**Direction:** disable “Superset with next” when the next block already has a superset, or merge/clear the old pair with
a confirm; when a member moves, move the pair together or clear the superset.

#### G126 — Double-tapping the tick can un-tick the set it just ticked
**P3 · a “tap it twice to be sure” leaves the set unticked and a rest running.** `SetRow`'s tick calls `onTick(draft())`
with no in-flight guard. The first tap saves `completed: true` and starts a rest; a second tap after the re-render sees
`completed: true`, saves `false`, and leaves the countdown running for a set that is no longer done (G15). It also
queues a second rest write when both taps land before the re-render.
**Evidence:** `SessionScreen.tick` (`on = !set.completed`); `SetRow`'s tick `onPress`; no per-row pending/debounce.
**Direction:** disable or debounce the tick while its write is in flight, and stop the rest if an untick removes the set
that started it.

#### G128 — A finished workout keeps ticking every second
**P3 · the summary page re-renders for a clock that no longer moves.** `SessionScreen` calls `useNow()` unconditionally;
once `session.finished` is true, `elapsed` uses the fixed `endTs` and the rest bar is gone, but the once-a-second `now`
still re-renders every set row and input on the read-back page (G85). `GymHome` already passes `!!active` to the same
hook.
**Evidence:** `SessionScreen` lines 45/83 (`const now = useNow()`; `elapsed = (session.endTs ?? now) - startTs`).
**Direction:** call `useNow(!vm?.session.finished)` (hook order-safe) or isolate the clock in a leaf component.

### B. Templates

#### G25 — No rest or note per template item
**P2.** `GymRoutineItem` has `restSec` and `note`, and `saveRoutine` accepts `restSec`, but the editor only shows
sets × reps. The result is G05's global 90 s and a lost place for “3 s pause at the bottom”.
**Direction:** rest and note fields in the row's expansion/sheet.

#### G26 — “0 sets” is not honored
**P2 · the type's own doc says 0 means “as many as you do”.** `startSession` uses `item.sets > 0 ? ... : 1`, so a
template item set to 0 opens with one set. The editor allows 0.
**Evidence:** probe: `0` planned → `[{ n: 1, w: 0, r: 0 }]`.
**Direction:** decide the semantics: 0 sets → no set rows (add as you go), or disallow 0 in the editor.

#### G27 — A new template cannot be started directly
**P3.** “Start” is hidden while `isNew`; the user must Save, land back on the Gym tab, find the new card and tap it.
Show Start for new templates too (it already persists first).

#### G28 — Starting a template while another workout runs silently opens the other workout
**P2.** `GymHome.start` explains via toast and opens the active session. `RoutineScreen.start` calls `startSession`,
which returns the active session, and pushes it with no explanation; the user thinks their template started.
**Direction:** the same toast/branch as the Gym tab, or offer “Finish the current workout first”.

#### G29 — No duplicate or reorder for templates
**P3.** The data has `position`, but the editor and the list have no reorder; the list is sorted by last trained, so
the saved order is mostly invisible. “Duplicate” is the usual way to make a variant.

#### G30 — Tapping the card starts the workout; nothing says so
**P2.** The whole card is a Start button; the only other affordance is a three-dot menu. An accidental tap immediately
creates a session (and prefill). A visible play/Start control, or a short press-and-hold, would make the card's
primary action explicit.
**Direction:** a Start button inside the card and a separate tap target for Edit, as the menu already offers.

#### G31 — The card summary hides reps and truncates mid-name
**P3.** `“5 × Bench Press (Barbell), 5 × Incline…”` at 3 lines. It says sets, not reps, and the truncation can cut an
exercise name. A compact “5 exercises · 18 sets” plus a first-few list reads better.

#### G32 — Removing a row in the editor is instant
**P3.** A deleted draft row is only recoverable by leaving without saving (which loses every other edit). An undo
toast or a confirm on the row would fit the rest of the app.

#### G101 — Starting a new template leaves the editor in “new”, so the next Save/Start writes a copy
**P2 · duplicate templates with the same name.** `RoutineScreen` derives `isNew` from the route (`id === "new"`) and
`persist` sends `id: isNew ? undefined : id`. `start` saves, pushes the session and now calls `setStartSig(sig)`, but
never replaces the route with `/gym/routine/<new id>`. Back from the session returns to that same editor; the dirty
flag is cleared, so tapping Save or Start again writes a second routine with the same name. `start` also persists
*before* its `activeSession` check, so even the “a workout is already running” path saves a duplicate first.
**Evidence:** `RoutineScreen.persist/start`; `saveRoutine` (`id: input.id ?? newId()`); probe persisting the same new
template twice → two routines named “Push”, two cards. Starting from one leaves the other orphaned.
**Direction:** after the first save of a new template, replace the route with `/gym/routine/<new id>` (or keep the
saved id in state and use it); check `activeSession` before persisting in `start`.

#### G105 — Templates only carry sets × reps, so holds and cardio start wrong
**P2 · a plank is planned as “3 × 10” and a run as “1 × 10”.** `GymRoutineItem` has `sets`, `reps`, `restSec` and
`note`, but no seconds or distance; the editor always offers the same sets × reps row. `startSession` gives every
hold set `seconds: 30` and `reps: 10` (the reps are hidden in the row), and gives cardio no seconds or distance at all.
Every timed or distance set has to be retyped each session, and the template's “10 reps” means nothing.
**Evidence:** probe: a Plank template 3×10 starts as `reps:10, seconds:30` on all three sets; a Running (Treadmill)
template 1×10 starts as `reps:10, seconds:null, distanceM:null`.
**Direction:** give routine items a target type and seconds/distance, adapt the editor to the exercise (time for
holds, distance/time for cardio), and prefill from the last session.

### C. Exercise picker and exercises

#### G33 — Picking from the Gym tab force-starts a workout
**P2 · browsing is impossible.** Every row in the picker is “add”; from the Gym tab with no session, `pick()` starts
a session and adds the lift. A user who only wanted to look at an exercise's history is now in a workout.
**Direction:** make the row open the exercise page, with a separate “Add” button (and the picker's context decides
where Add goes).

#### G34 — Custom exercises cannot be hold, equipped, edited or deleted
**P2.** `NewExerciseDialog` asks only name + body part; `createExercise` supports `hold` and `equipment` but they are
not passed. A custom plank logs reps, a custom “Trap Bar” shows “other”, and there is no edit/delete anywhere.
**Direction:** the missing fields in the dialog, plus edit/delete on the exercise page (with a “sets exist” warning).

#### G35 — Empty search says “Search exercises”
**P3.** `results.length ? … : <Text>{t("exercise.search")}</Text>` — the no-results state repeats the placeholder
instead of “No exercises match”.

#### G36 — The 193-row picker is one non-virtualized card
**P3/P2.** `data.all` is rendered with `.map` inside one `Card` in `ScreenScroll`. On a low-end phone the initial
render and scrolling will be heavier than the rest of the app; search narrows it, but the default view is all 193.
**Direction:** `FlatList`/`SectionList` or a capped initial list with “Show all”.

#### G37 — No way to preview an exercise from the picker
**P3.** Tapping always adds; the only way to see the 1RM curve/history is to add it or leave the picker. A chevron or
long press to open `/gym/exercise/[id]` would help.

#### G38 — Equipment is a raw enum
**P3.** The picker prints `exercise.equipment` (`barbell`, `dumbbell`, `smith`, `other`) with no i18n key and no
capitalization. It reads like debug data next to the translated body part.

#### G39 — The new-exercise keyboard covers the body-part pills
**P2.** `autoFocus` on the name field opens the keyboard over the 14 body-part pills and the Add button; the user has
to dismiss it to finish. Focus after the body part, or make the sheet scroll/keyboard-avoid.

#### G40 — A duplicate custom name silently returns the existing exercise
**P3.** `createExercise` returns the catalogue/existing match, so “Add exercise” can produce no visible change and
no “already exists” message. Say which exercise was used.

#### G107 — Search misses the words lifters actually type
**P2 · “RDL”, “OHP” and “farmer’s carry” return nothing.** `searchExercises` matches every query word as a substring of
the catalogue *name* only; `key` just lowercases and collapses spaces (no punctuation or apostrophe stripping), and the
import's alias table (`rdl`, `ohp`, `farmer carry`, …) is not consulted. Probes: `rdl`, `ohp`, `bss`, `sldl`,
`db press`, `pullup`, `chinup` → 0 results; `farmer's carry` → 0 because the catalogue writes “Farmer's” with an
apostrophe; `pull-up` → 0 because the name is “Pull Up”; `bb row` returns dumbbell rows because “bb” is a substring of
“dumbbell”. The screen then says “No exercises match”.
**Evidence:** `searchExercises`/`key`; probe counts above.
**Direction:** normalize punctuation/apostrophes to spaces, search the alias table as well as names (at a lower rank),
and tokenize abbreviations instead of substring-matching inside “dumbbell”.

#### G108 — Body-part terms do not find body parts
**P2/P3 · “glutes”, “quads”, “abs” return zero.** `abs`, `core`, `glutes`, `hamstrings`, `quads`, `arms` and
`shoulders` all return 0 even though every exercise carries a `bodyPart`; `chest` and `back` only match names that
happen to contain the word. The picker prints the body part under every result but offers no filter.
**Evidence:** probe over `searchExercises` (0 for the seven terms; `chest` 9, `back` 5).
**Direction:** include `bodyPart`/`equipment` in the search haystack at a lower score and/or add body-part filter chips;
return every chest/back/… exercise for the term.

#### G109 — The no-results state is a dead end, and some common lifts are absent
**P3.** “Trap Bar Deadlift”, “Box Jump” and “Ski Erg” have no catalogue entry; “Reverse Fly” only exists as “Rear Delt
Fly”. The empty state says “No exercises match” with no “Create ‘Trap Bar Deadlift’” button — the New button is in the
header, so the user retypes the query, and the custom dialog then asks only name + body part (G34).
**Evidence:** probe of common lifts; `searchExercises` returns 0 for the three missing names.
**Direction:** offer “Create <query>” in the no-results state (prefilled, with equipment/hold fields), and add the
common missing lifts to the catalogue.

#### G120 — The exercise's own note field has no UI
**P2 · setup reminders die with the workout.** `GymExercise.note` exists, is copied through `exerciseMap`, and is
written by `setExerciseUnit`/the import, but no screen shows or edits it. The persistent reminders a lifter needs
(“seat height 4”, “blue band”, “elbows in”) only fit on a set or the whole session; a set note dies with that workout.
**Evidence:** `GymExercise.note` in `types.ts`; no `note` input in `PickerScreen`/`ExerciseScreen`; `grep .note` finds
only session/set notes.
**Direction:** an “Exercise note” section on the exercise page (and/or above the session block), persisted with
`putGymExercises`.

#### G122 — Assisted exercises treat the assistance as lifted weight
**P3 · a 50 kg assisted pull-up becomes a 58 kg “record”.** “Assisted Pull Up” and “Triceps Dip (Assisted)” are in the
catalogue; the set's weight field is the assistance, but `volumeOf` and `estimate1Rm` treat any positive weight as
load, so 50 kg assistance × 5 produces a 58 kg estimated 1RM, volume and a records-board entry — backwards.
**Evidence:** the two catalogue entries; `setVolume`/`estimate1Rm`; no `assisted` flag or negative-weight convention in
`GymExercise`/`GymSet`.
**Direction:** an `assisted` flag on the exercise (or a negative-weight convention) so volume/records subtract it from
bodyweight or ignore it; label the column “Assistance”.

#### G125 — Double-tapping an exercise can add it twice or start an orphan session
**P2 · the picker has no in-flight guard.** `PickerScreen.pick` is fired per row with `void pick(exercise)` and no
pending flag. Two quick taps run two async adds: in a session you get two identical blocks; in a template the editor
dedupes the item but `goBack` runs twice; from the Gym tab two `startSession` calls can both pass the `activeSession`
check-then-write and create two unfinished sessions, one of which is invisible behind the other.
**Evidence:** `PickerScreen.pick`/`ExerciseRow`’s `onPress`; `startSession`’s check-then-write has no lock.
**Direction:** a `pending` ref that ignores taps until navigation, disabled rows while running, and/or a transactional
“one unfinished session” check in `startSession`.

#### G131 — “My exercises” has no section
**P3 · custom exercises are invisible in the picker.** `getGymPicker` computes `custom: all.filter((e) => e.custom)`
and the copy has an `exercise.custom` label, but `PickerScreen` renders only `recent` and the alphabetised `all`; a
custom exercise looks exactly like a catalogue one and there is no way to find “my exercises” except scrolling or
searching by name.
**Evidence:** `PickerVM.custom`; `PickerScreen` uses `data.recent`/`data.all` only; the `exercise.custom` key is unused.
**Direction:** a “My exercises” section (from `data.custom`) above All, with a “Custom” badge and an edit link.

### D. Import

#### G41 — An existing template never learns about imported sessions with its name
**P1, fixed in live tree.** `buildRoutinesFrom` now points the newest imported session at the existing routine, so a
pre-created “Push” gets its `lastTs` after an import. The 14k-row probe confirmed the template's “Never done” clears.

#### G42 — No progress or cancel during a large import, and a partial import has no undo
**P2 · a 14k-row file looks frozen and can leave unmarked data.** `busy` only disables the button; `import.reading`
exists but is unused. The writes are session-by-session; a kill/exception before `putGymImport` leaves partial rows
with no `sessionIds` to undo. A synthetic 14,295-line / 1.3 MB export previews in 307 ms and writes 509 sessions /
14,252 sets in 336 ms on `MemoryStore`, so the parse is not the problem; on a phone the 509 SQLite transactions are
the unknown, and the missing progress is still the risk.
**Direction:** a progress row (workouts written / total) with a cancel, and write the import state incrementally or
mark the batch before writing.

#### G43 — An all-duplicates preview still offers Import
**P2.** The preview shows “N already in the log” but the primary button remains Import; tapping it produces “Nothing
new to import”. Disable/relabel it to “Everything is already imported”.

#### G44 — Every import error is “That file could not be read as a Strong export”
**P3.** Empty file, missing headers, and a valid file with no sessions all get the same message; `GymError` already
distinguishes `emptyFile`, `notStrong`, `nothingToImport`. Use them.

#### G45 — The import summary can overstate what was written
**P3.** `putGymImport.sets` and the done card use `summary.sets` (all parsed rows), not the rows actually written
after duplicate skipping. The workout count is corrected (`written`), the set count is not.

#### G46 — Undo loses the previous import's state
**P3.** `undoStrongImport` writes `EMPTY_IMPORT`; if a first import is still in the log, “Undo last import”
disappears after undoing a second one, and the first can no longer be undone from the UI.

#### G47 — Undo leaves the custom exercises it created
**P3, likely intentional.** The sessions/templates go, the six unknown-name exercises stay. That is defensible, but
the confirm should say so (it only mentions workouts and templates).

#### G97 — A pounds Strong export imports correctly in kg but displays as kg
**P1 · a US user's 225 lb bench becomes “102.06 kg”.** `importStrongCsv` detects a `Weight (lbs)` header and converts
every weight to kilograms (`pounds ? 0.45359237 : 1`), but `importStrong` creates or resolves exercises with their
catalogue unit and never records that the file was pounds. Nothing in the preview or the done card says the file was
in pounds, and the only fix is switching each exercise to lb one at a time (the menu exists, but the user has to know).
**Evidence:** probe of a `Weight (lbs)` export: 225 lb × 5 → `weightKg: 102.058`, `exercise.unit: "kg"`, shown
`"102.06 kg"`. A 14k-row kg export imported cleanly (509 sessions / 14,252 sets).
**Direction:** return the source unit from `importStrongCsv` and set each imported exercise's `unit` to `lb` when the
header is pounds (or offer a one-tap “Show this import in lb”), and say it in the preview.

#### G98 — Imported custom exercises lose their type
**P2 · a timed hold becomes a rep exercise in the template the import builds.** An unknown name is created with
`bodyPart: "full body"`, `equipment: "other"` and `hold: false`; the cardio guess only fires for names containing
run/row/bike, so an unknown “SkiErg”/“Stairmaster” is not cardio, and an unknown timed hold (e.g. “forearm rotation
clock”) is not a hold. The imported session still shows the seconds/km columns because `BlockCard` infers `hold` from
the set, but `startSession` uses `exercise.hold` to decide `seconds`, so a new session from the imported template shows
weight/reps and cannot log the hold — and there is no custom-exercise editor to fix it (G34).
**Evidence:** `importStrong`'s custom row (`bodyPart` heuristic, `hold: false`), `startSession`'s
`seconds: exercise?.hold ? 30 : null`, and `BlockCard`'s `hold` inference. The synthetic 14k export created
“forearm rotation clock” as a non-hold.
**Direction:** infer `hold` from an unknown exercise's sets (seconds-only, no reps) and `cardio` from distance/seconds,
or expose the hold/equipment fields in the custom-exercise editor.

#### G127 — The import preview hides skipped rows, custom names and new templates
**P3 · the user cannot see the messy parts before writing.** The preview card shows workouts, sets, notes, the *count*
of new exercises, duplicates and capped durations. It does not show `summary.skipped` (empty placeholder rows, rows with
no date/exercise), the names inside `preview.custom`, or the templates the import will add (`ImportOutcome.routines`
exists after the write, but the preview does not compute it). A messy export silently loses rows, and the Gym tab
suddenly gains six templates.
**Evidence:** `ImportSummary.rows/skipped/names`; `ImportPreview.custom` (array, only `.length` used); `ImportOutcome.routines`;
`ImportScreen`'s stat tiles.
**Direction:** add “N rows skipped”, the custom names (or a “see names” expander), and “N templates will be created” to
the preview and the done card.

### E. History, records and the exercise page

#### G48 — Bodyweight exercises claim to have no history
**P2, fixed in live tree.** `getGymExercise` still returns `record: null` without a weighted set, but the screen now
renders a Bodyweight card with sets and reps when `history` is populated. (See G106 for the cardio/hold overreach.)

#### G49 — “was X” is the second-best ever, not the previous record
**P2, fixed by relabelling.** `getGymExercise.previousRecord` still scans for the highest 1RM below the current record,
not the record held before the latest one; the UI now says “2nd best 128.3” instead of “was 128.3”, which is honest.
There is still no chronological PR timeline.

#### G50 — The exercise page's second tile is mislabeled
**P2, fixed in live tree.** The tile now says Volume and the set count is the aside.

#### G106 — Cardio and hold exercises get the bodyweight rep card
**P2 · a treadmill's “record” is 0 reps.** After the G48 fix, any exercise with history and no weighted record renders
the “Bodyweight / No weight on the bar: the reps are the record” card with `totalSets` and `totalReps`. A treadmill
has `totalReps: 0`, so the card reads “0 reps”; a plank's record is seconds, not reps. The same mismatch follows the
history rows: a cardio set that carries both seconds and distance shows only the seconds, and the session/history
meta always includes `volumeText`, so a cardio or bodyweight workout reads “0 kg”.
**Evidence:** probe: 5 km / 30 min treadmill → `record: null, totalSets: 1, totalReps: 0, bestWeight: null`; a 60 s
plank → the same 0 reps. `SessionRow` joins `volumeText(card.volumeKg, card.unit)` unconditionally.
**Direction:** branch the summary and row meta on `isCardio`/`hold`: distance/time for cardio, seconds for holds, reps
only for bodyweight rep work; hide the 0 kg volume segment.

#### G132 — An exercise page cannot add the lift to a workout or template
**P3 · the page is a dead end after reading it.** `/gym/exercise/[id]` shows the record, chart and history, but has no
action; the only way to use the lift is to remember it and navigate back to the session or picker. From a history row
or a records-board entry, “Add to current workout” (or “Start a workout with this”) is the natural next step.
**Evidence:** `ExerciseScreen`'s `DetailShell` has no `action` or `footer`; its only `push` is into a history session.
**Direction:** if an unfinished session exists, show “Add to workout”; if a template editor is open, “Add to template”;
otherwise “Start a workout with this”.

#### G51 — History caps are silent
**P2.** The exercise page shows the newest 30 sessions; measurements show the newest 60 rows. Older data is
unreachable with no “Show all”/paging, which is surprising in a log people keep for years.
**Direction:** a “Show more” control or a real list; state the cap.

#### G52 — Charts are not time-scaled and have no y-axis
**P2 · a 6-month gap looks like a day.** `MiniLine` spaces points evenly by index and prints only the first/last date;
the 1RM and weight charts therefore imply a time axis they do not have. There are no value labels, so the reader
cannot tell 100 from 140 kg without a tooltip (there is none).
**Direction:** x from timestamp, 3–4 y gridlines with values, a tap/drag readout; or label the chart “by session”.

#### G53 — History and records have no search or filter
**P3.** With years of data, finding “the last time I did front squats” means scrolling. A search field and a body-part
filter would match the records/exercise pages.

#### G116 — Older date labels are UTC, not the profile's local day
**P2 · a late workout can show the next day.** `whenText` (template “last done”, session “last done”), `RecordsScreen`'s
record date, `ExerciseScreen`'s chart start/end labels and `ImportScreen`'s “last import” line all build the day with
`new Date(ts * 1000).toISOString().slice(0, 10)`. A workout at 23:00 in UTC-5 is 04:00Z the next day, so those labels
say the 2nd while the session's own stored `day` says the 1st; the app already has `localDay(ts, timeZone)` and each
session carries the local day.
**Evidence:** probe `TZ_DATE { utc: "2026-11-02", local: "2026-11-01" }`; `parts.tsx` `whenText`; `RecordsScreen`'s
record date; `ExerciseScreen`'s series labels; `ImportScreen`'s last-import line.
**Direction:** format from the stored `day` where possible, or pass the profile's timezone into `whenText`, the record
row and the chart labels and use `localDay`.

#### G54 — The records board omits bodyweight and cardio
**P3.** Only weighted 1RM sets produce a row. A user whose main lifts are push-ups, pull-ups and rows sees an empty
records board; a “Best reps” section would cover it.

#### G55 — A history row lists exercises that were never ticked
**P3, fixed in live tree.** `cardOf` now filters to completed sets before grouping, so an unticked exercise no longer
appears in a history row.

#### G56 — The chart icon on every exercise-history row means nothing
**P3.** `ChartLine` is shown whenever a weighted set exists, not when the row is a record or opens a chart. It reads
as a button and is not one.

#### G57 — A deleted routine deep link spins forever
**P2.** Same pattern as G21: `RoutineScreen` returns a loading shell for a missing id.

### F. Measurements and calculators

#### G58 — Switching kg/lb in the calculator does not convert the entered values
**P2 · a silent unit change.** The toggle changes `unit` but leaves `weight`, `reps` and `target` as typed, so “100”
kg becomes “100” lb (and the bar list resets). A user can get a wrong 1RM and plate load without noticing.
**Direction:** convert the three fields on switch (or clear them with a visible “units changed” note).

#### G59 — Body measurements are metric-only
**P2.** `MEASUREMENTS` hardcodes kg and cm; a user who logs lifts in lb still sees body weight in kg and tape in cm.
There is no unit setting for measurements.
**Direction:** derive weight from the profile/units setting and offer in/cm for tape.

#### G60 — Measurements cannot be edited, and delete has no context
**P2/P3.** A typo can only be deleted and re-added. The delete confirmation has no value/date, so it is easy to
delete the wrong row.
**Direction:** tap a row to edit; the confirm names “Waist, 82 cm, 2 Nov”.

#### G61 — Invalid measurements fail silently
**P3.** Save is enabled for any non-empty text; `parseFloat` NaN returns without feedback, and `saveMeasurement` can
reject > 1000 with no message. Disable Save until the value parses, or show the reason.

#### G62 — Only weight gets a chart
**P3.** Body fat and tape are the measurements people watch for trends; a chart per kind (or a small multiple) would
be expected from the rest of the app.

#### G103 — The plate calculator is not reachable from a set
**P3 · the calculator is most useful mid-workout, and that is the one place it is absent.** The Tools screen is only
under More; to check plates the user leaves the session (the in-app rest bar disappears, though the notification
stays), then comes back. The exercise menu has History, Unit, Superset and Move but no “Plates”, and `ToolsScreen`
starts with empty fields — there is no way to pass the set's weight or the bar.
**Evidence:** `SessionScreen.BlockCard`'s menu; `ToolsScreen`'s local `weight`/`target` state; `MoreScreen`'s gym rows.
**Direction:** a “Plates” item in the exercise menu that opens `/gym/tools` prefilled with the current weight and bar,
or a small per-side readout under the set.

#### G123 — The keyboard covers the action row on two forms
**P2 · the Save button sits behind the keyboard.** `MeasurementsScreen`'s add form puts the value `Input` in the page
footer with `autoFocus` and the Save/Cancel buttons immediately below; `SessionScreen`'s Rename and Notes dialogs also
autofocus their fields in a centered `Modal` with no keyboard avoidance. On a phone the keyboard occupies the lower
half, hiding the measurement Save button and overlapping the dialogs' lower buttons, so the user must dismiss the
keyboard to submit.
**Evidence:** `MeasurementsScreen` line 156; `SessionScreen` lines 709/805; no `KeyboardAvoidingView` in those paths and
`DetailShell` has none.
**Direction:** wrap the form/dialog in `KeyboardAvoidingView`, or drop `autoFocus`, and keep the action row above the
keyboard.

### G. The Gym tab

#### G63 — The clock ticks every second even with no workout running
**P3, fixed in live tree.** `GymHome` now calls `useNow(!!active)`, so a tab left mounted behind More no longer ticks.

#### G64 — “Last 7 days” shows a wall of zeros on a fresh install
**P3, fixed in live tree.** The block is hidden until `week.sessions > 0`, so a fresh install no longer shows four
zeros.

#### G65 — Week “Sets” counts warmups, week “Volume” does not
**P3, fixed in live tree.** The week count now uses `isWorkSet`, so the two tiles agree; the probe's 1 warmup + 1 work
set counts 1 set.

#### G66 — “0 min” is hardcoded
**P3, fixed in live tree.** The block is hidden at zero, and the time tile uses `lengthText` rather than a literal.

#### G67 — No rest indicator on the tab
**P3.** Leave the session and the rest continues only in the notification; the Gym tab's resume card shows the
workout but not “rest 0:42”. A small countdown there would close the loop.

#### G68 — The search bar is a button
**P3/P2.** It looks like a focused search field but is a `Press` that navigates. That is a common pattern, but the
hint text and search icon invite a tap-and-type; a real field (or a clear chevron) would match the expectation.

#### G110 — The Strong import is invisible on the Gym tab, especially on first run
**P2 · the target user sees an empty gym and no way in.** The Gym tab's empty state offers only “New template”; the
Strong import lives at More › Import from Strong, the fifth row of the Gym group, and `docs/onboarding.md` never
mentions the Gym tab or the import. Someone with years of Strong history — the user this importer exists for — has no
hint that the history can come in.
**Evidence:** `GymHome`'s `GymEmpty` CTA; `MoreScreen`'s `gymRows`; `docs/onboarding.md` headings (no gym).
**Direction:** add “Import from Strong” to the Gym tab's empty state (and a one-time first-run card), or a banner
“Coming from Strong? Import your history”; mention the Gym tab in onboarding.

#### G111 — The top template is the one you just did
**P3 · recency is not rotation.** `getGymHome` sorts templates by `lastTs` descending; the code comment calls it a
“last used” list. For a Push/Pull/Legs rotation the most recently trained template is the *least* likely next, so the
first card and the “Recent” block repeat the workout just done while the next one sits below the fold.
**Evidence:** `queries/gym.ts` `cards.sort`; `GymHome`'s template list; `docs/gym.md`’s “last used” wording.
**Direction:** add a “Next up” card (least recently trained, or a stored rotation) or sort by the saved position and
label the recency separately; keep the “last used” wording if recency really is the intent.

#### G118 — “Last done” on a template card freezes at mount
**P3 · the relative label stops moving.** `TemplateCard` captures `const [now] = useState(...)` once; `whenText`'s
“2 days ago” never ticks, and tab screens stay mounted. Leave the app open overnight and a workout done yesterday still
reads “1 day ago” (or a 3-day-old one reads “2 days ago”) until the card remounts.
**Evidence:** `parts.tsx` `TemplateCard`'s `useState` and `whenText`.
**Direction:** use the `useNow` helper (or `Date.now()` on focus) for the card's relative label.

#### G130 — The active workout card doesn't say where you are
**P3 · you have to open the workout to remember the next set.** `GymHome`'s active card shows the name, `done/total`
sets and the elapsed clock; `getGymHome.active` also returns `exercises` and `volumeKg`, but the card shows neither the
current/last exercise nor the next set. A user returning to the tab sees “5 of 18 sets done” with no clue what came
next.
**Evidence:** `GymHome`'s active card; `getGymHome.active`'s `exercises`/`volumeKg` are computed but unused.
**Direction:** show “Next: Bench Press, set 3” (or the last completed exercise) from the sets' completion state.

### H. Rest timer and notifications

### H. Rest timer and notifications

#### G69 — Notification permission failure is silent
**P2, partial in live tree.** `scheduleRest` catches every error and returns false; the screen ignores the result. If
POST_NOTIFICATIONS is denied, the user gets no “rest over” alert in a pocket and no hint that they need to enable it.
The live fix adds a one-time “Allow notifications to hear the rest timer.” toast when scheduling fails, but it has no
action and the failure signal is not the same as the permission state (G100).
**Direction:** on a false result, show a one-time inline hint with a real “Allow”/“Open settings” action.

#### G70 — The channel name is English-only
**P3, fixed in live tree.** `ensureRestChannel` now names the channel `i18n.t("gym:session.restChannel")`, so Android
settings follows the app language.

#### G71 — Deleting everything can leave a rest notification that opens a dead session
**P3, fixed in live tree.** `reset()` now calls `cancelRest()`, so the notification cannot outlive the gym data.

#### G100 — The rest notification checks the schedule result, not the permission
**P2 · a fresh install can get a silent rest timer with no hint.** `SessionScreen.tick` only shows `restNotifyOff`
when `scheduleRest` returns false, but `scheduleRest` catches a throw; on Android 13 a denied or undetermined
POST_NOTIFICATIONS can let `scheduleNotificationAsync` resolve while the notification is never shown. The app already
exports `notificationPermission()` and `askNotificationPermission()`, but only Settings › Notifications calls the
request, so the first rest after install has no path to permission from the workout.
**Evidence:** `src/background/notify.ts` (`scheduleRest`, `notificationPermission`, `askNotificationPermission`);
`SessionScreen.tick`'s `.then((ok) => { if (!ok) … })`; `NotificationsSection` is the only caller of the request.
**Direction:** on the first rest of a session, read `notificationPermission()`; if it is not `granted`, show a one-time
inline row with “Allow” (calls `askNotificationPermission`) or “Open settings” (`Linking.openSettings`), rather than
inferring from the schedule result.

#### G115 — The undo toast covers the rest bar
**P3 · the undo and the countdown fight for the same bottom slot.** `ToastHost` sits at `insets.bottom + 16`; the
session's `RestBar` is `absolute bottom-3`. Deleting a set (or an exercise) during a rest raises a 6 s undo toast over
the countdown's −15/+15/Skip controls, exactly when the user needs them. On the Gym tab both are bottom-anchored too,
so a notice can cover the tab bar/check-in action for its 4 s.
**Evidence:** `src/ui/Toast.tsx`'s `ToastHost` bottom; `SessionScreen`'s `RestBar` `bottom-3`; `ToastHost` is mounted at
the app root.
**Direction:** offset the rest bar while an action toast is visible (or place the toast above it), and keep notices
clear of the tab bar.

### I. Accessibility and touch

#### G72 — Weight and reps inputs have no accessible names
**P1, fixed in live tree.** Each `NumCell` now carries “Set N weight/reps/seconds/km”, so a screen reader can tell the
fields apart. The same gap remains in the other gym forms (G113).

#### G73 — Many tap targets are below 44×44
**P2.** Measured from the classes: header Finish (36 h), the exercise menu dots (28), set type pills (32), RPE pills
(32×36), body-part pills (32), measurement kinds (32), calculator unit/bar chips (36), rest bar ±/Skip (36), the set
number (32 w). Some have hitSlop, some not.
**Direction:** 44 px minimum (or hitSlop to 44) for every control used mid-workout.

#### G74 — Nested pressables duplicate the same label
**P2.** `SetRow` is a Press labeled “Set 3” wrapping a set-number Press labeled “Set 3” and a “Use the previous
numbers” Press; TalkBack sees three targets for one row. The outer row also swallows input focus gestures.
**Direction:** make the row a plain `View`, keep the number/previous/tick as the three targets.

#### G75 — Confirmation dialogs are not modal for screen readers
**P2.** `ConfirmDialog` is a `Modal`, but the panel has no `accessibilityViewIsModal`/focus trap; TalkBack can read
behind it. The backdrop's `accessibilityLabel` is the title, which makes the backdrop itself a target.
**Direction:** `accessibilityViewIsModal` on the panel, hide the backdrop from a11y, focus the title on open.

#### G76 — Fixed heights + large font scale
**P2.** `h-8`, `h-9`, `size-8`, `leading-8` are used for text-bearing pills; Android's 200% font scale will clip.
Test with `settings text-size` and prefer min-height/padding.

#### G77 — PR and +% are colour-only
**P3.** The PR badge is a word, but the +% delta uses green/red alone; add a sign/arrow or a spoken label.

#### G78 — Decorative icons are not hidden
**P3.** The `Scale` icon beside the exercise name, the `ChartLine` icon in history rows, and the trophy/chevron icons
are read by TalkBack. Mark them `accessibilityElementsHidden`/`importantForAccessibility="no"`.

#### G99 — The set cells and tick ring are below the 3:1 non-text contrast
**P2 · the core controls disappear in bright gym light.** The weight/reps cells are `bg-secondary` on `bg-card`, the
uncompleted tick is a `border-input` ring, and the row separators are `border-border/60`. Measured contrast: light
1.23:1 (cells), 1.40:1 (tick ring), 1.23:1 (separator); dark 1.48:1, 1.68:1, 1.37:1. WCAG 1.4.11 asks 3:1 for the
visual boundary of a control; a 1.4:1 empty circle is easy to miss beside a 1.2:1 filled cell.
**Evidence:** contrast calculation over `src/ui/palette.ts` (`secondary`, `input`, `border`) and the classes in
`SessionScreen.SetRow`/`NumCell`.
**Direction:** raise the set-cell fill and the tick ring to a 3:1 control token (the separators can stay decorative).

#### G113 — The other numeric inputs still have no accessible names
**P2 · the set cells were fixed; the template, measurement and calculator fields were not.** `RoutineScreen`'s
sets/reps fields are two bare `Input`s with only “×” between them, `MeasurementsScreen`'s value field leaves the unit
as a sibling `Text`, and `ToolsScreen`'s weight/reps/target fields have visible labels that are not associated with the
inputs. A screen reader hears “0, edit box” without knowing which number it is.
**Evidence:** `Input` in `src/screens/log/fields.tsx` passes props through with no default label; the gym usages at
`RoutineScreen` 157/168, `MeasurementsScreen` 156 and `ToolsScreen` 80/84/104 carry no `accessibilityLabel`.
**Direction:** add an `accessibilityLabel` to each (“Sets for Bench Press”, “Reps for Bench Press”, “Weight”, “Target
weight”), or associate the visible label via `nativeID`/`accessibilityLabelledBy`.

#### G114 — The calculator's bar chips are not buttons to a screen reader
**P3.** `ToolsScreen` maps `BARS` to `<Text onPress={() => setBar(b)}>` with no `accessibilityRole` or selected state;
the kg/lb toggle above uses `role="tab"`, so the pattern is inconsistent. A TalkBack user cannot tell the chips are
tappable or which bar is selected.
**Evidence:** `ToolsScreen`'s bar-chip map; the unit toggle's `accessibilityRole="tab"`.
**Direction:** use `Press` with `accessibilityRole="button"` and `accessibilityState={{ selected: barWeight === b }}`.

#### G117 — The template card hides its own contents from TalkBack
**P3.** The card's `Press` sets `accessibilityLabel={card.routine.name}`, which overrides its children; the summary
(“5 × Bench Press, 5 × …”) and the “last done” line are never announced. A screen-reader user hears only “Push,
button”, then a separate “Template options” target inside it.
**Evidence:** `parts.tsx` `TemplateCard`'s `accessibilityLabel`; the summary and last-done `Text`s are children.
**Direction:** include the summary and last done in the label, or drop the custom label and let the children read.

### J. Language and copy

#### G79 — The gym is English-only in an app with 8 locales
**P1 for non-English users.** Only `src/i18n/locales/en/gym.json` exists; `de`, `es`, `fr`, `it`, `pl`, `pt-BR`, `ru`
have no `gym` namespace. The whole tab, including error and destructive copy, falls back to English.
**Direction:** translate the namespace (at least the destructive/import strings first) or ship a language note.

#### G80 — Equipment is untranslated
**P2.** `{exercise.equipment}` prints the raw enum; see G38. Add `equipment.*` keys.

#### G81 — Plurals are missing
**P3.** `history.total` (“1 workouts”), `records.sets` (“1 sets”), `exercise.setsTotal`, `import.done/duplicates/
undoBody`, `home.templates` all use a single `{{count}}` string. `session.setsCount` already shows the `_one/_other`
pattern to copy.

#### G82 — Hardcoded user-visible strings
**P3.** Default workout name “Workout” (`startSession`), “0 min” (G66), “Rest timer” (G70), the equipment enums (G80).
Numbers use `.` as the decimal separator everywhere (`loadText`), which reads wrong in `it`/`pt-BR` if the tab is ever
translated.

### K. Performance and scale

#### G83 — History and records render every row in one card
**P3 after the 2-year pass.** The data layer holds up (79 ms worst case), but `HistoryScreen` maps every finished
session and `RecordsScreen` every record into a single `Card`; years of lifting means hundreds of rows mounted and
measured at once. Use a virtualized list (or paginate) before that mount cost becomes visible.

#### G84 — The picker renders all 193 exercises at once
**P2.** See G36. Even at 193 it is the heaviest list in the app, and it mounts inside the page scroll.

#### G85 — The session timer re-renders the form every second
**P3 after the 2-year pass.** See G20; the data reads are cheap, but a 30-set workout still has ~30 `TextInput`s
reconciling every second just to move the clock. Isolate the clock; then re-measure on a low-end device.

### L. Data safety and portability

#### G86 — There is no gym export, and “Delete everything” implies Health Connect keeps a copy
**P1 · silent permanent loss of the owner's writing.** `exportFile` supports only `daily` and `journal`; the gym has
no CSV/JSON export or backup. The delete dialog says “Health Connect keeps its own copy” — true for health data, false
for the gym, which never touches Health Connect. It also points to “More › Your data”, where the gym is absent.
**Direction:** add a gym export (sessions/sets/templates/measurements) next to the journal export, and make the
delete copy say the gym is only on this phone and is not in Health Connect.

#### G87 — Ticking a prefilled set rounds the stored weight
**P1 · slow data drift, worst for imported lb data.** `loadText` snaps to 0.5 kg / 1 lb; the field shows that snapped
value and the tick saves it. A stored 62.25 kg displays 62.5 and becomes 62.5; 137.5 lb (62.37 kg) displays 138 lb and
becomes 62.6 kg.
**Evidence:** probe `{ stored: 62.25, shown: "62.5", ticked: 62.5 }`; `{ storedKg: 62.37, shown: "138", tickedKg:
62.5957 }`.
**Direction:** display the stored value exactly (trim, don't snap); use the step only for +/− controls, or store the
displayed value intentionally and say so.

#### G88 — A failed import has no undo marker
**P2.** See G42. If the process dies between the first session write and `putGymImport`, the rows are unmarked and
“Undo last import” does not know about them.

#### G89 — The undo toast is replaced by the next toast
**P3.** Deleting two sets quickly keeps only the second undo (the code documents the trade-off). A small undo queue,
or a longer-lived “Undo” banner in the session, would let a multi-delete be reversed.

#### G121 — There is no way to clear the gym log without wiping the app
**P3 · starting the gym fresh means deleting everything.** `Store.clearGym` exists and is only called by `reset()`
(Delete everything), which also removes health data, the profile and settings. A user who wants to start the gym log
over must delete sessions one at a time (and templates/measurements separately), or wipe the whole app.
**Evidence:** `clearGym` in `src/data/store.ts`; only `reset()` in `src/state/app.ts`; More › Gym has no clear action.
**Direction:** a “Clear gym history” (and/or “Delete all gym data”) action in a Gym settings/More section with a typed
confirm, separate from the health wipe.

### N. Reliability

#### G129 — A failed gym read looks like a screen that never loads
**P3 · the error state is never shown.** `useScreen` returns `{ data, error, loading, reload }`, but every gym screen
destructures only `{ data }` (eight screens). A SQLite/read exception therefore leaves `GymHome` and the history on
their skeletons, and the session/routine not-found states only trigger on `data === null` — an error yields
`undefined`, not `null` — with no message and no Retry. The `reload` the cache already returns is never surfaced.
**Evidence:** `useScreen`'s `ScreenState`; `grep 'const { data } = useScreen' src/screens/gym/*.tsx` → 8; `GymHome`'s
`!data ? <GymSkeleton />`.
**Direction:** a shared gym error card with Retry (`reload`), rendered when `error` is set.

### M. Docs vs build

#### G90 — `docs/gym.md` is already stale
**P3.** It says “My Templates in a two-column grid” (the list is one wide column) and “The rest timer is in-app only:
no notification when the phone is in another app or asleep” (the uncommitted work adds a notification). The tracking
section also predates the undo toasts, move/superset controls and the save-as-template flow.
**Direction:** update the screen table, the tracking bullets and Limits after the current round lands.

#### G91 — `GymHome` still says “two-column grid” in its header comment
**P3.** Same drift as G90; the comment sits above the single-column `gap-3` list.

## Live tree re-check (21:10 IST)

The parallel editor fixed most of the P0/P1s between the snapshot and this pass. **“Fixed in live tree” below means
checked in the current files at 21:10**, not just inferred from the diff:

| Finding | Live tree |
|---|---|
| G01 picker listener | **Fixed** — `pending.ts` keeps subscribers until unmount; new `pending.test.ts` covers two picks. |
| G04 weight with 0 reps | **Fixed** — the tick needs reps or seconds/distance. |
| G10 set-details autofocus | **Fixed** — `NoteDialog` no longer autofocuses the note. |
| G12 haptic on tick | **Fixed** — `haptic.tap()` on a successful tick. |
| G14 rest after the last set | **Fixed** — starts only when an unticked set remains. |
| G17 rest bar denominator | **Fixed** — the bar keeps the total it opened with and animates the fill. |
| G21 deleted session | **Fixed** — a “This workout was deleted” card instead of a permanent skeleton. |
| G28 template start while active | **Fixed** — checks `activeSession`, toasts and opens the running workout. |
| G35 empty search copy | **Fixed** — `exercise.noMatches`. |
| G39 new-exercise autofocus | **Fixed** — the keyboard no longer covers the body-part pills on open. |
| G41 import/template link | **Fixed** — `buildRoutinesFrom` points the newest imported session at an existing routine. |
| G43 all-duplicates import | **Fixed** — the Import button is disabled and a “Choose another file” is offered. |
| G44 generic import error | **Fixed** — empty / not-Strong / nothing-new each has its own copy. |
| G45 import set count | **Fixed** — the outcome reports `writtenSets`. |
| G48 bodyweight page | **Fixed** — a Bodyweight card with sets and reps instead of “no sets yet”. |
| G49 “was” misleading | **Fixed by relabel** — it now says “2nd best”; there is still no chronological PR timeline. |
| G50 exercise volume label | **Fixed** — the tile says Volume and the set count is the aside. |
| G55 unticked exercises in a history row | **Fixed** — `cardOf` filters to completed sets. |
| G57 deleted routine | **Fixed** — a “This template was deleted” card. |
| G58 calculator unit switch | **Fixed** — weight and target convert on kg/lb. |
| G61 invalid measurement | **Fixed** — Save is disabled until the value is 0 < x ≤ 1000. |
| G63 Gym tab clock | **Fixed** — `useNow(!!active)`. |
| G64 zero week tiles | **Fixed** — the last-7-days block is hidden until there is a session. |
| G65 week sets/warmups | **Fixed** — the count uses `isWorkSet`. |
| G66 “0 min” | **Fixed** — the block is hidden at zero and `lengthText` is used. |
| G69 notification failure | **Partial** — a one-time “Allow notifications…” toast was added, but it has no action and the check is a scheduling failure rather than the permission state (G100). |
| G70 channel name | **Fixed** — the channel name is now `gym:session.restChannel`, not a hardcoded English string. |
| G71 rest notification after reset | **Fixed** — `reset()` calls `cancelRest`. |
| G72 input accessible names | **Fixed** — each `NumCell` gets “Set N weight/reps/seconds/km”. |
| G87 displayed-weight rounding | **Fixed** — `loadText` no longer snaps; the step is only for controls. |
| G90 stale docs | **Fixed** — `docs/gym.md` now matches one column, the notification and the import link. |
| G91 stale comment | **Fixed** — “one wide column”. |
| G03 unticked finish | **Partial** — the confirm now says “N sets are not ticked and will be left out of the history”; the rows are still invisible in every view. |
| G02 superset rest | **Open** — the `waiting` rule is unchanged, and `docs/gym.md` now documents it as intended. |
| G05 rest per template | **Open** — `DEFAULT_REST = 90`; `rest_sec` is still written but never read. |
| G79 gym translations | **Open** — still only `en/gym.json`. |
| G86 gym export | **Open** — `ExportKind` is still `daily` and `journal` only. |

`pnpm typecheck` and the three gym test files (39 tests, including the new `pending.test.ts`) pass at 21:14. The
emulator was attempted again at 21:12, 21:42, 22:42, 23:12, 23:41, 00:11, 00:39, 01:11, 01:40, 02:11, 02:41, 03:11,
03:41 and 04:10; `open in.portlabs.pulse` still returns `DEVICE_IN_USE` for session `t3-4e1612537268e934e5722f2a`, so
the device pass is skipped per the no-close rule.

### New findings from this pass

#### G92 — Light-mode blue text fails contrast
**P2 · accessibility.** The palette's `strain` is 3.32:1 on `card`, 2.82:1 on `background` and 2.69:1 on `secondary` —
below AA 4.5:1 for normal text, and the secondary case is below 3:1 even for a UI component. The palette already has
`strain-text` at 4.78:1 on card. The gym uses `text-strain` for the 11 px “Workout in progress”, the 10 px “PR”, the
12 px “+%”, the 12 px “ADD SET” link and the play icon in the dashboard's `bg-secondary` circle.
**Evidence:** WCAG calculation over `src/ui/palette.ts` (light `strain` `#0093e7`, `strain-text` `#0077bf`).
**Direction:** use `text-strain-text` (or a darker token) for small text and the icon on secondary; keep `strain` for
fills, chart strokes and large numerals.

#### G93 — The largest Android font scale breaks the set grid
**P2 · accessibility, needs device.** The set row is a fixed 32 px number + flexible previous + 62 px weight + 54 px
reps + 32 px tick; the inputs are `h-9` with 15 px text, the type/RPE/measurement pills are `h-8`/`h-9` with 12 px
text. At the system's 200% font scale the weight cell renders 30 px text: “100.5” no longer fits 62 px, and the pills'
32 px line box clips ascenders/descenders. The template editor's 44 px sets/reps cells clip a 3-digit rep count, and
the calculator's 56 px bar chips clip “20 kg” at 26 px. There is no `maxFontSizeMultiplier` or reflow.
**Evidence:** classes in `SessionScreen.SetRow`/`NumCell`, `NoteDialog`, `RoutineScreen`'s `h-9 w-11` inputs,
`ToolsScreen`'s bar chips, `MeasurementsScreen`.
**Direction:** flexible/min-width cells, two-line rows or a horizontal scroll for the set table, and cap numeric font
scaling; test with `settings text-size` once the emulator is free.

#### G94 — A rest extended with +15 leaves the next rest's bar with the old total
**P3 · regression in the G17 fix.** `RestBar` captures `useState(total)` on mount; if the user presses +15 and then
ticks another set before the rest ends, `startRest` resets `restSec` to 90 but the bar keeps 105 — it opens at 86% and
animates from the old share (`mounted` never resets).
**Direction:** key the bar by `restStartedTs`, or derive the total from the current session rest rather than a captured
state.

#### G95 — The “sets are not ticked” warning counts blank rows and warmups
**P3 · warning fatigue.** `pending` counts every `!completed` set. A 5-set template where the user did 3 always warns
“2 sets are not ticked”, even when the last two were never touched; warmups are included. The copy also uses
“{{count}} sets” with no plural (`1 sets`).
**Direction:** count rows that carry a weight, reps, seconds or distance; mention warmups separately; add `_one/_other`.

#### G96 — The finish warning is two concatenated sentences
**P3 · i18n.** The dialog builds `${t("finishBody")} ${t("finishPending")}`; a translator cannot reorder the clauses or
inflect the second one to fit the first.
**Direction:** one key with an optional pending clause, or a second paragraph in the dialog.

## Performance pass (2 years)

Seeded 521 sessions / 9,378 sets over 730 days on `MemoryStore` and timed the real view models:

| Read | Time |
|---|---|
| `getGymHome` | 32.2 ms |
| `getGymHistory` | 79.3 ms |
| `getGymExercise` | 2.7 ms |
| `getGymRecords` | 21.8 ms |
| `getGymPicker` | 32.0 ms |
| `getGymSession` | 3.4 ms |

There are indexes for `gym_sets(session_id, position, set_no)` and `gym_sets(exercise_id, ts)`, and each page reads the
full set table once (or the exercise/session slice) — no per-session N+1. **Conclusion:** the data layer is not the
bottleneck at two years. The risks left are the non-virtualized UI lists (G83, G84) and the per-second session render
(G85), so G83/G85 are downgraded to P3 and G84 stays P2. This needs an on-device SQLite run to confirm the row-mapping
cost, but the 79 ms worst case leaves headroom.

## Coverage

| Area | Status |
|---|---|
| Session tracking | Reviewed, logic probed; G02/G05 open, G03 partial, G102/G104/G112/G119/G124/G126/G128 new |
| Templates editor | Reviewed; G05/G25/G26/G27 open, G101/G105 new |
| Picker and custom exercises | Reviewed; G33/G34/G40 open; G107–G109/G120/G122/G125/G131 new |
| Import and undo | Reviewed; 14k synthetic pass; G41/G43/G44/G45 fixed; G42 measured; G97/G98/G127 new; G46/G47 open |
| History / records / exercise page | Reviewed; G48/G49/G50/G55 fixed; G83/G85 downgraded; G106/G116/G132 new |
| Measurements and calculators | Reviewed; G58/G61 fixed; G59/G60/G62/G103/G123 open |
| Gym tab | Reviewed; G63/G64/G65/G66 fixed; G110/G111/G118/G130 new |
| First run / onboarding | Reviewed; G110 new (no import prompt, onboarding omits the gym) |
| Rest timer and notifications | Reviewed from code; G69 partial, G70/G71 fixed; G16/G94/G100/G115 open; needs device |
| Accessibility and touch | Reviewed; G72 fixed; G73–G79/G92/G93/G99/G113/G114/G117 open; large text needs device |
| i18n and copy | Reviewed; G79 open; G81/G82/G95/G96 open |
| Performance and long history | 2-year seed done (521 sessions / 9,378 sets); no N+1, G83/G85 downgraded |
| Data safety / export | Reviewed; G86/G121 open |
| Reliability | Reviewed; G129 new (query errors never shown) |
| Dark/light and large text | Contrast checked (G92/G99); large-text classes checked (G93); remaining visual pass needs device |
| Device layout / keyboard / notification | Blocked (emulator lease still held) |
| Re-check against the live tree | Done for P0/P1: ~31 fixed, G02/G05/G79/G86/G97 open, G03/G69 partial |

## What the probes actually did

On `MemoryStore`, with the real actions and queries:

1. Seeded a prior Push session (100×5, 100×5, 80×10 drop), started the Push template again and read the prefill.
2. Set a template item to 0 sets and started it.
3. Ticked a 100 kg × 0 rep set and finished; read the home/history.
4. Ticked 1 of 3 sets, finished, and compared the DB rows with the history and session view models.
5. Linked bench + overhead press as a superset and applied the screen's exact tick rule to A1…A3, B1…B3.
6. Subscribed to the picker listener, emitted once, then checked `hasPickerListener()`.
7. Wrote 110×5 (90 days ago), 100×5 (7 days ago), 120×3 (yesterday), read `record` and `previousRecord`.
8. Finished a session with a warmup + a work set and read the week totals.
9. Pre-created a “Push” template, imported a Strong CSV with a Push session, read `routineId` and `lastTs`.
10. Logged push-ups at bodyweight and read the exercise page.
11. Printed `loadText`/`fromUnit` for 62.25 kg and 137.5 lb.
12. Re-checked the live tree after the parallel edits, diffing the snapshot against the current screens/actions.
13. Seeded 521 sessions / 9,378 sets over two years and timed `getGymHome`, `getGymHistory`, `getGymExercise`,
    `getGymRecords`, `getGymPicker` and `getGymSession`; checked the SQLite indexes.
14. Computed WCAG contrast for the light/dark `strain`, `strain-text`, `muted-foreground` and destructive pairs.
15. Generated a 14,295-line / 1.3 MB Strong export (509 workouts, 14,252 sets, notes, rest-timer rows, cardio,
    holds, unknown names, capped durations) and ran preview → import → re-preview → re-import → undo, timing each;
    also imported a `Weight (lbs)` file and read the exercise page.
16. Re-ran the live typecheck and the three gym test files (39 tests) after the parallel edits.
17. Computed non-text contrast for the set cells, tick ring and separators in both themes, and traced the rest
    notification permission path from `SessionScreen.tick` through `scheduleRest` to the Settings-only request.
18. Persisted the same brand-new template twice through the real `saveRoutine` (as the still-`new` editor does) and
    read `getGymHome`: two “Push” routines, two cards; starting one leaves the other orphaned.
19. Read the session exercise menu, the picker's `sessionId` path and the Tools screen for the replace-exercise and
    mid-workout plate-calculator gaps.
20. Started a session three days ago and finished it now (72 h); started a Plank/Treadmill template and read the
    generated sets; finished a 5 km treadmill and a 60 s plank and read their exercise pages.
21. Searched the catalogue for 43 common terms (abbreviations, body parts) and 38 common lifts; recorded the
    zero-result terms and the names with no catalogue entry.
22. Read the first-run Gym empty state, the onboarding headings and the template sort: no import prompt, onboarding
    omits the gym, and templates are ordered by most-recently-trained rather than next-up.
23. Extracted 195 static `t()` keys from the gym screens and compared them with `gym.json`: no missing static keys
    (only the expected `common:actions.cancel` and the `setsCount` plural base). Audited every gym `Input` usage for
    labels and the calculator's bar chips for roles.
24. Imported two different workout names at the same start instant (both write; the duplicate-key hypothesis was
    wrong) and compared a 23:00 UTC-5 workout's UTC date with its local day (`2026-11-02` vs `2026-11-01`); read the
    template card's label and frozen `now` state.
25. Searched for keep-awake usage (none in the gym), the exercise-note field (types only, no UI), `clearGym` call
    sites (`reset` only), and the assisted catalogue entries.
26. Read the measurement add form and rename/notes dialogs for keyboard avoidance, and the superset menu /
    `moveExercise` for pairing integrity.
27. Read the picker's `pick` path and the set tick for double-tap guards (none), including the check-then-write
    `startSession` path from the Gym tab.
28. Compared `ImportSummary`'s fields with the import screen's stat tiles (skipped rows, custom names, templates not
    shown) and read `SessionScreen`'s `useNow()` call for a finished session.
29. Read `useScreen`'s error return against the eight gym screens, and `getGymHome.active`'s unused `exercises`/
    `volumeKg` against the active-workout card.
30. Compared `getGymPicker`'s `custom` field with `PickerScreen` (unused) and read `ExerciseScreen`'s action/footer
    surface (none).

## Loop plan

The audit continues in 30-minute passes until ~04:30 IST (8 hours from the first pass), then stops. Each pass takes
the next unchecked area, adds findings with evidence, and updates this table. Areas left: the remaining dark/light
visual pass and large-text device check, device layout/keyboard/notification, and a final re-check of the open P1s
(G02/G05/G79/G86/G97) and the partial G03/G69 after the parallel edits settle.

When the audit is complete, delete the scheduled task titled **“Gym UX audit loop”**.
