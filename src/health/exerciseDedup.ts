import { PAUSE_EVERY, type Steps } from "@/lib/yield";

export const MIN_EXERCISE_SEC = 2 * 60;

/**
 * ExerciseSessionRecord types a gym workout arrives as: other workout (the band's unclassified auto-detected copy),
 * calisthenics, HIIT, strength training and weights. Numeric, so this stays clear of the Health Connect mapping.
 */
const GYM_TYPES = new Set([0, 13, 36, 70, 81]);
/** The strength-typed half of GYM_TYPES: the gym's own record, preferred over the band's unclassified copy. */
const STRENGTH_TYPES = new Set([13, 36, 70, 81]);
/** A gym copy may start a few minutes early or end late; this much of the longer session must still overlap. */
const GYM_OVERLAP = 0.7;

type ExerciseRecord = {
  metadata?: { id?: string; dataOrigin?: string };
  startTime: string;
  endTime: string;
  exerciseType: number;
  title?: string;
};

/**
 * Cross-source copies need matching sports and nearly identical intervals; containment alone is ambiguous. A gym
 * session is the exception: the band's auto-detected copy can land under another sport's name and a few minutes off,
 * so gym-typed workouts that mostly overlap are one session. A run inside a strength session keeps its own entry.
 */
export function* uniqueExercises<T extends ExerciseRecord>(records: readonly T[]): Steps<T[]> {
  const ranked = records.map((record) => {
    const start = Date.parse(record.startTime);
    const end = Date.parse(record.endTime);
    return { record, start, end, eligible: Math.floor(end / 1000) - Math.floor(start / 1000) >= MIN_EXERCISE_SEC };
  });
  ranked.sort((a, b) =>
    Number(b.eligible) - Number(a.eligible) ||
    Number(STRENGTH_TYPES.has(b.record.exerciseType)) - Number(STRENGTH_TYPES.has(a.record.exerciseType)) ||
    Number(!!b.record.title?.trim()) - Number(!!a.record.title?.trim()) ||
    (b.end - b.start) - (a.end - a.start) ||
    (a.record.metadata?.dataOrigin ?? "").localeCompare(b.record.metadata?.dataOrigin ?? "") ||
    (a.record.metadata?.id ?? "").localeCompare(b.record.metadata?.id ?? ""),
  );
  const kept: typeof ranked = [];
  let comparisons = 0;
  for (const candidate of ranked) {
    if (++comparisons % PAUSE_EVERY === 0) yield;
    const source = candidate.record.metadata?.dataOrigin?.trim();
    let duplicate = false;
    if (source) for (const other of kept) {
      if (++comparisons % PAUSE_EVERY === 0) yield;
      const otherSource = other.record.metadata?.dataOrigin?.trim();
      if (!otherSource || source === otherSource) continue;
      const duration = Math.max(candidate.end - candidate.start, other.end - other.start);
      if (!(duration > 0)) continue;
      const overlap = Math.min(candidate.end, other.end) - Math.max(candidate.start, other.start);
      const same = candidate.record.exerciseType === other.record.exerciseType;
      const copy = same && Math.abs(candidate.start - other.start) <= 60_000 && Math.abs(candidate.end - other.end) <= 60_000 && overlap / duration >= 0.9;
      const gym = GYM_TYPES.has(candidate.record.exerciseType) && GYM_TYPES.has(other.record.exerciseType) && overlap / duration >= GYM_OVERLAP;
      if (copy || gym) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) kept.push(candidate);
  }
  return kept.sort((a, b) => a.start - b.start).map(({ record }) => record);
}
