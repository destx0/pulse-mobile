// The gym log's writes and reads on the in-memory store: a session from a routine, a ticked set, the import and the
// view models the screens render.
import { beforeEach, describe, expect, it } from "vitest";
import { openMemoryStore } from "@/data/memory";
import type { Store } from "@/data/store";
import type { GymExercise } from "@/core/gym/types";
import type { QueryCtx } from "@/queries/ctx";
import { getGymExercise, getGymHome, getGymHistory, getGymSession } from "@/queries/gym";
import type { ActionCtx } from "@/state/app";
import { addExerciseToSession, addSet, adjustRest, deleteSet, finishSession, importStrong, moveExercise, restoreSet, restoreSets, saveRoutine, saveSessionAsRoutine, saveSet, skipExercise, skipPendingSets, startRest, startSession, tickSet, undoStrongImport, updateRoutineFromSession } from "./gym";

const NOW = Date.parse("2026-11-02T09:00:00Z") / 1000;
let store: Store;
const act = (): ActionCtx => ({ store, profile: { birthDate: "1990-01-01", sex: "male", maxHr: null, heightCm: null, timeZone: "UTC" }, timeZone: "UTC", nowS: () => NOW });
const ctx = (): QueryCtx => ({ ...act(), today: "2026-11-02", now: NOW, sync: { lastSyncTs: null, firstDay: null, lastError: null } });
const at = (now: number): ActionCtx => ({ ...act(), nowS: () => now });
const exercise = (id: string, name: string, hold = false): GymExercise => ({ id, name, bodyPart: "quads", equipment: "barbell", custom: false, hold, unit: "kg", note: null });

beforeEach(() => {
  store = openMemoryStore();
});

const STRONG = [
  '"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"',
  '"1";"2026-10-20 18:00:00";"Push";"3000";"Bench Press (Barbell)";"1";"60";"8";"";"";"";"";""',
  '"1";"2026-10-20 18:00:00";"Push";"3000";"Bench Press (Barbell)";"2";"65";"6";"";"";"";"";""',
  '"1";"2026-10-20 18:00:00";"Push";"3000";"Bench Press (Barbell)";"Note";"";"";"";"";"";"Elbow fine";""',
  '"1";"2026-10-20 18:00:00";"Push";"3000";"rowing cable";"1";"50";"10";"";"";"";"";""',
  '"2";"2026-10-22 18:00:00";"Pull";"2400";"Lat Pulldown (Cable)";"1";"55";"10";"";"";"";"";""',
  '"2";"2026-10-22 18:00:00";"Pull";"2400";"latai";"1";"20";"12";"";"";"";"";""',
].join("\n");

