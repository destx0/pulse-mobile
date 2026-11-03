// The bundled exercise catalogue: the lifts the picker offers, in Strong's naming ("Bench Press (Barbell)"), because
// that is what the owner's export already uses. Names are facts; this list was written for Pulse, not copied from
// another app's database. An id is the slug of the name and never changes once written, so sets keep pointing at the
// right lift after a rename.
import { slug } from "@/lib/ids";
import type { BodyPart, Equipment, GymExercise } from "./types";

/** name, body part, equipment, and `true` for a movement that is only ever held. */
type Row = [string, BodyPart, Equipment, true?];

const ROWS: Row[] = [
  // ── chest ─────────────────────────────────────────────────────────────────────────────────────────────────────
  ["Bench Press (Barbell)", "chest", "barbell"],
  ["Bench Press (Dumbbell)", "chest", "dumbbell"],
  ["Bench Press (Smith Machine)", "chest", "smith"],
  ["Bench Press (Machine)", "chest", "machine"],
  ["Chest Press (Machine)", "chest", "machine"],
  ["Incline Bench Press (Barbell)", "chest", "barbell"],
  ["Incline Bench Press (Dumbbell)", "chest", "dumbbell"],
  ["Incline Bench Press (Smith Machine)", "chest", "smith"],
  ["Incline Chest Press (Machine)", "chest", "machine"],
  ["Decline Bench Press (Barbell)", "chest", "barbell"],
  ["Decline Bench Press (Dumbbell)", "chest", "dumbbell"],
  ["Chest Fly", "chest", "machine"],
  ["Chest Fly (Dumbbell)", "chest", "dumbbell"],
  ["Chest Fly (Cable)", "chest", "cable"],
  ["Chest Fly (Machine)", "chest", "machine"],
  ["Incline Chest Fly (Dumbbell)", "chest", "dumbbell"],
  ["Pec Deck", "chest", "machine"],
  ["Cable Crossover", "chest", "cable"],
  ["Low Cable Crossover", "chest", "cable"],
  ["Push Up", "chest", "bodyweight"],
  ["Dip (Chest)", "chest", "bodyweight"],
  ["Pullover (Dumbbell)", "chest", "dumbbell"],
  ["Floor Press (Barbell)", "chest", "barbell"],
  ["Floor Press (Dumbbell)", "chest", "dumbbell"],

  // ── back ──────────────────────────────────────────────────────────────────────────────────────────────────────
  ["Deadlift (Barbell)", "back", "barbell"],
  ["Romanian Deadlift (Barbell)", "back", "barbell"],
  ["Romanian Deadlift (Dumbbell)", "back", "dumbbell"],
  ["Stiff Leg Deadlift (Barbell)", "back", "barbell"],
  ["Sumo Deadlift (Barbell)", "back", "barbell"],
  ["Rack Pull (Barbell)", "back", "barbell"],
  ["Bent Over Row (Barbell)", "back", "barbell"],
  ["Bent Over Row (Dumbbell)", "back", "dumbbell"],
  ["Pendlay Row (Barbell)", "back", "barbell"],
  ["T Bar Row", "back", "machine"],
  ["Seated Cable Row", "back", "cable"],
  ["Seated Row (Machine)", "back", "machine"],
  ["Chest Supported Row (Machine)", "back", "machine"],
  ["Iso-Lateral Row (Machine)", "back", "machine"],
  ["Lat Pulldown (Cable)", "back", "cable"],
  ["Close Grip Lat Pulldown (Cable)", "back", "cable"],
  ["Straight Arm Pulldown (Cable)", "back", "cable"],
  ["Single Arm Lat Pulldown (Cable)", "back", "cable"],
  ["Single Arm Cable Row", "back", "cable"],
  ["Pull Up", "back", "bodyweight"],
  ["Chin Up", "back", "bodyweight"],
  ["Assisted Pull Up", "back", "machine"],
  ["Weighted Pull Up", "back", "bodyweight"],
  ["Single Arm Dumbbell Row", "back", "dumbbell"],
  ["Inverted Row", "back", "bodyweight"],
  ["Face Pull (Cable)", "back", "cable"],
  ["Shrug (Barbell)", "traps", "barbell"],
  ["Shrug (Dumbbell)", "traps", "dumbbell"],
  ["Shrug (Smith Machine)", "traps", "smith"],
  ["Shrug (Machine)", "traps", "machine"],
  ["Back Extension (Machine)", "back", "machine"],
  ["Back Extension (Bodyweight)", "back", "bodyweight"],
  ["Hyperextension (Bodyweight)", "back", "bodyweight"],
  ["Good Morning (Barbell)", "back", "barbell"],
  ["Landmine Row", "back", "barbell"],

  // ── shoulders ────────────────────────────────────────────────────────────────────────────────────────────────
  ["Shoulder Press (Barbell)", "shoulders", "barbell"],
  ["Shoulder Press (Dumbbell)", "shoulders", "dumbbell"],
  ["Shoulder Press (Machine)", "shoulders", "machine"],
  ["Shoulder Press (Smith Machine)", "shoulders", "smith"],
  ["Shoulder Press (Plate Loaded)", "shoulders", "machine"],
  ["Arnold Press (Dumbbell)", "shoulders", "dumbbell"],
  ["Lateral Raise (Dumbbell)", "shoulders", "dumbbell"],
  ["Lateral Raise (Cable)", "shoulders", "cable"],
  ["Lateral Raise (Machine)", "shoulders", "machine"],
  ["Front Raise (Dumbbell)", "shoulders", "dumbbell"],
  ["Front Raise (Cable)", "shoulders", "cable"],
  ["Rear Delt Fly (Dumbbell)", "shoulders", "dumbbell"],
  ["Rear Delt Fly (Cable)", "shoulders", "cable"],
  ["Rear Delt Fly (Machine)", "shoulders", "machine"],
  ["Reverse Pec Deck", "shoulders", "machine"],
  ["Upright Row (Barbell)", "shoulders", "barbell"],
  ["Upright Row (Cable)", "shoulders", "cable"],
  ["Landmine Press", "shoulders", "barbell"],

  // ── biceps ───────────────────────────────────────────────────────────────────────────────────────────────────
  ["Bicep Curl (Barbell)", "biceps", "barbell"],
  ["Bicep Curl (Dumbbell)", "biceps", "dumbbell"],
  ["Bicep Curl (Cable)", "biceps", "cable"],
  ["Bicep Curl (Machine)", "biceps", "machine"],
  ["EZ Bar Curl", "biceps", "barbell"],
  ["Hammer Curl (Dumbbell)", "biceps", "dumbbell"],
  ["Hammer Curl (Cable)", "biceps", "cable"],
  ["Preacher Curl (Barbell)", "biceps", "barbell"],
  ["Preacher Curl (Dumbbell)", "biceps", "dumbbell"],
  ["Preacher Curl (Machine)", "biceps", "machine"],
  ["Concentration Curl (Dumbbell)", "biceps", "dumbbell"],
  ["Incline Curl (Dumbbell)", "biceps", "dumbbell"],
  ["Spider Curl (Barbell)", "biceps", "barbell"],
  ["Cable Curl", "biceps", "cable"],
  ["Reverse Curl (Barbell)", "biceps", "barbell"],

  // ── triceps ──────────────────────────────────────────────────────────────────────────────────────────────────
  ["Triceps Pushdown (Cable - Rope)", "triceps", "cable"],
  ["Triceps Pushdown (Cable - Straight Bar)", "triceps", "cable"],
  ["Triceps Pushdown (Cable - V-Bar)", "triceps", "cable"],
  ["Skullcrusher (Barbell)", "triceps", "barbell"],
  ["Skullcrusher (Dumbbell)", "triceps", "dumbbell"],
  ["Close Grip Bench Press (Barbell)", "triceps", "barbell"],
  ["Triceps Extension", "triceps", "cable"],
  ["Triceps Extension (Dumbbell)", "triceps", "dumbbell"],
  ["Triceps Extension (Cable)", "triceps", "cable"],
  ["Overhead Triceps Extension (Cable)", "triceps", "cable"],
  ["Triceps Dip", "triceps", "bodyweight"],
  ["Triceps Dip (Assisted)", "triceps", "machine"],
  ["Bench Dip", "triceps", "bodyweight"],
  ["Triceps Kickback (Dumbbell)", "triceps", "dumbbell"],
  ["Triceps Kickback (Cable)", "triceps", "cable"],
  ["Single Arm Triceps Extension (Cable)", "triceps", "cable"],
  ["JM Press (Barbell)", "triceps", "barbell"],

  // ── forearms ─────────────────────────────────────────────────────────────────────────────────────────────────
  ["Wrist Curl (Barbell)", "forearms", "barbell"],
  ["Wrist Curl (Dumbbell)", "forearms", "dumbbell"],
  ["Reverse Wrist Curl (Barbell)", "forearms", "barbell"],
  ["Reverse Wrist Curl (Dumbbell)", "forearms", "dumbbell"],
  ["Reverse Curl (Cable)", "forearms", "cable"],
  ["Farmer's Carry (Dumbbell)", "forearms", "dumbbell"],
  ["Dead Hang", "forearms", "bodyweight", true],
  ["Plate Pinch", "forearms", "plate", true],
  ["Plate Curl", "forearms", "plate"],

  // ── quads ────────────────────────────────────────────────────────────────────────────────────────────────────
  ["Squat (Barbell)", "quads", "barbell"],
  ["Front Squat (Barbell)", "quads", "barbell"],
  ["Squat (Bodyweight)", "quads", "bodyweight"],
  ["Squat (Smith Machine)", "quads", "smith"],
  ["Squat (Dumbbell)", "quads", "dumbbell"],
  ["Hack Squat", "quads", "machine"],
  ["Leg Press", "quads", "machine"],
  ["Belt Squat", "quads", "machine"],
  ["Goblet Squat (Dumbbell)", "quads", "dumbbell"],
  ["Bulgarian Split Squat (Dumbbell)", "quads", "dumbbell"],
  ["Lunge (Dumbbell)", "quads", "dumbbell"],
  ["Lunge (Barbell)", "quads", "barbell"],
  ["Walking Lunge (Dumbbell)", "quads", "dumbbell"],
  ["Step Up (Dumbbell)", "quads", "dumbbell"],
  ["Leg Extension (Machine)", "quads", "machine"],
  ["Sissy Squat (Bodyweight)", "quads", "bodyweight"],
  ["Box Squat (Barbell)", "quads", "barbell"],
  ["Wall Sit", "quads", "bodyweight", true],

  // ── hamstrings ───────────────────────────────────────────────────────────────────────────────────────────────
  ["Lying Leg Curl (Machine)", "hamstrings", "machine"],
  ["Seated Leg Curl (Machine)", "hamstrings", "machine"],
  ["Leg Curl (Cable)", "hamstrings", "cable"],
  ["Nordic Curl", "hamstrings", "bodyweight"],
  ["Glute Ham Raise", "hamstrings", "bodyweight"],
  ["Single Leg Romanian Deadlift (Dumbbell)", "hamstrings", "dumbbell"],
  ["Stiff Leg Deadlift (Dumbbell)", "hamstrings", "dumbbell"],

  // ── glutes ───────────────────────────────────────────────────────────────────────────────────────────────────
  ["Hip Thrust (Barbell)", "glutes", "barbell"],
  ["Hip Thrust (Machine)", "glutes", "machine"],
  ["Glute Bridge (Bodyweight)", "glutes", "bodyweight"],
  ["Cable Kickback", "glutes", "cable"],
  ["Hip Abduction (Machine)", "glutes", "machine"],
  ["Hip Adduction (Machine)", "glutes", "machine"],
  ["Sumo Squat (Dumbbell)", "glutes", "dumbbell"],
  ["Reverse Hyperextension (Machine)", "glutes", "machine"],

  // ── calves ───────────────────────────────────────────────────────────────────────────────────────────────────
  ["Standing Calf Raise (Machine)", "calves", "machine"],
  ["Standing Calf Raise (Dumbbell)", "calves", "dumbbell"],
  ["Standing Calf Raise (Smith Machine)", "calves", "smith"],
  ["Seated Calf Raise (Machine)", "calves", "machine"],
  ["Seated Calf Raise (Plate Loaded)", "calves", "machine"],
  ["Donkey Calf Raise (Machine)", "calves", "machine"],
  ["Calf Press (Leg Press)", "calves", "machine"],

  // ── core ─────────────────────────────────────────────────────────────────────────────────────────────────────
  ["Plank", "core", "bodyweight", true],
  ["Side Plank", "core", "bodyweight", true],
  ["Hollow Hold", "core", "bodyweight", true],
  ["Crunch (Bodyweight)", "core", "bodyweight"],
  ["Sit Up", "core", "bodyweight"],
  ["Cable Crunch", "core", "cable"],
  ["Hanging Leg Raise", "core", "bodyweight"],
  ["Lying Leg Raise", "core", "bodyweight"],
  ["Ab Wheel Rollout", "core", "other"],
  ["Russian Twist (Bodyweight)", "core", "bodyweight"],
  ["Dead Bug", "core", "bodyweight"],
  ["Pallof Press (Cable)", "core", "cable"],
  ["Mountain Climber", "core", "bodyweight"],
  ["Neck Curl", "core", "bodyweight"],

  // ── cardio ───────────────────────────────────────────────────────────────────────────────────────────────────
  ["Running (Treadmill)", "cardio", "machine"],
  ["Running (Outdoor)", "cardio", "bodyweight"],
  ["Walking (Treadmill)", "cardio", "machine"],
  ["Incline Walk (Treadmill)", "cardio", "machine"],
  ["Cycling (Stationary Bike)", "cardio", "machine"],
  ["Cycling (Outdoor)", "cardio", "other"],
  ["Rowing (Machine)", "cardio", "machine"],
  ["Stair Climber", "cardio", "machine"],
  ["Elliptical", "cardio", "machine"],
  ["Jump Rope", "cardio", "other"],
  ["Swimming", "cardio", "other"],

  // ── full body ────────────────────────────────────────────────────────────────────────────────────────────────
  ["Power Clean (Barbell)", "full body", "barbell"],
  ["Clean (Barbell)", "full body", "barbell"],
  ["Clean and Jerk (Barbell)", "full body", "barbell"],
  ["Snatch (Barbell)", "full body", "barbell"],
  ["Thruster (Barbell)", "full body", "barbell"],
  ["Kettlebell Swing", "full body", "kettlebell"],
  ["Burpee", "full body", "bodyweight"],
  ["Turkish Get Up (Kettlebell)", "full body", "kettlebell"],
  ["Sled Push", "full body", "machine"],
  ["Battle Ropes", "full body", "other"],
];

