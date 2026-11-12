import { describe, expect, it } from "vitest";
import { MAX_VISIT_H, officeSummary, visitsOf, type OfficeEvent } from "./office";

const H = 3600;
const ev = (kind: "enter" | "exit", ts: number, day = "2026-11-12"): OfficeEvent => ({ id: `${kind}-${ts}`, kind, ts, day });

describe("visitsOf", () => {
  it("pairs an arrival and a departure into one visit", () => {
    const visits = visitsOf([ev("exit", 18 * H), ev("enter", 9 * H)], 20 * H);
    expect(visits).toEqual([{ day: "2026-11-12", inTs: 9 * H, outTs: 18 * H, minutes: 540, capped: false }]);
  });

  it("ignores a repeated enter and an exit with nothing open", () => {
    const visits = visitsOf([ev("exit", 8 * H), ev("enter", 9 * H), ev("enter", 9 * H + 60), ev("exit", 17 * H)], 20 * H);
    expect(visits.map((v) => [v.inTs, v.outTs])).toEqual([[9 * H, 17 * H]]);
  });

  it("keeps today's open visit open", () => {
    const visits = visitsOf([ev("enter", 9 * H)], 11 * H);
    expect(visits[0]).toMatchObject({ outTs: null, minutes: 120, capped: false });
  });

  it("closes a stale open visit at the cap instead of trusting a missed exit", () => {
    const visits = visitsOf([ev("enter", 9 * H)], 9 * H + (MAX_VISIT_H + 4) * H);
    expect(visits[0]).toEqual({ day: "2026-11-12", inTs: 9 * H, outTs: 9 * H + MAX_VISIT_H * H, minutes: MAX_VISIT_H * 60, capped: true });
  });

  it("orders by time, so events read out of order pair the same way", () => {
    const visits = visitsOf([ev("exit", 17 * H), ev("enter", 9 * H)], 20 * H);
    expect(visits).toHaveLength(1);
    expect(visits[0]!.minutes).toBe(480);
  });
});

describe("officeSummary", () => {
  // Absolute times grow with the day, as real events do (a local day's 9:00 is a later instant than the day before's).
  const at = (day: string, hour: number) => Date.parse(`${day}T00:00:00Z`) / 1000 + hour * H;
  const day = (d: string) => [ev("enter", at(d, 9), d), ev("exit", at(d, 17), d)];
  const visits = visitsOf([...day("2026-10-30"), ...day("2026-11-09"), ...day("2026-11-10"), ...day("2026-11-12")], at("2026-11-12", 20));

  it("counts the week's office days, Monday to today", () => {
    expect(officeSummary(visits, "2026-11-12").days).toBe(3);
  });

  it("takes today's last visit and the one before it", () => {
    const s = officeSummary(visits, "2026-11-12");
    expect(s.today?.inTs).toBe(at("2026-11-12", 9));
    expect(s.last?.day).toBe("2026-11-10");
  });

  it("is empty without visits", () => {
    expect(officeSummary([], "2026-11-12")).toEqual({ today: null, last: null, days: 0 });
  });
});
