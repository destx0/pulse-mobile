import { describe, expect, it } from "vitest";
import type { Habit } from "@/core/habits/types";
import { habitCards } from "./habits";

const TODAY = "2026-11-12";
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
