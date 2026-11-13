import { describe, expect, it } from "vitest";
import type { Habit } from "@/core/habits/types";
import { openMemoryStore } from "@/data/memory";
import type { Store } from "@/data/store";
import type { QueryCtx } from "./ctx";
import { getHabits, habitCards } from "./habits";

const TODAY = "2026-11-12";
const PROFILE = { birthDate: "1990-01-01", sex: "male" as const, maxHr: null, heightCm: null, timeZone: "UTC" };
const habit: Habit = {
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
};

describe("the habits list's day grid", () => {
  it("returns the requested days newest first, today's tick included", () => {
    const [card] = habitCards([habit], [{ habitId: "h1", day: TODAY, value: 1, skip: false, note: null, updatedAt: 0 }], TODAY, 30);
    expect(card.days).toHaveLength(30);
    expect(card.days[0]).toMatchObject({ day: TODAY, state: { state: "done" } });
    expect(card.days[29].day).toBe("2026-10-14");
    expect(habitCards([habit], [], TODAY)[0].days).toHaveLength(7);
  });
});

describe("the habits table's exercise rows", () => {
  it("groups the month's workouts by type, the most days first, with each day's sessions", async () => {
    const store: Store = openMemoryStore();
    const exercise = (id: string, day: string, type: string) => ({ id, day, startTs: 1, endTs: 2, type, name: null, calories: null, distanceM: null });
    await store.upsertExercises([
      exercise("e1", TODAY, "BADMINTON"),
      exercise("e2", "2026-11-11", "STRENGTH_TRAINING"),
      exercise("e3", "2026-11-11", "BADMINTON"),
      exercise("e4", "2026-10-01", "ELLIPTICAL"),
    ]);
    const now = Date.parse(`${TODAY}T09:00:00Z`) / 1000;
    const ctx: QueryCtx = { store, profile: PROFILE, timeZone: "UTC", today: TODAY, now, sync: { lastSyncTs: null, firstDay: null, lastError: null } };
    const vm = await getHabits(ctx);
    expect(vm.days).toHaveLength(30);
    expect(vm.days[0]).toBe(TODAY);
    expect(vm.exercise).toEqual([
      { type: "BADMINTON", days: { [TODAY]: 1, "2026-11-11": 1 } },
      { type: "STRENGTH_TRAINING", days: { "2026-11-11": 1 } },
    ]);
  });
});
