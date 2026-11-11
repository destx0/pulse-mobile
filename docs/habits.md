# Habits

Pulse's habit tracker (`/habits`), in the Journal's old place. It is modelled on Loop Habit Tracker
([iSoron/uhabits](https://github.com/iSoron/uhabits)): a daily list of habits, a strength score per habit, streaks,
a history calendar, and Android home-screen widgets.

## What a habit is

A habit is yes/no (did it or not) or numeric (an amount), with a target per period:

- **Period** `day`, `week` (Monday to Sunday) or `month`.
- **Target** a number of times per period for yes/no, an amount per period for numeric. `targetType` is `at_least` or
  `at_most` (numeric only).
- **Entry** one per habit per day: yes/no `1`/`0`, numeric the amount, and `skip` for a day that is not counted. No row
  means unknown.
- **Colour** one of the palette keys, and **archive** to take a habit out of the daily list without deleting its history.

The schema is `habits` and `habit_entries` in `src/data/db.ts`; everything talks to it through the `Store` interface. Like
the gym, habits are the owner's own local data: no health source imports or exports them, and `clearAll` (a source switch)
leaves them. "Delete everything" clears them through `clearHabits()`.

## The score

`src/core/habits/logic.ts` ports Loop's `models/Score.kt`, `ScoreList.kt` and `StreakList.kt`:

- `multiplier = 0.5 ^ (sqrt(frequency) / 13)`, where frequency is `target / daysInPeriod` for yes/no and
  `1 / daysInPeriod` for numeric (the target amount does not change how fast the score moves).
- A yes/no habit counts its done days in a window of the period. Weekly and monthly habits double the window and the
  target, as Loop does, so one done day does not jolt a weekly score.
- A numeric habit sums its amounts in the period window. `at_most` turns the share around: at the limit the share is 0.
- `score = previous * multiplier + share * (1 - multiplier)`. Skips leave the score and the window untouched.
- Completion is the period total against the target. Streaks count consecutive completed periods (days, weeks or
  months) and ignore the current unfinished period when it is not met yet.

The score is computed on read: a habit's card and detail need a few hundred days at most, and nothing is stored that a
change to the formula would make stale.

## Screens

- `/habits` — the summary and one card per habit: strength ring, today's tick, the last seven days, a menu for edit,
  skip, archive and delete. Tapping a day ticks it (yes/no) or opens the amount dialog (numeric).
- `/habits/[id]` — the large strength ring, current and best streaks, the last 20 weeks as a calendar, the 90-day score
  curve, the question and notes.
- `/habits/edit` — new/edit form: name, question, type, colour, period, target, unit, at least/at most, notes.

The old Journal is retired from normal navigation: its Home card, the round check-in action, the More group and the
Coach check-in link are gone. The `/journal` route still exists for old links, but nothing links to it.

## Widgets

Five widgets are declared in `app.json` through the `react-native-android-widget` config plugin. Expo SDK 57's
`expo-widgets` is iOS-only, so this app uses the community library, whose widgets are RemoteViews drawn from JS.

| Widget | Size | What it shows | Tap |
|---|---|---|---|
| `HabitCheck` | 2×2 | name, big tick (or amount), score | tick toggles a yes/no day in place; numeric opens the habit |
| `HabitScore` | 4×2 | score, streak, 30-day curve | opens the habit |
| `HabitStreak` | 2×2 | current and best streak | opens the habit |
| `HabitHistory` | 4×3 | ten weeks of days | opens the habit |
| `HabitToday` | 4×3 | today's habits, done/total | each tick toggles; a row opens the habit |

The four per-habit widgets are configurable: adding one opens `src/widgets/config.tsx`, which lists the active habits
and stores `pulse.habitWidget.<widgetId> = <habitId>` in AsyncStorage. Long-pressing a widget reopens that screen.

`src/widgets/task.tsx` is the headless task handler. It opens the same SQLite store, toggles the day for a `toggle`
click, and redraws the widget. `src/widgets/update.ts` redraws every habit widget after a write in the app through the
habit screens' `habitsChanged()` (`src/state/habits.ts`). Android refreshes them at most every 30 minutes on its own
(`updatePeriodMillis`), and a widget redraws when its day changes on the next click or scheduled update.

Add a widget from the Android launcher's widget picker (long-press the home screen → Widgets → Pulse). Deleting a widget
removes its stored habit choice; deleting a habit leaves the widget showing "Choose a habit".

## Tests

`src/core/habits/logic.test.ts` pins the score to Loop's published values (0.655747 after 20 daily ticks, 0.596033 with
three skips), weekly completion, numeric targets and streaks. `src/actions/habits.test.ts` covers the writes, and
`src/data/db.contract.test.ts` runs the SQLite round-trip.
