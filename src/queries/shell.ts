// The shell's wear streak (the header's streak pill), which halo's queries don't carry: pulse's getWearStreak
// (src/server/queries/settings.ts) over the Store's score rows.
import { addDays } from "@/lib/time";
import type { QueryCtx } from "./ctx";

/** Today counts once it has this many minutes of heart rate. */
const STREAK_TODAY_MIN = 6 * 60;
/** How far back the streak looks; a longer one shows as this many days. */
const STREAK_MAX_DAYS = 400;

/**
 * Consecutive worn days: the reference app's "continuous data" streak. A day is worn when it has any heart rate, the
 * same rule that keeps `band_not_worn` off its Strain. Null when the streak is 0.
 */
export async function getWearStreak(ctx: QueryCtx): Promise<{ days: number; asOf: string } | null> {
  const today = ctx.today;
  // The streak needs three numbers a day, not the day's 12 KB of scores: wornDays reads them in SQLite.
  const rows = await ctx.store.wornDays({ from: addDays(today, -STREAK_MAX_DAYS), to: today });
  const byDay = new Map(rows.map((r) => [r.day, r]));
  let asOf: string | null = null;
  let days = 0;
  for (let d = today; d === today || byDay.has(d); d = addDays(d, -1)) {
    const s1 = byDay.get(d);
    // Today neither counts nor breaks the streak until it has enough data.
    if (d === today && (s1 ? s1.hrMinutesAm + s1.hrMinutesPm : 0) < STREAK_TODAY_MIN) continue;
    if (!s1 || s1.hrCount <= 0) break;
    asOf ??= d;
    days++;
  }
  return days > 0 && asOf ? { days, asOf } : null;
}
