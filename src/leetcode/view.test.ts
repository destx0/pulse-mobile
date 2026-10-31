// The counting rule: accepted submissions are not problems. Duplicate slugs count once in solved counts and the
// recent list; the activity view stays LeetCode's submission counts (a problem accepted twice counts twice there,
// and a wrong attempt counts too).
import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/time";
import type { LeetCodeRecent, LeetCodeSnapshot } from "./types";
import { activityDays, leetcodeView, recentProblems, todayProblems, todayProblemsOn } from "./view";

const TZ = "Asia/Kolkata";
const NOW = Date.UTC(2026, 9, 30, 12, 0) / 1000; // 2026-10-30 17:30 in Kolkata
const TODAY = "2026-10-30";
// 2026-10-30 01:00 in Kolkata is still 2026-10-29 in UTC: the local-day test.
const LOCAL_TODAY = Date.UTC(2026, 9, 29, 19, 30) / 1000;
const YESTERDAY = Date.UTC(2026, 9, 29, 12, 0) / 1000;

const recent = (): LeetCodeRecent[] => [
  { id: "1", title: "Two Sum", slug: "two-sum", timestamp: LOCAL_TODAY },
  { id: "2", title: "Two Sum", slug: "two-sum", timestamp: LOCAL_TODAY + 60 },
  { id: "3", title: "Add Two Numbers", slug: "add-two-numbers", timestamp: LOCAL_TODAY + 120 },
  { id: "4", title: "Old Problem", slug: "old-problem", timestamp: YESTERDAY },
];

const snapshot = (over: Partial<LeetCodeSnapshot> = {}): LeetCodeSnapshot => ({
  username: "destx0",
  fetchedAt: NOW,
  profile: { name: "Pulak Ghosh", avatarUrl: null, ranking: 180739 },
  solved: { total: 546, easy: 223, medium: 276, hard: 47 },
  streak: 5,
  activeDays: 81,
  calendar: {},
  recent: recent(),
  ...over,
});

describe("recentProblems", () => {
  it("keeps one row per problem, the newest accepted submission, at most 12", () => {
    const out = recentProblems(recent());
    expect(out.map((r) => r.slug)).toEqual(["add-two-numbers", "two-sum", "old-problem"]);
    expect(out[1].id).toBe("2");
    expect(recentProblems(recent(), 1)).toHaveLength(1);
  });

  it("feeds the same problem twice and counts it once everywhere problems are counted", () => {
    const twoSum = recent().filter((r) => r.slug === "two-sum");
    expect(twoSum).toHaveLength(2);
    expect(todayProblems(twoSum, TZ, NOW).distinct).toBe(1);
    expect(recentProblems(twoSum)).toHaveLength(1);

    const view = leetcodeView(snapshot(), TZ, NOW);
    expect(view.solved.total).toBe(546);
    expect(view.recent.filter((r) => r.slug === "two-sum")).toHaveLength(1);
    // Two accepted submissions of two-sum plus add-two-numbers: two distinct problems today.
    expect(view.today.distinct).toBe(2);
  });
});

describe("todayProblems", () => {
  it("uses the profile's local day, not the UTC day", () => {
    // The same instant is 2026-10-29 in UTC and 2026-10-30 in Kolkata.
    expect(todayProblems(recent(), "UTC", NOW).distinct).toBe(0);
    expect(todayProblems(recent(), TZ, NOW).distinct).toBe(2);
    expect(todayProblemsOn(recent(), TODAY, TZ).distinct).toBe(2);
  });

  it("marks a full 20-submission window that is all today as a lower bound", () => {
    const full: LeetCodeRecent[] = Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: `P${i}`, slug: `p-${i}`, timestamp: LOCAL_TODAY + i }));
    expect(todayProblems(full, TZ, NOW)).toEqual({ distinct: 20, truncated: true });
    const complete = [{ ...full[0], timestamp: YESTERDAY }, ...full.slice(1)];
    expect(todayProblems(complete, TZ, NOW)).toEqual({ distinct: 19, truncated: false });
  });
});

describe("activityDays", () => {
  it("stays submissions: a problem accepted twice counts twice in the activity view", () => {
    // LeetCode's calendar only exposes the count, so two submissions on the same problem stay two here.
    const calendar = { [String(Date.UTC(2026, 9, 30) / 1000)]: 2 };
    const days = activityDays(calendar, TZ, NOW);
    expect(days).toHaveLength(365);
    expect(days[days.length - 1]).toEqual({ day: TODAY, submissions: 2 });
    expect(days[0].day).toBe(addDays(TODAY, -364));
    expect(activityDays(calendar, TZ, NOW).reduce((a, d) => a + d.submissions, 0)).toBe(2);
  });

  it("ignores buckets outside the 12-month window", () => {
    const old = String(Date.UTC(2024, 0, 1) / 1000);
    const today = String(Date.UTC(2026, 9, 30) / 1000);
    const days = activityDays({ [old]: 99, [today]: 1 }, TZ, NOW);
    expect(days.reduce((a, d) => a + d.submissions, 0)).toBe(1);
  });
});

describe("leetcodeView", () => {
  it("carries the profile, solved counts, streak and today from one snapshot", () => {
    const view = leetcodeView(snapshot(), TZ, NOW);
    expect(view.profile.username).toBe("destx0");
    expect(view.solved).toEqual({ total: 546, easy: 223, medium: 276, hard: 47 });
    expect(view.streak).toBe(5);
    expect(view.activeDays).toBe(81);
    expect(view.today.distinct).toBe(2);
  });
});
