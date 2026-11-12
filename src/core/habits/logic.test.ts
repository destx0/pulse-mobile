import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/time";
import type { Habit, HabitEntry } from "./types";
import { dayState, habitStats, periodSummary, periodStart, scoreOn, scoreSeries, streaks } from "./logic";

const TODAY = "2026-11-02";
const habit = (over: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Read",
  question: null,
  notes: null,
  kind: "yes_no",
  color: "optimal",
  period: "day",
  intervalDays: 1,
  weekdaysOnly: false,
  startDay: "2026-01-01",
  target: 1,
  targetType: "at_least",
  unit: null,
  position: 0,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});
const entry = (day: string, value = 1, skip = false): HabitEntry => ({ habitId: "h1", day, value, skip, note: null, updatedAt: 0 });
const map = (entries: HabitEntry[]) => new Map(entries.map((e) => [e.day, e]));

describe("the Loop score", () => {
  it("matches Loop's daily value after 20 done days", () => {
    const h = habit();
    const entries = map(Array.from({ length: 20 }, (_, i) => entry(addDays(TODAY, -i))));
    expect(scoreOn(h, entries, TODAY)).toBeCloseTo(0.655747, 5);
  });

  it("does not let a skipped day pull the score or age the window", () => {
    const h = habit();
    const entries = map([...Array.from({ length: 20 }, (_, i) => entry(addDays(TODAY, -i), 1, [5, 10, 11].includes(i)))]);
    expect(scoreOn(h, entries, TODAY)).toBeCloseTo(0.596033, 5);
  });

  it("rises faster for a daily habit than for a weekly one", () => {
    const daily = habit();
    const weekly = habit({ period: "week", target: 3 });
    const days = Array.from({ length: 20 }, (_, i) => entry(addDays(TODAY, -i)));
    expect(scoreOn(daily, map(days), TODAY)).toBeGreaterThan(scoreOn(weekly, map(days), TODAY));
  });

  it("keeps one score per day in a series", () => {
    const h = habit();
    const entries = map([entry(TODAY), entry(addDays(TODAY, -1))]);
    const series = scoreSeries(h, entries, addDays(TODAY, -6), TODAY);
    expect([...series.keys()]).toHaveLength(7);
    expect(series.get(TODAY)).toBeCloseTo(0.101149, 5);
  });
});

describe("periods and targets", () => {
  it("counts three entries in a week as a completed 3-times-a-week habit", () => {
    const h = habit({ period: "week", target: 3 });
    const monday = "2026-10-26";
    const entries = map([monday, addDays(monday, 2), addDays(monday, 4)].map((d) => entry(d)));
    expect(periodSummary(h, entries, "2026-10-30")).toMatchObject({ start: monday, sum: 3, target: 3, completed: true, hasData: true });
  });

  it("blocks an every-N-days habit from its start day", () => {
    const h = habit({ period: "interval", intervalDays: 3, startDay: "2026-11-01", target: 1 });
    expect(periodStart(h, "2026-11-06")).toBe("2026-11-04");
    expect(periodSummary(h, map([entry("2026-11-05")]), "2026-11-05")).toMatchObject({ start: "2026-11-04", end: "2026-11-06", sum: 1, completed: true });
    expect(streaks(h, map([entry("2026-11-01"), entry("2026-11-04")]), "2026-11-05")).toMatchObject({ current: 2, best: 2 });
  });

  it("leaves the weekend out of a weekdays-only habit", () => {
    const h = habit({ weekdaysOnly: true });
    expect(dayState(h, map([]), "2026-10-31")).toEqual({ state: "off", value: null });
    expect(periodSummary(h, map([]), "2026-10-31")).toMatchObject({ hasData: false, completed: false });
    expect(streaks(h, map([entry("2026-10-30"), entry("2026-11-02")]), TODAY)).toMatchObject({ current: 2, best: 2 });
  });

  it("completes a numeric daily habit when the amount reaches its target", () => {
    const h = habit({ kind: "numeric", target: 8, unit: "glasses" });
    const entries = map([entry(TODAY, 4), entry(addDays(TODAY, -1), 5)]);
    expect(periodSummary(h, entries, TODAY)).toMatchObject({ sum: 4, target: 8, completed: false });
    expect(periodSummary(h, map([entry(TODAY, 8)]), TODAY)).toMatchObject({ sum: 8, completed: true });
  });

  it("treats an at-most numeric day above the limit as not completed", () => {
    const h = habit({ kind: "numeric", target: 2, targetType: "at_most", unit: "coffees" });
    expect(periodSummary(h, map([entry(TODAY, 2)]), TODAY).completed).toBe(true);
    expect(periodSummary(h, map([entry(TODAY, 3)]), TODAY).completed).toBe(false);
  });
});

describe("streaks", () => {
  it("counts consecutive done days and keeps the best", () => {
    const h = habit();
    const entries = map([entry(TODAY), entry(addDays(TODAY, -2)), entry(addDays(TODAY, -3)), entry(addDays(TODAY, -4))]);
    expect(streaks(h, entries, TODAY)).toEqual({ current: 1, best: 3 });
  });

  it("counts complete weeks for a weekly habit", () => {
    const h = habit({ period: "week", target: 2 });
    const thisMonday = "2026-11-02";
    const lastMonday = "2026-10-26";
    const entries = map([entry(thisMonday), entry(addDays(thisMonday, 1)), entry(lastMonday), entry(addDays(lastMonday, 3))]);
    expect(streaks(h, entries, TODAY)).toEqual({ current: 2, best: 2 });
  });

  it("summarises a habit for its card", () => {
    const h = habit({ kind: "numeric", target: 8, unit: "glasses" });
    const stats = habitStats(h, [entry(TODAY, 8)], TODAY);
    expect(stats.done).toBe(true);
    expect(stats.today).toEqual({ state: "done", value: 8 });
    expect(stats.score).toBeCloseTo(0.051922, 5);
  });
});
