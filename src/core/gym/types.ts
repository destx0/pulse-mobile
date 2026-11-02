// The gym log's own domain, kept apart from the health rows in src/data/types.ts: a session is one trip to the gym, its
// sets are grouped by exercise, and a routine is the template a session is started from. Pure TypeScript, no I/O, so the
// importer, the queries and the screens all read the same shapes and the tests run in Node.

/** The muscle group a lift trains. `cardio` is the only one that is not a lift. */
export type BodyPart =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "traps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "cardio"
  | "full body";

export type Equipment = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "smith" | "kettlebell" | "band" | "plate" | "other";

/** The unit an exercise is entered in. Weight is stored in kilograms either way. */
export type WeightUnit = "kg" | "lb";

/** One lift in the catalogue, or one the owner added. `id` is the slug of the name and never changes. */
export type GymExercise = {
  id: string;
  name: string;
  bodyPart: BodyPart;
  equipment: Equipment;
  /** Added by the owner (or by the importer, for a name it did not know), not from the bundled catalogue. */
  custom: boolean;
  /** A movement that is only ever held (a plank, a dead hang): a new set starts as seconds, not reps. */
  hold: boolean;
  /** The unit this exercise is entered in, per exercise as Strong does it. */
  unit: WeightUnit;
  note: string | null;
};

/** A set's role. Warmups and drops are left out of PRs and volume; a failure set is an ordinary set taken to failure. */
export type SetType = "normal" | "warmup" | "drop" | "failure";

/**
 * One set. Weight is kilograms and reps an integer; a hold carries `seconds`, cardio carries `seconds` and/or
 * `distanceM`. `position` is the exercise's slot in the session (0-based), so a session's exercises keep their order
 * without a second table, and `setNo` is the number shown in the left column.
 */
export type GymSet = {
  id: string;
  sessionId: string;
  exerciseId: string;
  position: number;
  setNo: number;
  weightKg: number;
  reps: number;
  seconds: number | null;
  distanceM: number | null;
  rpe: number | null;
  type: SetType;
  /** The superset this set belongs to, if any: two exercises sharing an id are trained back to back, with no rest
   *  between them. */
  supersetId: string | null;
  completed: boolean;
  /** When it was ticked (unix seconds); null until then. */
  ts: number | null;
  note: string | null;
};

/**
 * One workout. `finished` is false while it is in progress, and the row is written before the first set, so a session
 * survives the app being killed. `restStartedTs`/`restSec` are the running rest timer, kept here for the same reason.
 */
export type GymSession = {
  id: string;
  day: string;
  startTs: number;
  endTs: number | null;
  name: string;
  notes: string | null;
  routineId: string | null;
  finished: boolean;
  restStartedTs: number | null;
  restSec: number | null;
};

/** A template: the list of exercises a session starts with. */
export type GymRoutine = {
  id: string;
  name: string;
  notes: string | null;
  position: number;
  updatedAt: number;
};

export type GymRoutineItem = {
  routineId: string;
  exerciseId: string;
  position: number;
  /** Planned sets and reps; 0 sets means "as many as you do". */
  sets: number;
  reps: number;
  restSec: number | null;
  note: string | null;
};

/** A body measurement, one value per kind per day. */
export type MeasurementKind = "weight" | "bodyFat" | "chest" | "waist" | "hips" | "neck" | "arm" | "thigh" | "calf";

export type GymMeasurement = { id: string; day: string; kind: MeasurementKind; value: number };

/** The kinds, in the order the measurements screen lists them, with their unit and whether they are a percentage. */
export const MEASUREMENTS: { kind: MeasurementKind; unit: string }[] = [
  { kind: "weight", unit: "kg" },
  { kind: "bodyFat", unit: "%" },
  { kind: "neck", unit: "cm" },
  { kind: "chest", unit: "cm" },
  { kind: "waist", unit: "cm" },
  { kind: "hips", unit: "cm" },
  { kind: "arm", unit: "cm" },
  { kind: "thigh", unit: "cm" },
  { kind: "calf", unit: "cm" },
];

export const BODY_PARTS: BodyPart[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "traps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "cardio",
  "full body",
];

/** The set types a menu offers, in the order it shows them. */
export const SET_TYPES: SetType[] = ["normal", "warmup", "drop", "failure"];

/** A session's length in seconds, or null while it runs. */
export const sessionSeconds = (s: GymSession, now: number) => Math.max(0, (s.endTs ?? now) - s.startTs);