describe("a session", () => {
  it("starts from a routine with its planned sets, and a second start resumes the first", async () => {
    const routine = await saveRoutine(store, { name: "Push", items: [{ exerciseId: "bench-press-barbell", sets: 3, reps: 8 }, { exerciseId: "lat-pulldown-cable", sets: 2, reps: 10 }] }, NOW);
    expect(routine.ok).toBe(true);
    const first = await startSession(act(), { routineId: routine.ok ? routine.data.id : undefined });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.sets).toHaveLength(5);
    expect(first.data.session.name).toBe("Push");
    const again = await startSession(act());
    expect(again.ok && again.data.session.id).toBe(first.data.session.id);
  });

  it("writes a ticked set at once, and the rest timer with it", async () => {
    const started = await startSession(act(), { name: "Legs" });
    if (!started.ok) throw new Error("start");
    const ex = { id: "squat-barbell", name: "Squat (Barbell)", bodyPart: "quads" as const, equipment: "barbell" as const, custom: false, hold: false, unit: "kg" as const, note: null };
    const sets = await addExerciseToSession(store, started.data.session, ex, { count: 3, reps: 5 });
    const saved = await saveSet(store, { ...sets[0], weightKg: 100, reps: 5 });
    expect(saved.ok).toBe(true);
    const ticked = await tickSet(store, saved.ok ? saved.data : sets[0], true, NOW);
    expect(ticked.completed).toBe(true);
    const read = await store.gymSets([started.data.session.id]);
    expect(read[0]).toMatchObject({ weightKg: 100, reps: 5, completed: true, ts: NOW });
  });

  it("adds a set after the last one and renumbers when one is deleted", async () => {
    const started = await startSession(act(), { name: "Legs" });
    if (!started.ok) throw new Error("start");
    const ex = { id: "squat-barbell", name: "Squat (Barbell)", bodyPart: "quads" as const, equipment: "barbell" as const, custom: false, hold: false, unit: "kg" as const, note: null };
    const sets = await addExerciseToSession(store, started.data.session, ex, { count: 2 });
    const extra = await addSet(store, started.data.session.id, ex.id);
    expect(extra?.setNo).toBe(3);
    await deleteSet(store, sets[0]);
    const left = await store.gymSets([started.data.session.id]);
    expect(left.map((s) => s.setNo)).toEqual([1, 2]);
    // Undo puts it back at its old number and renumbers the ones that had moved up.
    await restoreSet(store, sets[0]);
    const back = await store.gymSets([started.data.session.id]);
    expect(back.sort((a, b) => a.setNo - b.setNo).map((s) => s.id)).toEqual([sets[0].id, sets[1].id, extra!.id]);
    expect(back.map((s) => s.setNo).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("restores a removed exercise's sets after any that were added back first", async () => {
    const started = await startSession(act(), { name: "Legs" });
    if (!started.ok) throw new Error("start");
    const ex = { id: "squat-barbell", name: "Squat (Barbell)", bodyPart: "quads" as const, equipment: "barbell" as const, custom: false, hold: false, unit: "kg" as const, note: null };
    const removed = await addExerciseToSession(store, started.data.session, ex, { count: 2 });
    for (const s of removed) await store.deleteGymSet(s.id);
    const again = await addExerciseToSession(store, started.data.session, ex, { count: 1 });
    await restoreSets(store, removed);
    const all = (await store.gymSets([started.data.session.id])).sort((a, b) => a.setNo - b.setNo);
    expect(all.map((s) => s.id)).toEqual([again[0].id, removed[0].id, removed[1].id]);
    expect(all.map((s) => s.setNo)).toEqual([1, 2, 3]);
  });

  it("finishes with a length", async () => {
    const started = await startSession(act(), { name: "Legs" });
    if (!started.ok) throw new Error("start");
    const done = await finishSession(store, started.data.session, NOW + 1800);
    expect(done.finished).toBe(true);
    expect((done.endTs ?? 0) - done.startTs).toBe(1800);
    expect(await store.gymSessions()).toHaveLength(1);
  });

  it("prefills a routine's weights from the last time it was trained", async () => {
    const routine = await saveRoutine(store, { name: "Push", items: [{ exerciseId: "bench-press-barbell", sets: 2, reps: 8 }] }, NOW);
    if (!routine.ok) throw new Error("routine");
    const first = await startSession(act(), { routineId: routine.data.id });
    if (!first.ok) throw new Error("first");
    const [one, two] = first.data.sets;
    await saveSet(store, { ...one, weightKg: 80, reps: 8 });
    await saveSet(store, { ...two, weightKg: 82.5, reps: 8 });
    await tickSet(store, { ...one, weightKg: 80, reps: 8 }, true, NOW + 10);
    await tickSet(store, { ...two, weightKg: 82.5, reps: 8 }, true, NOW + 20);
    await finishSession(store, first.data.session, NOW + 60);

    const second = await startSession(at(NOW + 3600), { routineId: routine.data.id });
    if (!second.ok) throw new Error("second");
    expect(second.data.sets.map((s) => s.weightKg)).toEqual([80, 82.5]);
  });

  it("prefills a lift added to a new workout from the last time it was trained", async () => {
    const squat = exercise("squat-barbell", "Squat (Barbell)");
    const first = await startSession(act(), { name: "Legs" });
    if (!first.ok) throw new Error("first");
    const sets = await addExerciseToSession(store, first.data.session, squat, { count: 1, reps: 5 });
    await saveSet(store, { ...sets[0], weightKg: 100, reps: 5 });
    await tickSet(store, { ...sets[0], weightKg: 100, reps: 5 }, true, NOW + 10);
    await finishSession(store, first.data.session, NOW + 60);

    const second = await startSession(at(NOW + 3600), { name: "Legs" });
    if (!second.ok) throw new Error("second");
    const added = await addExerciseToSession(store, second.data.session, squat, { count: 1, reps: 5 });
    expect(added[0].weightKg).toBe(100);
    expect(added[0].reps).toBe(5);
  });

  it("moves an exercise up and down, taking its sets with it", async () => {
    const started = await startSession(act(), { name: "Legs" });
    if (!started.ok) throw new Error("start");
    const squat = exercise("squat-barbell", "Squat (Barbell)");
    const bench = exercise("bench-press-barbell", "Bench Press (Barbell)");
    await addExerciseToSession(store, started.data.session, squat, { count: 1 });
    await addExerciseToSession(store, started.data.session, bench, { count: 1 });
    await moveExercise(store, started.data.session.id, bench.id, -1);
    const sets = await store.gymSets([started.data.session.id]);
    expect(sets.find((s) => s.exerciseId === bench.id)?.position).toBe(0);
    expect(sets.find((s) => s.exerciseId === squat.id)?.position).toBe(1);
  });

  it("adds and takes away rest seconds without moving its start", async () => {
    const started = await startSession(act(), { name: "Legs" });
    if (!started.ok) throw new Error("start");
    const running = await startRest(store, started.data.session, 90, NOW);
    const longer = await adjustRest(store, running, 15);
    expect(longer.restStartedTs).toBe(NOW);
    expect(longer.restSec).toBe(105);
    const shorter = await adjustRest(store, longer, -200);
    expect(shorter.restSec).toBe(5);
  });

  it("turns a finished workout into a template and gives a second one a free name", async () => {
    const bench = exercise("bench-press-barbell", "Bench Press (Barbell)");
    const started = await startSession(act(), { name: "Push" });
    if (!started.ok) throw new Error("start");
    const sets = await addExerciseToSession(store, started.data.session, bench, { count: 2, reps: 8 });
    await tickSet(store, { ...sets[0], weightKg: 80, reps: 8 }, true, NOW + 10);
    await tickSet(store, { ...sets[1], weightKg: 80, reps: 8 }, true, NOW + 20);
    const done = await finishSession(store, started.data.session, NOW + 60);
    const routine = await saveSessionAsRoutine(store, done, NOW + 70);
    expect(routine?.name).toBe("Push");
    const items = (await store.gymRoutines()).items.filter((i) => i.routineId === routine?.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ exerciseId: bench.id, sets: 2, reps: 8 });
    const again = await saveSessionAsRoutine(store, done, NOW + 80);
    expect(again?.name).toBe("Push 2");
  });

  it("reports the records a session set, and only new ones", async () => {
    const bench = exercise("bench-press-barbell", "Bench Press (Barbell)");
    const write = async (weight: number, start: number) => {
      const started = await startSession(at(start), { name: "Push" });
      if (!started.ok) throw new Error("start");
      const sets = await addExerciseToSession(store, started.data.session, bench, { count: 1, reps: 5 });
      await tickSet(store, { ...sets[0], weightKg: weight, reps: 5 }, true, start + 10);
      return finishSession(store, started.data.session, start + 60);
    };
    await write(60, NOW);
    const second = await write(70, NOW + 3600);
    const page = await getGymSession(ctx(), second.id);
    expect(page?.newRecords).toHaveLength(1);
    expect(page?.newRecords[0].weightKg).toBe(70);
    expect(page?.prSetIds).toHaveLength(1);
  });

  it("leaves an empty workout out of the home, the history and the template's last done", async () => {
    const routine = await saveRoutine(store, { name: "Push", items: [{ exerciseId: "bench-press-barbell", sets: 3, reps: 8 }] }, NOW);
    if (!routine.ok) throw new Error("routine");
    const started = await startSession(act(), { routineId: routine.data.id });
    if (!started.ok) throw new Error("start");
    await finishSession(store, started.data.session, NOW + 60);
    const home = await getGymHome(ctx());
    expect(home.recent).toHaveLength(0);
    expect(home.routines[0].lastTs).toBeNull();
    expect((await getGymHistory(ctx())).total).toBe(0);
  });

  it("skips one exercise for today, leaving its unticked sets out and the template alone", async () => {
    const routine = await saveRoutine(store, { name: "Push", items: [{ exerciseId: "bench-press-barbell", sets: 3, reps: 8 }, { exerciseId: "seated-cable-row", sets: 2, reps: 10 }] }, NOW);
    if (!routine.ok) throw new Error("routine");
    const started = await startSession(act(), { routineId: routine.data.id });
    if (!started.ok) throw new Error("start");
    const bench = started.data.sets.find((s) => s.exerciseId === "bench-press-barbell");
    await tickSet(store, bench!, true, NOW + 10);
    const removed = await skipExercise(store, started.data.session.id, "seated-cable-row");
    expect(removed).toHaveLength(2);
    expect((await store.gymSets([started.data.session.id])).every((s) => s.exerciseId === "bench-press-barbell")).toBe(true);
    expect((await store.gymRoutines()).items.filter((i) => i.routineId === routine.data.id)).toHaveLength(2);
  });

  it("skips every unfinished set before finishing", async () => {
    const started = await startSession(act(), { name: "Push" });
    if (!started.ok) throw new Error("start");
    const bench = exercise("bench-press-barbell", "Bench Press (Barbell)");
    const sets = await addExerciseToSession(store, started.data.session, bench, { count: 3, reps: 8 });
    await tickSet(store, sets[0], true, NOW + 10);
    expect(await skipPendingSets(store, started.data.session.id)).toBe(2);
    const left = await store.gymSets([started.data.session.id]);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ completed: true, setNo: 1 });
  });

  it("updates a session's template from today, so the next session drops the old exercises", async () => {
    const routine = await saveRoutine(store, { name: "Push", items: [{ exerciseId: "bench-press-barbell", sets: 3, reps: 8 }, { exerciseId: "seated-cable-row", sets: 2, reps: 10 }] }, NOW);
    if (!routine.ok) throw new Error("routine");
    const started = await startSession(act(), { routineId: routine.data.id });
    if (!started.ok) throw new Error("start");
    const bench = started.data.sets.filter((s) => s.exerciseId === "bench-press-barbell");
    for (const [i, s] of bench.entries()) await tickSet(store, s, true, NOW + 10 + i);
    await skipExercise(store, started.data.session.id, "seated-cable-row");
    const updated = await updateRoutineFromSession(store, started.data.session, NOW + 30);
    expect(updated).toMatchObject({ id: routine.data.id, name: "Push" });
    const items = (await store.gymRoutines()).items.filter((i) => i.routineId === routine.data.id);
    expect(items.map((i) => i.exerciseId)).toEqual(["bench-press-barbell"]);
    expect(items[0]).toMatchObject({ sets: 3, reps: 8 });
    await finishSession(store, started.data.session, NOW + 60);
    const next = await startSession(at(NOW + 3600), { routineId: routine.data.id });
    expect(next.ok && new Set(next.data.sets.map((s) => s.exerciseId))).toEqual(new Set(["bench-press-barbell"]));
  });
});

