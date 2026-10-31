// Pure views over a stored LeetCode snapshot. The counting rule lives here:
// - every problem count and the recent list dedupe by slug, so two accepted submissions of one problem count once;
// - the activity view stays LeetCode's submission count per day (every submission, accepted or not; a problem
//   accepted twice counts twice there) and is labelled as submissions by the screen, never as problems solved;
// - "today" is the profile's local day, not UTC (src/lib/time.ts localDay).
import { addDays, localDay } from "@/lib/time";
import type { LeetCodeActivityDay, LeetCodeRecent, LeetCodeSnapshot, LeetCodeView } from "./types";

/** How many distinct recent problems the screen lists (LeetCode returns at most 20 accepted submissions). */
export const RECENT_PROBLEMS = 12;
const ACTIVITY_DAYS = 365;

/**
 * Newest accepted submission per problem, at most `limit`. The input may repeat a problem; the newest one wins,
 * because LeetCode lists accepted submissions (one problem can have several) and the screen is about problems.
 */
export function recentProblems(recent: readonly LeetCodeRecent[], limit = RECENT_PROBLEMS): LeetCodeRecent[] {
  const sorted = [...recent].sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const seen = new Set<string>();
  const out: LeetCodeRecent[] = [];
  for (const r of sorted) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Today's distinct problems. LeetCode only returns the latest 20 accepted submissions, so when all 20 are from today
 * the count is a lower bound (`truncated`): a heavy day can have more problems than the window shows. The screen
 * prints "20+" rather than inventing the rest.
 */
export function todayProblems(
  recent: readonly LeetCodeRecent[],
  timeZone: string,
  now: number,
): { distinct: number; truncated: boolean } {
  return todayProblemsOn(recent, localDay(now, timeZone), timeZone);
}

/** The same rule against an explicit local day (Home's shell already knows today). */
export function todayProblemsOn(
  recent: readonly LeetCodeRecent[],
  today: string,
  timeZone: string,
): { distinct: number; truncated: boolean } {
  const todays = recent.filter((r) => localDay(r.timestamp, timeZone) === today);
  const distinct = new Set(todays.map((r) => r.slug)).size;
  const truncated = recent.length >= 20 && todays.length === recent.length;
  return { distinct, truncated };
}

/**
 * Submissions per local day for the last 365 days. LeetCode's calendar buckets are UTC days; each bucket is
 * placed on the local day of its timestamp so the chart uses the same days as the rest of the app. These stay
 * submissions: no problem identity exists for the year, the calendar counts every submission (accepted or not),
 * and a problem accepted twice that day counts twice.
 */
export function activityDays(calendar: Readonly<Record<string, number>>, timeZone: string, now: number): LeetCodeActivityDay[] {
  const today = localDay(now, timeZone);
  const start = addDays(today, -(ACTIVITY_DAYS - 1));
  const byDay = new Map<string, number>();
  for (const [ts, count] of Object.entries(calendar)) {
    const at = Number(ts);
    if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(count) || count <= 0) continue;
    const day = localDay(at, timeZone);
    if (day < start || day > today) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + count);
  }
  return Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
    const day = addDays(start, i);
    return { day, submissions: byDay.get(day) ?? 0 };
  });
}

/** Everything the LeetCode screen and Home's today stat draw, from one local "now". */
export function leetcodeView(snapshot: LeetCodeSnapshot, timeZone: string, now: number): LeetCodeView {
  return {
    profile: {
      username: snapshot.username,
      name: snapshot.profile.name,
      avatarUrl: snapshot.profile.avatarUrl,
      ranking: snapshot.profile.ranking,
    },
    solved: snapshot.solved,
    streak: snapshot.streak,
    activeDays: snapshot.activeDays,
    activity: activityDays(snapshot.calendar, timeZone, now),
    recent: recentProblems(snapshot.recent),
    today: todayProblems(snapshot.recent, timeZone, now),
  };
}
