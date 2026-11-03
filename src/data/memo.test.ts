import { describe, expect, it, vi } from "vitest";
import { emptyMetrics } from "./types";
import type { ScoreRow } from "./store";
import { MemoryStore } from "./memory";
import { memoStore } from "./memo";

describe("memoStore", () => {
  it("reads a whole table once per version, hands out copies, and passes writes through", async () => {
    const store = new MemoryStore();
    await store.upsertMetrics([emptyMetrics("2026-10-01")]);
    const spy = vi.spyOn(store, "allMetrics");
    let version = 0;
    const memo = memoStore(store, () => version);

    const a = await memo.allMetrics();
    const b = await memo.allMetrics();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);

    await memo.upsertMetrics([emptyMetrics("2026-10-02")]);
    expect(await memo.allMetrics()).toHaveLength(1);
    version++;
    expect(await memo.allMetrics()).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("memoStore scores", () => {
  const row = (day: string, scoringVersion = 1): ScoreRow => ({
    day,
    scoringVersion,
    strain: null,
    activities: null,
    sessionRhrBpm: null,
    recovery: null,
    sleep: null,
    training_load: null,
    strain_target: null,
    sleep_planner: null,
    energy_bank: null,
    stress: null,
    health_monitor: null,
    healthspan: null,
    fitness: null,
    journal_impact: null,
  });

  it("parses each day once, serves ranges inside a read range, and refreshes on the scores version only", async () => {
    const store = new MemoryStore();
    for (const day of ["2026-10-01", "2026-10-02", "2026-10-03"]) await store.putScores(row(day));
    const spy = vi.spyOn(store, "scoresIn");
    let version = 0;
    let scores = 0;
    const memo = memoStore(store, () => version, () => scores);

    const all = await memo.scoresIn({ from: "2026-10-01", to: "2026-10-03" });
    expect(all.map((r) => r.day)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(spy).toHaveBeenCalledTimes(1);

    // A range inside the one already read never goes back to the store.
    const one = await memo.scoresIn({ from: "2026-10-02", to: "2026-10-02" });
    expect(one.map((r) => r.day)).toEqual(["2026-10-02"]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(one).not.toBe(await memo.scoresIn({ from: "2026-10-02", to: "2026-10-02" }));

    // A log write bumps the screen version, not the scores one.
    version++;
    await memo.scoresIn({ from: "2026-10-02", to: "2026-10-02" });
    expect(spy).toHaveBeenCalledTimes(1);

    // A scoring run bumps both, and the rows are read again.
    version++;
    scores++;
    await memo.scoresIn({ from: "2026-10-02", to: "2026-10-02" });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