describe("the import", () => {
  it("reports the sessions as it writes them, for the progress bar", async () => {
    const seen: { done: number; total: number }[] = [];
    const res = await importStrong(act(), STRONG, (p) => seen.push(p));
    expect(res.ok).toBe(true);
    expect(seen[0]).toEqual({ done: 0, total: 2 });
    expect(seen.at(-1)).toEqual({ done: 2, total: 2 });
    expect(seen.some((p) => p.done === 1)).toBe(true);
  });

  it("writes the sessions, keeps the note, and leaves an unknown name as the owner's own exercise", async () => {
    const res = await importStrong(act(), STRONG);
    if (!res.ok) throw new Error(res.error);
    expect(res.data.sessions).toBe(2);
    expect(res.data.notes).toBe(1);
    expect(res.data.custom).toContain("Latai");
    const sessions = await store.gymSessions();
    expect(sessions).toHaveLength(2);
    const all = await store.gymAllSets();
    expect(all).toHaveLength(5);
    const bench = all.find((s) => s.exerciseId === "bench-press-barbell" && s.setNo === 2);
    expect(bench?.note).toBe("Elbow fine");
    const row = all.find((s) => s.exerciseId === "seated-cable-row");
    expect(row?.weightKg).toBe(50);
  });

  it("makes one template per workout name, and does not import the same file twice", async () => {
    const first = await importStrong(act(), STRONG);
    if (!first.ok) throw new Error(first.error);
    expect(first.data.routines).toBe(2);
    const { routines, items } = await store.gymRoutines();
    expect(routines.map((r) => r.name).sort()).toEqual(["Pull", "Push"]);
    expect(items.filter((i) => i.routineId === routines.find((r) => r.name === "Push")!.id)).toHaveLength(2);

    const again = await importStrong(act(), STRONG);
    expect(again.ok).toBe(false);
    expect(await store.gymSessions()).toHaveLength(2);
  });

  it("feeds the home, the session and the exercise pages", async () => {
    await importStrong(act(), STRONG);
    const home = await getGymHome(ctx());
    expect(home.routines).toHaveLength(2);
    expect(home.recent).toHaveLength(2);
    expect(home.week.sessions).toBe(0);
    expect(home.recent.reduce((n, c) => n + c.setCount, 0)).toBe(5);
    expect(home.recent[0].exercises).toEqual(["Lat Pulldown (Cable)", "Latai"]);

    const history = await getGymHistory(ctx());
    expect(history.total).toBe(2);
    expect(history.months[0].month).toBe("2026-10");

    const sessions = await store.gymSessions();
    const pull = sessions.find((s) => s.name === "Pull")!;
    const page = await getGymSession(ctx(), pull.id);
    expect(page?.blocks).toHaveLength(2);
    expect(page?.blocks[0].exercise.name).toBe("Lat Pulldown (Cable)");

    const bench = await getGymExercise(ctx(), "bench-press-barbell");
    expect(bench?.record?.weightKg).toBe(65);
    expect(bench?.history).toHaveLength(1);
    expect(bench?.series).toHaveLength(1);
  });

  it("takes an import back out, sessions and templates together", async () => {
    const res = await importStrong(act(), STRONG);
    if (!res.ok) throw new Error(res.error);
    const state = await store.getGymImport();
    expect(state?.sessionIds).toHaveLength(2);
    expect(state?.routineIds).toHaveLength(2);
    const removed = await undoStrongImport(store, state!);
    expect(removed).toBe(2);
    expect(await store.gymSessions()).toHaveLength(0);
    expect((await store.gymRoutines()).routines).toHaveLength(0);
    expect(await store.getGymImport()).toMatchObject({ sessions: 0, sets: 0 });
  });

  it("points an imported session at a template that already has its name", async () => {
    const routine = await saveRoutine(store, { name: "Push", items: [{ exerciseId: "bench-press-barbell", sets: 3, reps: 8 }] }, NOW);
    if (!routine.ok) throw new Error("routine");
    await importStrong(act(), STRONG);
    const push = (await store.gymSessions()).find((s) => s.name === "Push");
    expect(push?.routineId).toBe(routine.data.id);
    const home = await getGymHome(ctx());
    expect(home.routines.find((r) => r.routine.name === "Push")?.lastTs).not.toBeNull();
  });
});
