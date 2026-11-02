// The gym log's view models: what the templates page, the tracking screen, the history and the exercise charts read.
// Every Postgres read the web app would do is a Store read here.
import { CATALOGUE } from "@/core/gym/catalogue";
import { estimate1Rm } from "@/core/gym/load";
import { bestSet, groupByExercise, isRepSet, oneRmSeries, previousSets, recentExercises, recordsOf, volumeOf, type PersonalRecord } from "@/core/gym/stats";
import type { GymExercise, GymSession, GymSet, MeasurementKind } from "@/core/gym/types";
import { MEASUREMENTS } from "@/core/gym/types";
import type { Store } from "@/data/store";
import type { GymImportState, GymMeasurement, GymRoutine } from "@/data/gym";
import type { QueryCtx } from "./ctx";

export { CATALOGUE };

/** The exercises the app knows: the bundled catalogue with the owner's rows (and unit overrides) laid over it. */
export async function exerciseMap(store: Store): Promise<Map<string, GymExercise>> {
  const stored = await store.gymExercises();
  const map = new Map<string, GymExercise>(CATALOGUE.map((e) => [e.id, { ...e }]));
  for (const e of stored) map.set(e.id, e);
  return map;
}

/** An exercise the log references but the catalogue no longer has (a deleted custom one): shown by its id, never lost. */
const ghost = (id: string): GymExercise => ({ id, name: id, bodyPart: "full body", equipment: "other", custom: true, hold: false, unit: "kg", note: null });

export type SessionCard = {
  id: string;
  name: string;
  day: string;
  startTs: number;
  endTs: number | null;
  finished: boolean;
  setCount: number;
  volumeKg: number;
  exercises: string[];
  routineId: string | null;
};

export function cardOf(session: GymSession, sets: readonly GymSet[], map: Map<string, GymExercise>): SessionCard {
  const mine = sets.filter((s) => s.sessionId === session.id);
  return {
    id: session.id,
    name: session.name,
    day: session.day,
    startTs: session.startTs,
    endTs: session.endTs,
    finished: session.finished,
    setCount: mine.filter((s) => s.completed).length,
    volumeKg: volumeOf(mine),
    exercises: groupByExercise(mine).map((g) => (map.get(g.exerciseId) ?? ghost(g.exerciseId)).name),
    routineId: session.routineId,
  };
}

export type RoutineCard = {
  routine: GymRoutine;
  items: { exercise: GymExercise; sets: number; reps: number }[];
  lastTs: number | null;
};

export type GymHomeVM = {
  today: string;
  active: { session: GymSession; setCount: number; done: number; volumeKg: number; exercises: string[] } | null;
  routines: RoutineCard[];
  recent: SessionCard[];
  week: { sessions: number; sets: number; volumeKg: number; seconds: number };
  records: { exercise: GymExercise; record: PersonalRecord }[];
};

/**
 * The templates page: the routines (the owner's own, and the ones the import wrote per workout name), how each last
 * went, what was trained recently, and the last seven days' totals.
 */
export async function getGymHome(ctx: QueryCtx): Promise<GymHomeVM> {
  const [map, sessions, routines, all] = await Promise.all([exerciseMap(ctx.store), ctx.store.gymSessions(), ctx.store.gymRoutines(), ctx.store.gymAllSets()]);
  const bySession = new Map<string, GymSet[]>();
  for (const s of all) {
    const list = bySession.get(s.sessionId);
    if (list) list.push(s);
    else bySession.set(s.sessionId, [s]);
  }
  const activeSession = sessions.find((s) => !s.finished) ?? null;
  const weekFrom = ctx.now - 7 * 86_400;
  const weekSessions = sessions.filter((s) => s.startTs >= weekFrom && s.finished);
  const weekSets = weekSessions.flatMap((s) => bySession.get(s.id) ?? []);

  const cards: RoutineCard[] = routines.routines.map((routine) => {
    const last = sessions.find((s) => s.routineId === routine.id && s.finished);
    return {
      routine,
      items: routines.items
        .filter((i) => i.routineId === routine.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ exercise: map.get(i.exerciseId) ?? ghost(i.exerciseId), sets: i.sets, reps: i.reps })),
      lastTs: last?.startTs ?? null,
    };
  });

  const totals = new Map<string, { record: PersonalRecord; name: GymExercise }>();
  for (const [id, record] of recordsOf(all)) totals.set(id, { record, name: map.get(id) ?? ghost(id) });
  const records = [...totals.values()]
    .sort((a, b) => (b.record.ts ?? 0) - (a.record.ts ?? 0))
    .slice(0, 4)
    .map((r) => ({ exercise: r.name, record: r.record }));

  return {
    today: ctx.today,
    active: activeSession
      ? {
          session: activeSession,
          setCount: (bySession.get(activeSession.id) ?? []).length,
          done: (bySession.get(activeSession.id) ?? []).filter((s) => s.completed).length,
          volumeKg: volumeOf(bySession.get(activeSession.id) ?? []),
          exercises: groupByExercise(bySession.get(activeSession.id) ?? []).map((g) => (map.get(g.exerciseId) ?? ghost(g.exerciseId)).name),
        }
      : null,
    routines: cards,
    recent: sessions
      .filter((s) => s.finished)
      .slice(0, 5)
      .map((s) => cardOf(s, all, map)),
    week: { sessions: weekSessions.length, sets: weekSets.filter((s) => s.completed).length, volumeKg: volumeOf(weekSets), seconds: weekSets.length ? weekSessions.reduce((n, s) => n + Math.max(0, (s.endTs ?? s.startTs) - s.startTs), 0) : 0 },
    records,
  };
}