export const CATALOGUE: GymExercise[] = ROWS.map(([name, bodyPart, equipment, hold]) => ({
  id: slug(name),
  name,
  bodyPart,
  equipment,
  custom: false,
  hold: hold === true,
  unit: "kg",
  note: null,
}));

export const BY_ID = new Map(CATALOGUE.map((e) => [e.id, e]));

export const isCardio = (e: Pick<GymExercise, "bodyPart">) => e.bodyPart === "cardio";

/**
 * Names the exporter writes that are not a catalogue name, mapped to the catalogue entry they mean. Strong's own names
 * ("Lat Pulldown (Cable)") are in the catalogue unchanged; this table is for the owner's shorthand ("rowing cable") and
 * for the spellings other apps use.
 */
const ALIASES: Record<string, string> = {
  // the owner's shorthand, from the real export
  hang: "dead-hang",
  "shoulder press dumpbell": "shoulder-press-dumbbell",
  "rowing cable": "seated-cable-row",
  "rowing cable seat": "seated-cable-row",
  "trap dumbbell": "shrug-dumbbell",
  "trap smith machine": "shrug-smith-machine",
  "rear delt fly cable": "rear-delt-fly-cable",
  butterfly: "pec-deck",
  "triceps extension v": "triceps-pushdown-cable-v-bar",
  "triceps rope extension": "triceps-pushdown-cable-rope",
  "forearm curl": "wrist-curl-barbell",
  "forearm curl reverse": "reverse-wrist-curl-barbell",
  "shoulder press barbell": "shoulder-press-barbell",
  "triceps kickback": "triceps-kickback-dumbbell",
  "bench press real rod": "bench-press-barbell",
  "bench press proper barbell": "bench-press-barbell",
  "lounge walk": "walking-lunge-dumbbell",
  "single arm cable cross": "cable-crossover",
  "rear delt raise": "rear-delt-fly-dumbbell",
  "neck curl": "neck-curl",
  // common spellings from other apps and from Strong's own keyboard
  "pull up (assisted)": "assisted-pull-up",
  "bent over one arm row (dumbbell)": "single-arm-dumbbell-row",
  "hamstring curl": "lying-leg-curl-machine",
  "close grip lat pulldown": "close-grip-lat-pulldown-cable",
  "incline dumbbell fly": "incline-chest-fly-dumbbell",
  "pec deck (machine)": "pec-deck",
  "cable row single arm": "single-arm-cable-row",
  "triceps extension single arm": "single-arm-triceps-extension-cable",
  "bench press": "bench-press-barbell",
  "squat": "squat-barbell",
  deadlift: "deadlift-barbell",
  "bent over row": "bent-over-row-barbell",
  "overhead press": "shoulder-press-barbell",
  "military press": "shoulder-press-barbell",
  "lat pulldown": "lat-pulldown-cable",
  "pull down": "lat-pulldown-cable",
  "seated row": "seated-cable-row",
  "cable row": "seated-cable-row",
  "leg press": "leg-press",
  "leg curl": "lying-leg-curl-machine",
  "leg extension": "leg-extension-machine",
  "calf raise": "standing-calf-raise-machine",
  "lateral raise": "lateral-raise-dumbbell",
  "side raise": "lateral-raise-dumbbell",
  "rear delt fly": "rear-delt-fly-dumbbell",
  "face pull": "face-pull-cable",
  "bicep curl": "bicep-curl-dumbbell",
  "biceps curl": "bicep-curl-dumbbell",
  "dumbbell curl": "bicep-curl-dumbbell",
  "hammer curl": "hammer-curl-dumbbell",
  "preacher curl": "preacher-curl-dumbbell",
  "triceps pushdown": "triceps-pushdown-cable-rope",
  "tricep pushdown": "triceps-pushdown-cable-rope",
  pushdown: "triceps-pushdown-cable-rope",
  skullcrusher: "skullcrusher-barbell",
  "skull crusher": "skullcrusher-barbell",
  "close grip bench press": "close-grip-bench-press-barbell",
  "triceps dip": "triceps-dip",
  dip: "dip-chest",
  "push up": "push-up",
  "pushup": "push-up",
  "pull up": "pull-up",
  "pullup": "pull-up",
  "chin up": "chin-up",
  "pull ups": "pull-up",
  lunge: "lunge-dumbbell",
  lunges: "lunge-dumbbell",
  "walking lunge": "walking-lunge-dumbbell",
  "hip thrust": "hip-thrust-barbell",
  "romanian deadlift": "romanian-deadlift-barbell",
  "rdl": "romanian-deadlift-barbell",
  "stiff leg deadlift": "stiff-leg-deadlift-barbell",
  "sumo deadlift": "sumo-deadlift-barbell",
  "t bar row": "t-bar-row",
  "chest fly": "chest-fly",
  "cable crossover": "cable-crossover",
  "cable cross over": "cable-crossover",
  "pec deck": "pec-deck",
  "hack squat": "hack-squat",
  "goblet squat": "goblet-squat-dumbbell",
  "front squat": "front-squat-barbell",
  "bulgarian split squat": "bulgarian-split-squat-dumbbell",
  "step up": "step-up-dumbbell",
  "shrug": "shrug-dumbbell",
  "shrugs": "shrug-dumbbell",
  "upright row": "upright-row-barbell",
  "good morning": "good-morning-barbell",
  "back extension": "back-extension-machine",
  "hyperextension": "hyperextension-bodyweight",
  "wrist curl": "wrist-curl-barbell",
  "reverse wrist curl": "reverse-wrist-curl-barbell",
  "farmer carry": "farmer-s-carry-dumbbell",
  "farmers carry": "farmer-s-carry-dumbbell",
  "farmer's carry": "farmer-s-carry-dumbbell",
  "dead hang": "dead-hang",
  plank: "plank",
  "side plank": "side-plank",
  crunch: "crunch-bodyweight",
  "sit up": "sit-up",
  "situp": "sit-up",
  "cable crunch": "cable-crunch",
  "hanging leg raise": "hanging-leg-raise",
  "leg raise": "lying-leg-raise",
  "ab wheel": "ab-wheel-rollout",
  "ab rollout": "ab-wheel-rollout",
  "pallof press": "pallof-press-cable",
  "russian twist": "russian-twist-bodyweight",
  "dead bug": "dead-bug",
  "mountain climber": "mountain-climber",
  treadmill: "running-treadmill",
  "treadmill run": "running-treadmill",
  "treadmill walk": "walking-treadmill",
  "incline walk": "incline-walk-treadmill",
  running: "running-outdoor",
  walk: "walking-treadmill",
  rowing: "rowing-machine",
  "rowing machine": "rowing-machine",
  cycling: "cycling-stationary-bike",
  bike: "cycling-stationary-bike",
  elliptical: "elliptical",
  "stair climber": "stair-climber",
  "jump rope": "jump-rope",
  "kb swing": "kettlebell-swing",
  "kettlebell swing": "kettlebell-swing",
  "power clean": "power-clean-barbell",
  "clean and jerk": "clean-and-jerk-barbell",
  thruster: "thruster-barbell",
  burpee: "burpee",
  "sled push": "sled-push",
  "battle ropes": "battle-ropes",
};

