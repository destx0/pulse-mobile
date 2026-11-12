// The office geofence's reads (Pulse-only): Home's card and Settings › Places. Events are paired into visits in pure
// code (src/core/office); the query only chooses the window.
import { officeSummary, visitsOf, type Office, type Visit } from "@/core/office";
import { addDays, localMidnight } from "@/lib/time";
import type { QueryCtx } from "./ctx";

export type OfficeVM = {
  office: Office | null;
  /** Today's last visit, open or closed. */
  today: Visit | null;
  /** The last visit before today, within the month the card reads. */
  last: Visit | null;
  /** Days with a visit this week (Monday to Sunday). */
  days: number;
};

/** The card reads a month back: enough for "last visit" after a holiday, without a growing scan. */
export const OFFICE_LOOKBACK_DAYS = 30;

/** Home's office card: today's arrival and departure, the one before, and the week's count. */
export async function getOffice(ctx: QueryCtx): Promise<OfficeVM> {
  const office = ctx.profile.office ?? null;
  if (!office) return { office, today: null, last: null, days: 0 };
  const from = localMidnight(addDays(ctx.today, -OFFICE_LOOKBACK_DAYS), ctx.timeZone);
  const events = await ctx.store.officeEvents(from, ctx.now);
  return { office, ...officeSummary(visitsOf(events, ctx.now), ctx.today) };
}

export type OfficeSettingsVM = { office: Office | null; habits: { id: string; name: string }[] };

/** Settings › Places: the saved office and the habits an arrival can tick (yes/no ones only). */
export async function getOfficeSettings(ctx: QueryCtx): Promise<OfficeSettingsVM> {
  const habits = (await ctx.store.habits()).filter((h) => !h.archived && h.kind === "yes_no");
  return { office: ctx.profile.office ?? null, habits: habits.map(({ id, name }) => ({ id, name })) };
}
