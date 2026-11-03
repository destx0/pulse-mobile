import { describe, expect, it } from "vitest";
import { CATALOGUE, resolveExerciseId, searchExercises } from "./catalogue";
import { importStrongCsv, looksLikeStrong, parseCsvRows } from "./csv";
import { brzycki, estimate1Rm, epley, loadText, platesPerSide, roundLoad, toUnit } from "./load";
import { bestSet, groupByExercise, oneRmSeries, previousSets, recordsOf, setsRecord, volumeOf } from "./stats";
import type { GymSet } from "./types";

const set = (o: Partial<GymSet> & { id: string }): GymSet => ({
  sessionId: "s1",
  exerciseId: "bench-press-barbell",
  position: 0,
  setNo: 1,
  weightKg: 60,
  reps: 8,
  seconds: null,
  distanceM: null,
  rpe: null,
  type: "normal",
  supersetId: null,
  completed: true,
  ts: 1000,
  note: null,
  ...o,
});

describe("the catalogue", () => {
  it("has one entry per id, and every alias points at one", () => {
    const ids = CATALOGUE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(resolveExerciseId("Lat Pulldown (Cable)")).toBe("lat-pulldown-cable");
    expect(resolveExerciseId("rowing cable")).toBe("seated-cable-row");
    expect(resolveExerciseId("hang")).toBe("dead-hang");
    expect(resolveExerciseId("something nobody has named")).toBeNull();
  });

  it("finds an exercise by every word of a query", () => {
    const hits = searchExercises("incline dumbbell", []);
    expect(hits.slice(0, 3).map((e) => e.name)).toContain("Incline Bench Press (Dumbbell)");
    expect(hits.every((e) => /incline/i.test(e.name) && /dumbbell/i.test(e.name))).toBe(true);
    expect(searchExercises("zzzz", []).length).toBe(0);
  });

  it("offers the whole catalogue when the picker asks for all of it", () => {
    expect(searchExercises("", [], 1000)).toHaveLength(CATALOGUE.length);
  });
});

describe("one-rep max", () => {
  it("gives the weight itself for a single, and Epley's estimate past it", () => {
    expect(estimate1Rm(100, 1)).toBe(100);
    expect(epley(100, 5)).toBeCloseTo(116.7, 1);
    expect(estimate1Rm(100, 5)).toBeCloseTo(116.7, 1); // the heavier of the two up to 10 reps
    expect(brzycki(100, 37)).toBe(0);
  });

  it("is zero for a bodyweight or timed set", () => {
    expect(estimate1Rm(0, 10)).toBe(0);
    expect(estimate1Rm(80, 0)).toBe(0);
  });
});

describe("plates", () => {
  it("splits a 100 kg bar into one plate per side, and leaves what it cannot make", () => {
    expect(platesPerSide(100, 20, [25, 20, 15, 10, 5, 2.5], "kg").perSide).toEqual([25, 15]);
    const r = platesPerSide(100.3, 20, [25, 20, 15, 10, 5, 2.5], "kg");
    expect(r.perSide).toEqual([25, 15]);
    expect(r.remainder).toBeCloseTo(0.15, 2);
    expect(platesPerSide(10, 20, [25], "kg").belowBar).toBe(true);
  });

  it("converts to pounds for a pound gym", () => {
    expect(roundLoad(45 * 0.45359237, "lb")).toBe(45);
    expect(toUnit(100, "lb")).toBeCloseTo(220.46, 1);
  });

  it("shows a stored weight without snapping it to a plate step", () => {
    expect(loadText(62.25, "kg")).toBe("62.25");
    expect(loadText(45 * 0.45359237, "lb")).toBe("45");
    expect(loadText(60, "lb")).toBe("132.3");
  });
});

describe("the history", () => {
  const sets = [
    set({ id: "a", sessionId: "s1", ts: 1000, setNo: 1, weightKg: 60, reps: 8 }),
    set({ id: "b", sessionId: "s1", ts: 1000, setNo: 2, weightKg: 65, reps: 6 }),
    set({ id: "c", sessionId: "s2", ts: 2000, setNo: 1, weightKg: 70, reps: 5 }),
    set({ id: "d", sessionId: "s2", ts: 2000, setNo: 2, weightKg: 20, reps: 10, type: "warmup" }),
  ];

  it("leaves warmups out of volume and records", () => {
    expect(volumeOf(sets)).toBe(60 * 8 + 65 * 6 + 70 * 5);
    expect(recordsOf(sets).get("bench-press-barbell")).toMatchObject({ weightKg: 70, reps: 5 });
  });

  it("shows the previous session's sets, not an earlier one, and nothing from the future", () => {
    const prev = previousSets(sets, "bench-press-barbell", 2500);
    expect(prev?.sessionId).toBe("s2");
    expect(prev?.byNo.get(1)?.weightKg).toBe(70);
    expect(previousSets(sets, "bench-press-barbell", 500)).toBeNull();
  });

  it("does not let a warmup-only session become the previous column", () => {
    const only = [
      set({ id: "a", sessionId: "s1", ts: 1000, weightKg: 70, reps: 5 }),
      set({ id: "w", sessionId: "s2", ts: 2000, weightKg: 20, reps: 10, type: "warmup" }),
    ];
    const prev = previousSets(only, "bench-press-barbell", 3000);
    expect(prev?.sessionId).toBe("s1");
    expect(prev?.byNo.get(1)?.weightKg).toBe(70);
  });

  it("draws the 1RM curve one point per session", () => {
    expect(oneRmSeries(sets, "bench-press-barbell").map((p) => p.ts)).toEqual([1000, 2000]);
  });

  it("calls a set a record only when it beats every earlier one", () => {
    expect(setsRecord(sets, set({ id: "c" }))).toBe(true);
    expect(setsRecord(sets, set({ id: "z", weightKg: 60, reps: 8, ts: 3000 }))).toBe(false);
    expect(setsRecord(sets, set({ id: "w", weightKg: 200, reps: 5, ts: 3000, type: "warmup" }))).toBe(false);
  });

  it("groups a session by exercise in the order it was trained", () => {
    const g = groupByExercise([set({ id: "1", exerciseId: "squat-barbell", position: 1 }), set({ id: "2", position: 0 }), set({ id: "3", position: 0, setNo: 2 })]);
    expect(g.map((x) => x.exerciseId)).toEqual(["bench-press-barbell", "squat-barbell"]);
    expect(g[0].sets.map((s) => s.setNo)).toEqual([1, 2]);
  });

  it("picks the best set by estimated 1RM", () => {
    expect(bestSet(sets)?.id).toBe("c");
  });
});