/** Lower-case, parenthesised qualifiers kept, whitespace collapsed: the key both the alias table and the catalogue use. */
const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

const ALIAS_BY_KEY = new Map(Object.entries(ALIASES));
const BY_KEY = new Map(CATALOGUE.map((e) => [key(e.name), e.id]));

/** The catalogue id a name means, or null when it is the owner's own. Exact names first, then the alias table. */
export function resolveExerciseId(name: string): string | null {
  const k = key(name);
  return BY_KEY.get(k) ?? ALIAS_BY_KEY.get(k) ?? null;
}

/** The name a picked exercise shows, from the catalogue or the owner's own exercises. */
export function exerciseName(id: string, custom: Map<string, GymExercise>): string {
  return BY_ID.get(id)?.name ?? custom.get(id)?.name ?? id;
}

/** Search over the catalogue plus the owner's exercises: every word must appear, so "incline dumbbell" finds the press. */
export function searchExercises(query: string, extra: GymExercise[], limit = 40, source: readonly GymExercise[] = CATALOGUE): GymExercise[] {
  const words = key(query).split(" ").filter(Boolean);
  const all = [...extra, ...source];
  if (!words.length) return all.slice(0, limit);
  const hits: { e: GymExercise; score: number }[] = [];
  for (const e of all) {
    const n = key(e.name);
    if (!words.every((w) => n.includes(w))) continue;
    const score = n.startsWith(words[0]) ? 0 : n.includes(` ${words[0]}`) ? 1 : 2;
    hits.push({ e, score });
  }
  return hits
    .sort((a, b) => a.score - b.score || a.e.name.length - b.e.name.length || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((h) => h.e);
}