export type HistoryVM = { months: { month: string; cards: SessionCard[] }[]; total: number; firstDay: string | null };

/** Every finished session, newest first, grouped by month. */
export async function getGymHistory(ctx: QueryCtx): Promise<HistoryVM> {
  const [map, sessions, all] = await Promise.all([exerciseMap(ctx.store), ctx.store.gymSessions(), ctx.store.gymAllSets()]);
  const cards = sessions
    .filter((s) => s.finished)
    .map((s) => cardOf(s, all, map));
  const months: { month: string; cards: SessionCard[] }[] = [];
  for (const card of cards) {
    const month = card.day.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.month === month) last.cards.push(card);
    else months.push({ month, cards: [card] });
  }
  return { months, total: cards.length, firstDay: cards[cards.length - 1]?.day ?? null };
}

export type Block = {
  exercise: GymExercise;
  position: number;
  sets: GymSet[];
  /** The same exercise's sets the last time it was done, by set number (index 0 is set 1). */
  prev: GymSet[];
  volumeKg: number;
};

export type SessionVM = {
  session: GymSession;
  blocks: Block[];
  setCount: number;
  volumeKg: number;
  seconds: number;
  /** Estimated 1RM records as they stand now, for the exercises in this session. */
  records: { exerciseId: string; oneRm: number; weightKg: number; reps: number }[];
};

/** One session with its sets grouped by exercise, each exercise carrying what happened last time. */
export async function getGymSession(ctx: QueryCtx, id: string): Promise<SessionVM | null> {
  const [map, sessions] = await Promise.all([exerciseMap(ctx.store), ctx.store.gymSessions()]);
  const session = sessions.find((s) => s.id === id);
  if (!session) return null;
  const sets = await ctx.store.gymSets([id]);
  const ids = [...new Set(sets.map((s) => s.exerciseId))];
  const earlier = ids.length ? await ctx.store.gymExerciseSets(ids, session.startTs) : [];
  const records = recordsOf([...earlier, ...sets]);
  return {
    session,
    blocks: groupByExercise(sets).map((g) => {
      const previous = previousSets(earlier, g.exerciseId, session.startTs);
      const prev: GymSet[] = [];
      for (const s of g.sets) {
        const p = previous?.byNo.get(s.setNo);
        if (p) prev[s.setNo - 1] = p;
      }
      return { exercise: map.get(g.exerciseId) ?? ghost(g.exerciseId), position: g.position, sets: g.sets, prev, volumeKg: volumeOf(g.sets) };
    }),
    setCount: sets.filter((s) => s.completed).length,
    volumeKg: volumeOf(sets),
    seconds: Math.max(0, (session.endTs ?? ctx.now) - session.startTs),
    records: ids.map((exerciseId) => records.get(exerciseId)).filter((r): r is PersonalRecord => !!r),
  };
}

export type ExercisePageVM = {
  exercise: GymExercise;
  record: PersonalRecord | null;
  previousRecord: { oneRm: number; weightKg: number; reps: number } | null;
  series: { ts: number; oneRm: number; weightKg: number; reps: number }[];
  history: { session: SessionCard; sets: GymSet[] }[];
  totalSets: number;
  totalVolumeKg: number;
  bestWeight: GymSet | null;
  firstDay: string | null;
  lastDay: string | null;
};