describe("reading Strong's CSV", () => {
  const STRONG = [
    '"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"',
    '"1";"2021-08-30 17:56:13";"Push";"1362";"Bench Press (Barbell)";"1";"20.0";"15";"";"";"";"";""',
    '"1";"2021-08-30 17:56:13";"Push";"1362";"Bench Press (Barbell)";"2";"25.0";"10";"";"";"";"Paused reps";""',
    '"1";"2021-08-30 17:56:13";"Push";"1362";"Bench Press (Barbell)";"Note";"";"";"";"";"";"Elbow felt fine";""',
    '"1";"2021-08-30 17:56:13";"Push";"1362";"hang";"1";"";"";"";"";"30";"";""',
    '"1";"2021-08-30 17:56:13";"Push";"1362";"Plank";"1";"";"";"";"";"60";"";""',
    '"1";"2021-08-30 17:56:13";"Push";"1362";"Running (Treadmill)";"1";"";"";"";"2000";"1080";"";""',
    '"1";"2021-08-30 17:56:13";"Push";"1362";"Lateral Raise (Machine)";"1";"";"";"";"";"";"";""',
    '"1";"2021-08-30 17:56:13";"Push";"1362";"Lateral Raise (Machine)";"Rest Timer";"";"";"";"";"";"";""',
    '"2";"2021-08-31 07:00:00";"Pull";"999999";"Bent Over Row (Barbell)";"1";"60";"8";"8";"";"";"";"Heavy day"',
    '"1";"2021-08-30 17:56:13";"Push";"1362";"Bench Press (Barbell)";"3";"30";"8";"";"";"";"";""',
  ].join("\r\n");

  const { sessions, summary } = importStrongCsv(STRONG, { timeZone: "Asia/Kolkata" });

  it("recognises the header and the semicolon delimiter", () => {
    expect(looksLikeStrong(parseCsvRows(STRONG)[0])).toBe(true);
    expect(parseCsvRows(STRONG)[1][4]).toBe("Bench Press (Barbell)");
  });

  it("keeps the session's length, capped, and its day in the phone's zone", () => {
    expect(sessions).toHaveLength(2);
    expect(sessions[0].startTs).toBe(Date.parse("2021-08-30T17:56:13+05:30") / 1000);
    expect(sessions[0].day).toBe("2021-08-30");
    expect(sessions[0].endTs! - sessions[0].startTs).toBe(1362);
    expect(summary.cappedDuration).toBe(1);
    expect(sessions[1].endTs! - sessions[1].startTs).toBe(6 * 3600);
  });

  it("imports only rows that measured something", () => {
    // 6 real sets; the note row, the rest-timer row and the empty lateral raise are not sets.
    expect(sessions[0].sets).toHaveLength(6);
    expect(summary.sets).toBe(7);
    expect(summary.skipped).toBe(2);
  });

  it("keeps a note on the exercise it follows, and the workout note on the session", () => {
    const bench = sessions[0].sets.filter((s) => s.exercise === "Bench Press (Barbell)");
    expect(bench[1].note).toBe("Paused reps\nElbow felt fine");
    expect(sessions[1].notes).toBe("Heavy day");
    expect(summary.notes).toBe(1);
  });

  it("reads a hold as seconds and a treadmill row as distance and time", () => {
    const hang = sessions[0].sets.find((s) => s.exercise === "hang")!;
    expect(hang).toMatchObject({ weightKg: 0, reps: 0, seconds: 30, distanceM: null });
    const run = sessions[0].sets.find((s) => s.exercise === "Running (Treadmill)")!;
    expect(run).toMatchObject({ distanceM: 2000, seconds: 1080, reps: 0 });
  });

  it("carries an RPE through", () => {
    expect(sessions[1].sets[0].rpe).toBe(8);
  });
});
