// Home's gym card: the workout running now, and the template to start today. The guess is the template of the most
// recent finished workout in the last 30 days, so a template left unused for a month is never suggested.
import type { QueryCtx } from "./ctx";
import { localDay } from "@/lib/time";

const MONTH = 30 * 86_400;

export type HomeGymVM = {
  active: { sessionId: string; name: string } | null;
  /** The workout finished earlier today, if any: it is not suggested again before tomorrow. */
  doneToday: { name: string; endTs: number } | null;
  suggested: { routineId: string; name: string; exercises: number; lastTs: number } | null;
};

export async function getHomeGym(ctx: QueryCtx): Promise<HomeGymVM> {
  const [sessions, { routines, items }] = await Promise.all([ctx.store.gymSessions(), ctx.store.gymRoutines()]);
  const active = sessions.find((s) => !s.finished) ?? null;
  const doneToday = sessions.find((s) => s.finished && localDay(s.endTs ?? s.startTs, ctx.timeZone) === ctx.today) ?? null;
  // gymSessions is newest first: the first finished one with a template inside the month is the one last used. A
  // deleted template is skipped, so the guess falls back to the newest template that still exists.
  const known = new Set(routines.map((r) => r.id));
  const last = doneToday ? null : sessions.find((s) => s.finished && !!s.routineId && known.has(s.routineId) && s.startTs >= ctx.now - MONTH) ?? null;
  const routine = last ? routines.find((r) => r.id === last.routineId) : undefined;
  return {
    active: active ? { sessionId: active.id, name: active.name } : null,
    doneToday: doneToday ? { name: doneToday.name, endTs: doneToday.endTs ?? doneToday.startTs } : null,
    suggested: routine
      ? {
          routineId: routine.id,
          name: routine.name,
          exercises: new Set(items.filter((i) => i.routineId === routine.id).map((i) => i.exerciseId)).size,
          lastTs: last!.startTs,
        }
      : null,
  };
}
