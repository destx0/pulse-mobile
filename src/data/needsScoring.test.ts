import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory";
import type { ScoreRow } from "./store";

const row = (day: string, scoringVersion: number): ScoreRow => ({
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

describe("needsScoring", () => {
  it("is false only when today is scored at the current version and nothing is dirty", async () => {
    const store = new MemoryStore();
    expect(await store.needsScoring("2026-11-03", 30)).toBe(true); // no rows yet

    await store.putScores(row("2026-11-03", 30));
    expect(await store.needsScoring("2026-11-03", 30)).toBe(false);

    await store.markIntradayDirty(["2026-11-03"]); // a live heart-rate read or a journal answer
    expect(await store.needsScoring("2026-11-03", 30)).toBe(true);
    await store.takeIntradayDirty();
    expect(await store.needsScoring("2026-11-03", 30)).toBe(false);

    await store.putScores(row("2026-11-02", 29)); // an older scoring version has to be replayed
    expect(await store.needsScoring("2026-11-03", 30)).toBe(true);

    await store.putScores(row("2026-11-02", 30));
    expect(await store.needsScoring("2026-11-03", 30)).toBe(false);
    expect(await store.needsScoring("2026-11-04", 30)).toBe(true); // the day rolled over
  });
});
