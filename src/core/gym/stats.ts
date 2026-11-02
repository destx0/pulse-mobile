// What the history adds up to: volume, the previous time on an exercise, the best set, and the records a session sets.
// Everything reads completed sets only, and warmups stay out of volume and records, as they do in Strong.
import { estimate1Rm } from "./load";
import type { GymSet, SetType } from "./types";

/** A set counts toward volume, records and the "previous" column unless it is a warmup (or not ticked yet). */
export const isWorkSet = (s: Pick<GymSet, "completed" | "type">) => s.completed && s.type !== "warmup";

/** Weight × reps. A hold and a cardio set lift nothing, so they add nothing. */
export const setVolume = (s: Pick<GymSet, "weightKg" | "reps">) => Math.max(0, s.weightKg) * Math.max(0, s.reps);

export const volumeOf = (sets: readonly GymSet[]) => sets.reduce((sum, s) => (isWorkSet(s) ? sum + setVolume(s) : sum), 0);

export const workSets = (sets: readonly GymSet[]) => sets.filter(isWorkSet);

/** The set types that still log a weight and reps. */
export const isRepSet = (s: Pick<GymSet, "seconds" | "distanceM">) => !s.seconds && !s.distanceM;

/** The heaviest set by estimated 1RM, ties going to the heavier weight. */
export function bestSet(sets: readonly GymSet[]): GymSet | null {
  let best: GymSet | null = null;
  let bestRm = 0;
  for (const s of workSets(sets)) {
    if (!isRepSet(s) || s.weightKg <= 0 || s.reps <= 0) continue;
    const rm = estimate1Rm(s.weightKg, s.reps);
    if (rm > bestRm + 1e-9) {
      bestRm = rm;
      best = s;
    }
  }
  return best;
}

/** The most weight ever moved on an exercise, with the reps it was moved for. */
export function heaviestSet(sets: readonly GymSet[]): GymSet | null {
  let best: GymSet | null = null;
  for (const s of workSets(sets)) {
    if (!isRepSet(s) || s.weightKg <= 0) continue;
    if (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)) best = s;
  }
  return best;
}

export type PersonalRecord = { exerciseId: string; weightKg: number; reps: number; oneRm: number; ts: number | null };

/** The best estimated 1RM per exercise, over every set given. */
export function recordsOf(sets: readonly GymSet[]): Map<string, PersonalRecord> {
  const out = new Map<string, PersonalRecord>();
  for (const s of workSets(sets)) {
    if (!isRepSet(s) || s.weightKg <= 0 || s.reps <= 0) continue;
    const rm = estimate1Rm(s.weightKg, s.reps);
    const prev = out.get(s.exerciseId);
    if (!prev || rm > prev.oneRm || (rm === prev.oneRm && s.weightKg > prev.weightKg)) {
      out.set(s.exerciseId, { exerciseId: s.exerciseId, weightKg: s.weightKg, reps: s.reps, oneRm: rm, ts: s.ts });
    }
  }
  return out;
}

/**
 * The "previous" column at the start of a session: the most recent session before `beforeTs` that trained this
 * exercise, and its sets by set number. `all` may hold every set in the database.
 */
export function previousSets(all: readonly GymSet[], exerciseId: string, beforeTs: number): { sessionId: string; ts: number; byNo: Map<number, GymSet> } | null {
  let last: GymSet | null = null;
  for (const s of all) {
    if (s.exerciseId !== exerciseId || !s.completed || s.ts == null || s.ts >= beforeTs) continue;
    if (!last || s.ts > last.ts!) last = s;
  }
  if (!last) return null;
  const byNo = new Map<number, GymSet>();
  for (const s of all) {
    if (s.sessionId !== last.sessionId || s.exerciseId !== exerciseId) continue;
    const seen = byNo.get(s.setNo);
    if (!seen || (s.completed && !seen.completed)) byNo.set(s.setNo, s);
  }
  return { sessionId: last.sessionId, ts: last.ts!, byNo };
}

/** Every exercise the history has ever trained, most recent first: the picker's History row. */
export function recentExercises(all: readonly GymSet[], limit = 12): string[] {
  const seen = new Map<string, number>();
  for (const s of all) {
    if (s.ts == null) continue;
    const ts = seen.get(s.exerciseId) ?? 0;
    if (s.ts > ts) seen.set(s.exerciseId, s.ts);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

export type OneRmPoint = { ts: number; oneRm: number; weightKg: number; reps: number };

/** The best estimated 1RM per session for an exercise, oldest first: the exercise screen's curve. */
export function oneRmSeries(sets: readonly GymSet[], exerciseId: string): OneRmPoint[] {
  const bySession = new Map<string, { ts: number; oneRm: number; weightKg: number; reps: number }>();
  for (const s of workSets(sets)) {
    if (s.exerciseId !== exerciseId || !isRepSet(s) || s.weightKg <= 0 || s.reps <= 0 || s.ts == null) continue;
    const rm = estimate1Rm(s.weightKg, s.reps);
    const prev = bySession.get(s.sessionId);
    if (!prev || rm > prev.oneRm) bySession.set(s.sessionId, { ts: s.ts, oneRm: rm, weightKg: s.weightKg, reps: s.reps });
  }
  return [...bySession.values()].sort((a, b) => a.ts - b.ts);
}

/** True when `set` beats every earlier 1RM on its exercise. Ties do not count: a record is a heavier estimate. */
export function setsRecord(all: readonly GymSet[], set: GymSet): boolean {
  if (!set.completed || !isWorkSet(set) || !isRepSet(set) || set.weightKg <= 0 || set.reps <= 0) return false;
  const rm = estimate1Rm(set.weightKg, set.reps);
  for (const s of all) {
    if (s.id === set.id || s.exerciseId !== set.exerciseId || !isWorkSet(s) || !isRepSet(s)) continue;
    if (s.ts != null && set.ts != null && s.ts >= set.ts) continue;
    if (estimate1Rm(s.weightKg, s.reps) >= rm) return false;
  }
  return true;
}

/** Sets by exercise, in the session's own order: the log a detail screen shows. */
export function groupByExercise(sets: readonly GymSet[]): { exerciseId: string; position: number; sets: GymSet[] }[] {
  const out = new Map<string, { exerciseId: string; position: number; sets: GymSet[] }>();
  for (const s of sets) {
    const slot = out.get(s.exerciseId);
    if (!slot) out.set(s.exerciseId, { exerciseId: s.exerciseId, position: s.position, sets: [s] });
    else {
      slot.sets.push(s);
      slot.position = Math.min(slot.position, s.position);
    }
  }
  return [...out.values()].sort((a, b) => a.position - b.position).map((g) => ({ ...g, sets: g.sets.slice().sort((a, b) => a.setNo - b.setNo) }));
}

export type TypeCounts = Record<SetType, number>;

/** How many sets of each type: the summary's "12 sets, 2 warmups". */
export function countTypes(sets: readonly GymSet[]): TypeCounts {
  const out: TypeCounts = { normal: 0, warmup: 0, drop: 0, failure: 0 };
  for (const s of sets) if (s.completed) out[s.type] += 1;
  return out;
}
