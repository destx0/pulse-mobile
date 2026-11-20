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

/** True when a session has at least one ticked working set: an empty workout is not a workout. */
export const hasWork = (sets: readonly GymSet[]) => sets.some(isWorkSet);

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
 *
 * A session that only warmed up is not a reference: the column reads the last session with a ticked working set, the
 * way a lifter remembers "what I did last time". The sets map still carries that session's warmups, so set 1 shows
 * what set 1 was, but a warmup-only workout never becomes the whole column.
 */
export function previousSets(all: readonly GymSet[], exerciseId: string, beforeTs: number): { sessionId: string; ts: number; byNo: Map<number, GymSet> } | null {
  const mine = all.filter((s) => s.exerciseId === exerciseId && s.completed && s.ts != null && s.ts < beforeTs);
  if (!mine.length) return null;
  const bySession = new Map<string, GymSet[]>();
  for (const s of mine) {
    const list = bySession.get(s.sessionId);
    if (list) list.push(s);
    else bySession.set(s.sessionId, [s]);
  }
  const withWork = [...bySession.values()].filter(hasWork);
  const candidates = withWork.length ? withWork : [...bySession.values()];
  const chosen = candidates.reduce((best, list) => (Math.max(...list.map((s) => s.ts!)) > Math.max(...best.map((s) => s.ts!)) ? list : best));
  const last = chosen.reduce((best, s) => (s.ts! > best.ts! ? s : best));
  const byNo = new Map<number, GymSet>();
  for (const s of all) {
    if (s.sessionId !== last.sessionId || s.exerciseId !== exerciseId) continue;
    const seen = byNo.get(s.setNo);
    const better =
      !seen ||
      (s.completed && !seen.completed) ||
      (s.completed === seen.completed && s.type !== "warmup" && seen.type === "warmup");
    if (better) byNo.set(s.setNo, s);
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

/**
 * The exercises each session set a record on (`setsRecord`'s rule: a set whose estimate beats every earlier one), for
 * the history's "2 PRs". One pass over the history, oldest first. Sets ticked at the same instant (an imported session
 * stamps all its sets with its start) do not beat each other, as `setsRecord` skips equal times.
 */
export function recordCounts(all: readonly GymSet[]): Map<string, number> {
  const rated = all
    .filter((s) => isWorkSet(s) && isRepSet(s) && s.weightKg > 0 && s.reps > 0 && s.ts != null)
    .map((s) => ({ s, rm: estimate1Rm(s.weightKg, s.reps) }))
    .sort((a, b) => a.s.ts! - b.s.ts!);
  const best = new Map<string, number>();
  const hits = new Map<string, Set<string>>();
  for (let i = 0; i < rated.length; ) {
    let j = i;
    while (j < rated.length && rated[j].s.ts === rated[i].s.ts) j++;
    const group = rated.slice(i, j);
    for (const { s, rm } of group) {
      if (rm > (best.get(s.exerciseId) ?? 0)) {
        const set = hits.get(s.sessionId) ?? new Set<string>();
        set.add(s.exerciseId);
        hits.set(s.sessionId, set);
      }
    }
    for (const { s, rm } of group) if (rm > (best.get(s.exerciseId) ?? 0)) best.set(s.exerciseId, rm);
    i = j;
  }
  return new Map([...hits].map(([id, ex]) => [id, ex.size]));
}

/** What an exercise's best set in a session was, by what the exercise measures. */
export type Best =
  | { kind: "weight"; weightKg: number; reps: number }
  | { kind: "reps"; reps: number }
  | { kind: "time"; seconds: number }
  | { kind: "distance"; meters: number };

/** The set that best shows what an exercise did: the top 1RM, else the most reps, the longest hold or the farthest. */
export function bestOf(sets: readonly GymSet[], opts: { hold?: boolean; cardio?: boolean } = {}): Best | null {
  const done = workSets(sets);
  if (!done.length) return null;
  const seconds = Math.max(0, ...done.map((s) => s.seconds ?? 0));
  const meters = Math.max(0, ...done.map((s) => s.distanceM ?? 0));
  if (opts.hold || done.every((s) => !!s.seconds && !s.reps && !s.distanceM)) return seconds > 0 ? { kind: "time", seconds } : null;
  if (opts.cardio || done.every((s) => !isRepSet(s))) {
    if (meters > 0) return { kind: "distance", meters };
    return seconds > 0 ? { kind: "time", seconds } : null;
  }
  const top = bestSet(done);
  if (top) return { kind: "weight", weightKg: top.weightKg, reps: top.reps };
  const reps = Math.max(0, ...done.map((s) => s.reps));
  return reps > 0 ? { kind: "reps", reps } : null;
}

/** One session of one exercise, as its charts read it. Zero where the session has nothing of that kind. */
export type ExercisePoint = {
  sessionId: string;
  ts: number;
  /** Best estimated 1RM. */
  oneRm: number;
  /** Heaviest weight lifted. */
  maxWeight: number;
  /** Weight × reps over the working sets. */
  volume: number;
  /** Most reps in one set. */
  maxReps: number;
  totalReps: number;
  /** Longest hold or cardio time in one set. */
  maxSeconds: number;
  /** Farthest distance in one set, metres. */
  maxMeters: number;
};

/** An exercise's sessions as chart points, oldest first. `ts` is the session's first ticked set. */
export function exercisePoints(sets: readonly GymSet[]): ExercisePoint[] {
  const by = new Map<string, ExercisePoint>();
  for (const s of workSets(sets)) {
    if (s.ts == null) continue;
    const p = by.get(s.sessionId) ?? { sessionId: s.sessionId, ts: s.ts, oneRm: 0, maxWeight: 0, volume: 0, maxReps: 0, totalReps: 0, maxSeconds: 0, maxMeters: 0 };
    p.ts = Math.min(p.ts, s.ts);
    if (isRepSet(s)) {
      if (s.weightKg > 0 && s.reps > 0) p.oneRm = Math.max(p.oneRm, estimate1Rm(s.weightKg, s.reps));
      p.maxWeight = Math.max(p.maxWeight, s.weightKg);
      p.volume += setVolume(s);
      p.maxReps = Math.max(p.maxReps, s.reps);
      p.totalReps += Math.max(0, s.reps);
    }
    p.maxSeconds = Math.max(p.maxSeconds, s.seconds ?? 0);
    p.maxMeters = Math.max(p.maxMeters, s.distanceM ?? 0);
    by.set(s.sessionId, p);
  }
  return [...by.values()].sort((a, b) => a.ts - b.ts);
}

type Dated = { value: number; ts: number | null; sessionId: string };

/** An exercise's personal records, the Records tab. Each carries when it was set and in which session. */
export type ExerciseRecords = {
  oneRm: (Dated & { weightKg: number; reps: number }) | null;
  heaviest: (Dated & { reps: number }) | null;
  /** The heaviest single set by weight × reps. */
  setVolume: (Dated & { weightKg: number; reps: number }) | null;
  mostReps: (Dated & { weightKg: number }) | null;
  /** The biggest session by volume. */
  sessionVolume: Dated | null;
  longest: Dated | null;
  /** For 1 to 12 reps: the heaviest weight lifted for at least that many reps. */
  repBests: { reps: number; weightKg: number; ts: number | null; sessionId: string }[];
};

export function exerciseRecords(sets: readonly GymSet[]): ExerciseRecords {
  const out: ExerciseRecords = { oneRm: null, heaviest: null, setVolume: null, mostReps: null, sessionVolume: null, longest: null, repBests: [] };
  const sessions = new Map<string, { value: number; ts: number | null }>();
  const reps = new Map<number, { weightKg: number; ts: number | null; sessionId: string }>();
  for (const s of workSets(sets)) {
    const at = { ts: s.ts, sessionId: s.sessionId };
    if ((s.seconds ?? 0) > (out.longest?.value ?? 0)) out.longest = { value: s.seconds!, ...at };
    if (!isRepSet(s)) continue;
    if (s.reps > (out.mostReps?.value ?? 0)) out.mostReps = { value: s.reps, weightKg: s.weightKg, ...at };
    if (s.weightKg <= 0) continue;
    if (s.weightKg > (out.heaviest?.value ?? 0) || (s.weightKg === out.heaviest?.value && s.reps > out.heaviest.reps)) out.heaviest = { value: s.weightKg, reps: s.reps, ...at };
    if (s.reps <= 0) continue;
    const rm = estimate1Rm(s.weightKg, s.reps);
    if (rm > (out.oneRm?.value ?? 0)) out.oneRm = { value: rm, weightKg: s.weightKg, reps: s.reps, ...at };
    const vol = setVolume(s);
    if (vol > (out.setVolume?.value ?? 0)) out.setVolume = { value: vol, weightKg: s.weightKg, reps: s.reps, ...at };
    const session = sessions.get(s.sessionId) ?? { value: 0, ts: s.ts };
    session.value += vol;
    if (s.ts != null && (session.ts == null || s.ts < session.ts)) session.ts = s.ts;
    sessions.set(s.sessionId, session);
    for (let r = 1; r <= Math.min(12, s.reps); r++) {
      const seen = reps.get(r);
      if (!seen || s.weightKg > seen.weightKg) reps.set(r, { weightKg: s.weightKg, ...at });
    }
  }
  for (const [sessionId, v] of sessions) if (v.value > (out.sessionVolume?.value ?? 0)) out.sessionVolume = { value: v.value, ts: v.ts, sessionId };
  out.repBests = [...reps.entries()].sort((a, b) => a[0] - b[0]).map(([r, v]) => ({ reps: r, ...v }));
  return out;
}

/** "2026-11-16": the Monday that starts the week of `day` (YYYY-MM-DD). */
export function weekOfDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Weeks in a row with at least one workout, ending this week, or last week while this one has none yet (the streak is
 * still alive until the week ends without a workout).
 */
export function weekStreak(days: readonly string[], today: string): number {
  const weeks = new Set(days.map(weekOfDay));
  const step = (week: string, n: number) => {
    const d = new Date(`${week}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7 * n);
    return d.toISOString().slice(0, 10);
  };
  let week = weekOfDay(today);
  if (!weeks.has(week)) week = step(week, -1);
  let n = 0;
  while (weeks.has(week)) {
    n++;
    week = step(week, -1);
  }
  return n;
}
