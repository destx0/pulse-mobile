// The gym log's writes and reads on the in-memory store: a session from a routine, a ticked set, the import and the
// view models the screens render.
import { beforeEach, describe, expect, it } from "vitest";
import { openMemoryStore } from "@/data/memory";
import type { Store } from "@/data/store";
import type { QueryCtx } from "@/queries/ctx";
import { getGymExercise, getGymHome, getGymHistory, getGymSession } from "@/queries/gym";
import type { ActionCtx } from "@/state/app";
import { addExerciseToSession, addSet, deleteSet, finishSession, importStrong, saveRoutine, saveSet, startSession, tickSet } from "./gym";

const NOW = Date.parse("2026-11-02T09:00:00Z") / 1000;
let store: Store;
const act = (): ActionCtx => ({ store, profile: { birthDate: "1990-01-01", sex: "male", maxHr: null, heightCm: null, timeZone: "UTC" }, timeZone: "UTC", nowS: () => NOW });
const ctx = (): QueryCtx => ({ ...act(), today: "2026-11-02", now: NOW, sync: { lastSyncTs: null, firstDay: null, lastError: null } });

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
  });

  it("finishes with a length", async () => {
    const started = await startSession(act(), { name: "Legs" });
    if (!started.ok) throw new Error("start");
    const done = await finishSession(store, started.data.session, NOW + 1800);
    expect(done.finished).toBe(true);
    expect((done.endTs ?? 0) - done.startTs).toBe(1800);
    expect(await store.gymSessions()).toHaveLength(1);
  });
});

describe("the import", () => {
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
});
