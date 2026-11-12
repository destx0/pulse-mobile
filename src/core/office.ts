// The office geofence (Pulse-only): the place saved in the profile, the enter/exit events the background task writes,
// and the visits the screens read. Pure TypeScript: no clock reads (the caller passes `now`), so the pairing rules run
// in Node tests and in the headless task.
import { addDays } from "@/lib/time";

/** The office, in the profile: the fence's centre and the habit a arrival ticks (a yes/no habit; null for none). */
export type Office = { latitude: number; longitude: number; habitId: string | null };

/** The fence's radius, in metres: a building and the street around it, small enough to tell the office from home. */
export const OFFICE_RADIUS_M = 200;

/** One geofence event, written by the task (src/background/office.ts). `day` is the local civil day. */
export type OfficeEvent = { id: string; kind: "enter" | "exit"; ts: number; day: string };

/**
 * One stay at the office. `outTs` null: still inside, or the exit was lost. `capped`: an open visit older than
 * `maxHours` (a missed exit), closed at the cap rather than trusted as a 30-hour day.
 */
export type Visit = { day: string; inTs: number; outTs: number | null; minutes: number; capped: boolean };

/** A missed exit must not read as a whole day; anything longer is closed at the cap. */
export const MAX_VISIT_H = 16;

export const validOffice = (o: Office) =>
  Number.isFinite(o.latitude) && o.latitude >= -90 && o.latitude <= 90 &&
  Number.isFinite(o.longitude) && o.longitude >= -180 && o.longitude <= 180;

/**
 * Pairs events into visits: an enter opens one, the next exit closes it, an enter while open and an exit with none are
 * ignored (a repeated delivery, a fence that fires twice at the boundary). Sorted by ts, an enter before an exit at the
 * same second.
 */
export function visitsOf(events: readonly OfficeEvent[], now: number, maxHours = MAX_VISIT_H): Visit[] {
  const sorted = [...events].sort((a, b) => a.ts - b.ts || (a.kind === b.kind ? 0 : a.kind === "enter" ? -1 : 1));
  const visits: Visit[] = [];
  let open: { day: string; inTs: number } | null = null;
  for (const e of sorted) {
    if (e.kind === "enter") {
      open ??= { day: e.day, inTs: e.ts };
      continue;
    }
    if (!open) continue;
    const outTs = Math.max(e.ts, open.inTs);
    visits.push({ day: open.day, inTs: open.inTs, outTs, minutes: Math.round((outTs - open.inTs) / 60), capped: false });
    open = null;
  }
  if (open) {
    const cur = open;
    const limit = cur.inTs + maxHours * 3600;
    visits.push(
      now > limit
        ? { day: cur.day, inTs: cur.inTs, outTs: limit, minutes: maxHours * 60, capped: true }
        : { day: cur.day, inTs: cur.inTs, outTs: null, minutes: Math.max(0, Math.round((now - cur.inTs) / 60)), capped: false },
    );
  }
  return visits;
}

export type OfficeSummary = {
  /** Today's last visit, open or closed; null when there was none. */
  today: Visit | null;
  /** The last visit before today. */
  last: Visit | null;
  /** Days with a visit this week, Monday to Sunday, as the habit tracker counts a week. */
  days: number;
};

export function officeSummary(visits: readonly Visit[], today: string): OfficeSummary {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = addDays(today, -((dow + 6) % 7));
  const days = new Set<string>();
  let todayVisit: Visit | null = null;
  let last: Visit | null = null;
  for (const v of visits) {
    if (v.day >= weekStart && v.day <= today) days.add(v.day);
    if (v.day === today) todayVisit = v;
    else if (!last || v.inTs > last.inTs) last = v;
  }
  return { today: todayVisit, last, days: days.size };
}
