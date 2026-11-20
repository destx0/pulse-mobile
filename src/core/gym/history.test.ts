// The history's maths (stats.ts): records per session, best sets, chart points, an exercise's records, week streaks.
import { describe, expect, it } from "vitest";
import { estimate1Rm } from "./load";
import { bestOf, exercisePoints, exerciseRecords, recordCounts, setsRecord, weekOfDay, weekStreak } from "./stats";
import type { GymSet } from "./types";
import { niceTicks, timeLabels } from "@/screens/gym/chartAxis";

let n = 0;
const set = (o: Partial<GymSet>): GymSet => ({
  id: `x${++n}`,
  sessionId: "s1",
  exerciseId: "bench",
  position: 0,
  setNo: 1,
  weightKg: 60,
  reps: 8,
  seconds: null,
  distanceM: null,
  rpe: null,
  type: "normal",
  supersetId: null,
  completed: true,
  ts: 1000,
  note: null,
  ...o,
});

describe("recordCounts", () => {
  it("counts the exercises a session set a record on, as setsRecord judges each set", () => {
    const all = [
      set({ sessionId: "a", ts: 100, weightKg: 60, reps: 8 }),
      set({ sessionId: "a", ts: 100, exerciseId: "squat", weightKg: 80, reps: 5 }),
      set({ sessionId: "b", ts: 200, weightKg: 62.5, reps: 8 }),
      set({ sessionId: "b", ts: 200, exerciseId: "squat", weightKg: 70, reps: 5 }),
      set({ sessionId: "c", ts: 300, weightKg: 60, reps: 8 }),
      set({ sessionId: "c", ts: 310, weightKg: 62.5, reps: 8, type: "warmup" }),
    ];
    const counts = recordCounts(all);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.get("c")).toBeUndefined();
    for (const s of all.filter((x) => x.type !== "warmup")) {
      const hit = (counts.get(s.sessionId) ?? 0) > 0 && setsRecord(all, s);
      if (hit) expect(counts.get(s.sessionId)).toBeGreaterThan(0);
    }
  });

  it("lets sets stamped at the same instant (an imported session) all count, as setsRecord does", () => {
    const all = [set({ sessionId: "a", ts: 100, weightKg: 60 }), set({ sessionId: "a", ts: 100, weightKg: 70 })];
    expect(recordCounts(all).get("a")).toBe(1);
    expect(all.every((s) => setsRecord(all, s))).toBe(true);
  });
});

describe("bestOf", () => {
  it("is the top estimated 1RM for lifts", () => {
    expect(bestOf([set({ weightKg: 60, reps: 10 }), set({ weightKg: 70, reps: 3 })])).toEqual({ kind: "weight", weightKg: 60, reps: 10 });
  });
  it("is the most reps with no weight, the longest hold, the farthest distance", () => {
    expect(bestOf([set({ weightKg: 0, reps: 12 }), set({ weightKg: 0, reps: 15 })])).toEqual({ kind: "reps", reps: 15 });
    expect(bestOf([set({ weightKg: 0, reps: 0, seconds: 20 }), set({ weightKg: 0, reps: 0, seconds: 45 })], { hold: true })).toEqual({ kind: "time", seconds: 45 });
    expect(bestOf([set({ weightKg: 0, reps: 0, seconds: 600, distanceM: 2400 })], { cardio: true })).toEqual({ kind: "distance", meters: 2400 });
  });
  it("is null with nothing ticked", () => {
    expect(bestOf([set({ completed: false })])).toBeNull();
  });
});

describe("exercisePoints", () => {
  it("is one point per session, oldest first, warmups left out", () => {
    const points = exercisePoints([
      set({ sessionId: "b", ts: 200, weightKg: 70, reps: 5 }),
      set({ sessionId: "a", ts: 100, weightKg: 60, reps: 10 }),
      set({ sessionId: "a", ts: 110, weightKg: 65, reps: 6 }),
      set({ sessionId: "a", ts: 90, weightKg: 100, reps: 10, type: "warmup" }),
    ]);
    expect(points.map((p) => p.sessionId)).toEqual(["a", "b"]);
    expect(points[0].maxWeight).toBe(65);
    expect(points[0].volume).toBe(60 * 10 + 65 * 6);
    expect(points[0].maxReps).toBe(10);
    expect(points[0].oneRm).toBeCloseTo(Math.max(estimate1Rm(60, 10), estimate1Rm(65, 6)));
  });
});

describe("exerciseRecords", () => {
  it("finds each record and the heaviest weight for each rep count", () => {
    const prs = exerciseRecords([
      set({ sessionId: "a", ts: 100, weightKg: 60, reps: 10 }),
      set({ sessionId: "a", ts: 100, weightKg: 60, reps: 10 }),
      set({ sessionId: "b", ts: 200, weightKg: 80, reps: 3 }),
      set({ sessionId: "c", ts: 300, weightKg: 40, reps: 20 }),
    ]);
    expect(prs.heaviest).toMatchObject({ value: 80, reps: 3, sessionId: "b" });
    expect(prs.mostReps).toMatchObject({ value: 20, weightKg: 40 });
    expect(prs.sessionVolume).toMatchObject({ value: 1200, sessionId: "a" });
    expect(prs.setVolume?.value).toBe(800);
    expect(prs.repBests.find((r) => r.reps === 3)?.weightKg).toBe(80);
    expect(prs.repBests.find((r) => r.reps === 4)?.weightKg).toBe(60);
    expect(prs.repBests.find((r) => r.reps === 12)?.weightKg).toBe(40);
    expect(prs.repBests).toHaveLength(12);
  });
});

describe("weekStreak", () => {
  it("counts weeks in a row, still alive while this week has none yet", () => {
    expect(weekOfDay("2026-11-20")).toBe("2026-11-16");
    expect(weekOfDay("2026-11-16")).toBe("2026-11-16");
    expect(weekOfDay("2026-11-22")).toBe("2026-11-16");
    expect(weekStreak(["2026-11-17", "2026-11-12", "2026-11-03"], "2026-11-20")).toBe(3);
    expect(weekStreak(["2026-11-12", "2026-11-03"], "2026-11-20")).toBe(2);
    expect(weekStreak(["2026-11-03"], "2026-11-20")).toBe(0);
    expect(weekStreak([], "2026-11-20")).toBe(0);
  });
});

describe("niceTicks", () => {
  it("covers the range on a round step", () => {
    expect(niceTicks(13.2, 14.6)).toEqual([13, 13.5, 14, 14.5, 15]);
    expect(niceTicks(1050, 1170)).toEqual([1050, 1100, 1150, 1200]);
    const flat = niceTicks(10, 10);
    expect(flat[0]).toBeLessThan(10);
    expect(flat[flat.length - 1]).toBeGreaterThan(10);
  });
});

describe("timeLabels", () => {
  const ts = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;
  it("labels months inside a year, years past it, never more than asked", () => {
    expect(timeLabels(ts("2026-08-20"), ts("2026-11-20")).map((l) => l.ts)).toEqual([ts("2026-09-01"), ts("2026-10-01"), ts("2026-11-01")]);
    const years = timeLabels(ts("2021-03-01"), ts("2026-11-20"));
    expect(years.map((l) => l.label)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
    expect(timeLabels(ts("2025-11-21"), ts("2026-11-20")).length).toBeLessThanOrEqual(5);
  });
});
