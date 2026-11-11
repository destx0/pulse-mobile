import { describe, expect, it } from "vitest";
import { finish } from "@/lib/yield";
import { uniqueExercises } from "./exerciseDedup";

const record = (id: string, source = "com.fitbit", start = 0, end = 1800, type = 8, title?: string) => ({
  metadata: { id, dataOrigin: source },
  startTime: new Date(start * 1000).toISOString(),
  endTime: new Date(end * 1000).toISOString(),
  exerciseType: type,
  title,
});
const ids = (records: ReturnType<typeof record>[]) => finish(uniqueExercises(records)).map((r) => r.metadata.id);

describe("cross-source exercise duplicates", () => {
  it("keeps one near-identical session, preferring a supplied title regardless of read order", () => {
    const a = record("a");
    const b = record("b", "com.samsung", 15, 1810, 8, "Morning ride");
    expect(ids([a, b])).toEqual(["b"]);
    expect(ids([b, a])).toEqual(["b"]);
  });

  it("preserves sessions from one source, unknown sources, different sports and partial overlaps", () => {
    for (const b of [record("b"), record("b", ""), record("b", "com.samsung", 0, 1800, 56), record("b", "com.samsung", 900, 2700)]) {
      expect(ids([record("a"), b])).toHaveLength(2);
    }
  });

  it("does not collapse a short workout inside a longer one or adjacent sessions", () => {
    expect(ids([record("a"), record("b", "com.samsung", 60, 300)])).toHaveLength(2);
    expect(ids([record("a"), record("b", "com.samsung", 1800, 3600)])).toHaveLength(2);
  });

  it("collapses a gym session and the band's auto-detected copy, a few minutes and a sport name apart", () => {
    const gym = record("gym", "ch.duartesantos.opengym", 300, 3000, 70);
    const auto = record("auto", "com.fitbit", 0, 3300, 0, "Auto-detected workout");
    expect(ids([auto, gym])).toEqual(["gym"]);
    expect(ids([gym, auto])).toEqual(["gym"]);
    expect(ids([record("lift", "com.hevy", 0, 2400, 81, "Push"), record("auto", "com.fitbit", 600, 3000, 70)])).toEqual(["lift"]);
  });

  it("keeps a run inside a strength session, and a gym copy that only half overlaps", () => {
    const gym = record("gym", "com.hevy", 0, 3600, 70, "Push");
    expect(ids([gym, record("run", "com.fitbit", 600, 2400, 56)])).toEqual(["gym", "run"]);
    expect(ids([gym, record("other", "com.fitbit", 1800, 5400, 0)])).toHaveLength(2);
  });
});
