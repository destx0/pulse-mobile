// The habit logic, ported from Loop Habit Tracker (iSoron/uhabits, models/Score.kt, ScoreList.kt, StreakList.kt): the
// exponential "habit strength" score, period completion and streaks. Pure TypeScript: tests run in Node, and the
// home-screen widget bundle can use it without React.
import { addDays, daysBetween } from "@/lib/time";
import type { Habit, HabitEntry, HabitPeriod } from "./types";

/** A week runs Monday to Sunday, as Loop's history chart does. */
export function periodStart(day: string, period: HabitPeriod): string {
  if (period === "day") return day;
  if (period === "month") return `${day.slice(0, 7)}-01`;
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

export function periodEnd(day: string, period: HabitPeriod): string {
  if (period === "day") return day;
  if (period === "week") return addDays(periodStart(day, "week"), 6);
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** The first day of the next period. */
export function nextPeriod(day: string, period: HabitPeriod): string {
  if (period === "day") return addDays(day, 1);
  if (period === "week") return addDays(periodStart(day, "week"), 7);
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

/** Days a period is worth in the score formula; months use 30 as Loop does. */
export const periodDays = (period: HabitPeriod) => (period === "day" ? 1 : period === "week" ? 7 : 30);

export function entryMap(entries: readonly HabitEntry[]): Map<string, HabitEntry> {
  return new Map(entries.map((e) => [e.day, e]));
}

export type DayState = { state: "empty" | "done" | "no" | "skip"; value: number | null };

/** What one day shows: no entry, done, not done, or skipped. Numeric days carry their amount. */
export function dayState(habit: Habit, entries: Map<string, HabitEntry>, day: string): DayState {
  const e = entries.get(day);
  if (!e) return { state: "empty", value: null };
  if (e.skip) return { state: "skip", value: e.value };
  if (habit.kind === "numeric") return { state: "done", value: e.value };
  return e.value > 0 ? { state: "done", value: e.value } : { state: "no", value: 0 };
}

export type PeriodSummary = {
  start: string;
  end: string;
  /** Done count for yes/no, amount for numeric, skips left out. */
  sum: number;
  target: number;
  /** Whether any non-skipped entry falls in the period. */
  hasData: boolean;
  completed: boolean;
};

/** A period's total against its target: the card's "3/7 this week", the streak's step and the summary's count. */
export function periodSummary(habit: Habit, entries: Map<string, HabitEntry>, day: string): PeriodSummary {
  const start = periodStart(day, habit.period);
  const end = periodEnd(day, habit.period);
  let sum = 0;
  let hasData = false;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const e = entries.get(d);
    if (!e || e.skip) continue;
    hasData = true;
    sum += habit.kind === "yes_no" ? (e.value > 0 ? 1 : 0) : Math.max(0, e.value);
  }
  const completed = habit.targetType === "at_most" ? sum <= habit.target + 1e-9 : sum >= habit.target - 1e-9;
  return { start, end, sum, target: habit.target, hasData, completed };
}

/**
 * The score's multiplier (Score.compute): a day with nothing done pulls the score down, a completed day pulls it up,
 * and the weight of today grows with the frequency. 3 times a week moves more slowly than every day.
 */
const multiplierOf = (habit: Habit) => Math.pow(0.5, Math.sqrt((habit.kind === "numeric" ? 1 / periodDays(habit.period) : habit.target / periodDays(habit.period))) / 13);

/**
 * The daily habit-strength score over [from, to], 0 to 1, one value per day. The series is warmed up from up to 400
 * days earlier so the first requested day is not artificially low.
 *
 * Yes/no habits count done days in a window of the period (doubled for weekly and monthly habits, as Loop does, so
 * the day a weekly habit is done does not jolt the score). Numeric habits sum their amount in that window. Skips take
 * the day out of both the window and the score.
 */
export function scoreSeries(habit: Habit, entries: Map<string, HabitEntry>, from: string, to: string): Map<string, number> {
  const values = new Map<string, number>();
  if (from > to) return values;
  for (let day = from; day <= to; day = addDays(day, 1)) values.set(day, 0);
  const earliest = [...entries.keys()].sort()[0];
  const warm = addDays(from, -400);
  const start = earliest && earliest > warm ? earliest : warm;
  const yesNo = habit.kind === "yes_no";
  const freq = yesNo ? habit.target / periodDays(habit.period) : 1 / periodDays(habit.period);
  const windowLength = yesNo && freq < 1 ? periodDays(habit.period) * 2 : periodDays(habit.period);
  const windowTarget = yesNo && freq < 1 ? habit.target * 2 : habit.target;
  const multiplier = multiplierOf(habit);
  const queue: number[] = [];
  let previous = habit.kind === "numeric" && habit.targetType === "at_most" ? 1 : 0;
  for (let day = start; day <= to; day = addDays(day, 1)) {
    const e = entries.get(day);
    if (!e || e.skip) {
      if (day >= from) values.set(day, previous);
      continue;
    }
    const value = yesNo ? (e.value > 0 ? 1 : 0) : Math.max(0, e.value);
    queue.push(value);
    if (queue.length > windowLength) queue.shift();
    const sum = queue.reduce((a, b) => a + b, 0);
    let share: number;
    if (windowTarget <= 0) share = 1;
    else if (habit.targetType === "at_most") share = Math.max(0, Math.min(1, 1 - (sum - windowTarget) / windowTarget));
    else share = Math.min(1, sum / windowTarget);
    previous = previous * multiplier + share * (1 - multiplier);
    if (day >= from) values.set(day, previous);
  }
  return values;
}

/** The score on one day. */
export function scoreOn(habit: Habit, entries: Map<string, HabitEntry>, day: string): number {
  return scoreSeries(habit, entries, day, day).get(day) ?? 0;
}

/**
 * Current and best streaks in periods: days for a daily habit, weeks for a weekly one, months for a monthly one. A
 * period counts when it met its target and had an entry; the current, unfinished period does not break a streak yet.
 */
export function streaks(habit: Habit, entries: Map<string, HabitEntry>, today: string): { current: number; best: number } {
  const days = [...entries.keys()].sort();
  if (!days.length) return { current: 0, best: 0 };
  const first = periodStart(days[0], habit.period);
  const last = periodStart(today, habit.period);
  const done: boolean[] = [];
  let d = first;
  while (d <= last) {
    const summary = periodSummary(habit, entries, d);
    done.push(summary.completed && summary.hasData);
    d = nextPeriod(d, habit.period);
  }
  let current = 0;
  let i = done.length - 1;
  if (!done[i]) i--;
  while (i >= 0 && done[i]) {
    current++;
    i--;
  }
  let best = 0;
  let run = 0;
  for (const ok of done) {
    run = ok ? run + 1 : 0;
    if (run > best) best = run;
  }
  return { current, best };
}

export type HabitStats = {
  /** 0 to 1: Loop's habit strength today. */
  score: number;
  current: number;
  best: number;
  today: DayState;
  period: PeriodSummary;
  /** The current period is met (a weekly habit may be done without an entry today). */
  done: boolean;
};

export function habitStats(habit: Habit, all: readonly HabitEntry[], today: string): HabitStats {
  const entries = entryMap(all.filter((e) => e.habitId === habit.id));
  const summary = periodSummary(habit, entries, today);
  const streak = streaks(habit, entries, today);
  return {
    score: scoreOn(habit, entries, today),
    current: streak.current,
    best: streak.best,
    today: dayState(habit, entries, today),
    period: summary,
    done: summary.completed && summary.hasData,
  };
}

/** The last `count` days ending on `to`, oldest first (the card's week row). */
export function lastDays(to: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(to, i - count + 1));
}

/** `daysBetween` re-exported for the history chart's range maths. */
export { daysBetween };