/** One exercise: its records, its estimated-1RM curve and every session it was trained in (newest first). */
export async function getGymExercise(ctx: QueryCtx, exerciseId: string): Promise<ExercisePageVM | null> {
  const [map, sessions, sets] = await Promise.all([exerciseMap(ctx.store), ctx.store.gymSessions(), ctx.store.gymExerciseSets([exerciseId])]);
  // A custom exercise deleted from the catalogue still has its sets: show it under its id rather than a dead screen.
  const exercise = map.get(exerciseId) ?? ghost(exerciseId);
  const records = recordsOf(sets);
  const record = records.get(exerciseId) ?? null;
  // The record before the latest one: the second-best 1RM, which the header shows as "was 102.5".
  let previousRecord: { oneRm: number; weightKg: number; reps: number } | null = null;
  if (record) {
    for (const s of sets) {
      if (!s.completed || !isRepSet(s) || s.weightKg <= 0 || s.reps <= 0) continue;
      const rm = estimate1Rm(s.weightKg, s.reps);
      if (rm < record.oneRm && (!previousRecord || rm > previousRecord.oneRm)) previousRecord = { oneRm: rm, weightKg: s.weightKg, reps: s.reps };
    }
  }
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const groups = new Map<string, GymSet[]>();
  for (const s of sets) {
    const list = groups.get(s.sessionId);
    if (list) list.push(s);
    else groups.set(s.sessionId, [s]);
  }
  const history = [...groups.entries()]
    .map(([sessionId, list]) => ({ session: byId.get(sessionId), sets: list.sort((a, b) => a.setNo - b.setNo) }))
    .filter((h): h is { session: GymSession; sets: GymSet[] } => !!h.session)
    .sort((a, b) => b.session.startTs - a.session.startTs)
    .slice(0, 30)
    .map((h) => ({ session: cardOf(h.session, h.sets, map), sets: h.sets }));
  return {
    exercise,
    record,
    previousRecord,
    series: oneRmSeries(sets, exerciseId),
    history,
    totalSets: sets.filter((s) => s.completed).length,
    totalVolumeKg: volumeOf(sets),
    bestWeight: bestSet(sets),
    firstDay: history[history.length - 1]?.session.day ?? null,
    lastDay: history[0]?.session.day ?? null,
  };
}

export type PickerVM = { recent: GymExercise[]; all: GymExercise[]; custom: GymExercise[] };

/** The exercise picker: what this person has trained lately first, then the whole catalogue. */
export async function getGymPicker(ctx: QueryCtx): Promise<PickerVM> {
  const map = await exerciseMap(ctx.store);
  const all = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  const sets = await ctx.store.gymAllSets();
  return {
    recent: recentExercises(sets, 10).map((id) => map.get(id)).filter((e): e is GymExercise => !!e),
    all,
    custom: all.filter((e) => e.custom),
  };
}

export type RecordRow = { exercise: GymExercise; record: PersonalRecord; weightKg: number; reps: number; ts: number | null; sessions: number };

/** The records board: every exercise's best estimated 1RM, newest record first. */
export async function getGymRecords(ctx: QueryCtx): Promise<{ rows: RecordRow[] }> {
  const [map, all] = await Promise.all([exerciseMap(ctx.store), ctx.store.gymAllSets()]);
  const counts = new Map<string, number>();
  for (const s of all) if (s.completed) counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1);
  const rows: RecordRow[] = [...recordsOf(all).values()]
    .map((record) => ({
      exercise: map.get(record.exerciseId) ?? ghost(record.exerciseId),
      record,
      weightKg: record.weightKg,
      reps: record.reps,
      ts: record.ts,
      sessions: counts.get(record.exerciseId) ?? 0,
    }))
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  return { rows };
}

export type MeasurementsVM = {
  rows: GymMeasurement[];
  latest: { kind: MeasurementKind; value: number; day: string }[];
  /** Weight over time, oldest first, for the chart. */
  weight: { day: string; value: number }[];
};

export async function getGymMeasurements(ctx: QueryCtx): Promise<MeasurementsVM> {
  const rows = await ctx.store.gymMeasurements();
  const sorted = [...rows].sort((a, b) => b.day.localeCompare(a.day));
  const latest = MEASUREMENTS.flatMap(({ kind }) => {
    const row = sorted.find((r) => r.kind === kind);
    return row ? [{ kind, value: row.value, day: row.day }] : [];
  });
  return { rows: sorted, latest, weight: rows.filter((r) => r.kind === "weight").sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ day: r.day, value: r.value })) };
}

export async function getGymImport(ctx: QueryCtx): Promise<GymImportState | null> {
  return ctx.store.getGymImport();
}

/** The routine editor's page: the four numbers a planned exercise carries. */
export type RoutineVM = { routine: GymRoutine; items: { exercise: GymExercise; sets: number; reps: number }[] };

export async function getGymRoutine(ctx: QueryCtx, id: string): Promise<RoutineVM | null> {
  const [map, data] = await Promise.all([exerciseMap(ctx.store), ctx.store.gymRoutines()]);
  const routine = data.routines.find((r) => r.id === id);
  if (!routine) return null;
  return {
    routine,
    items: data.items
      .filter((i) => i.routineId === id)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ exercise: map.get(i.exerciseId) ?? ghost(i.exerciseId), sets: i.sets, reps: i.reps })),
  };
}

export async function getGymRoutineList(ctx: QueryCtx): Promise<{ routines: GymRoutine[] }> {
  return { routines: (await ctx.store.gymRoutines()).routines };
}
