// The habit tracker's own types (src/core/habits): a habit and its one entry per day. Pure data, shared by the store,
// the screens and the home-screen widgets, which run outside React.

/** Yes/no habits count occurrences; numeric habits add up an amount per period. */
export type HabitKind = "yes_no" | "numeric";

/** How often the target is due. A week runs Monday to Sunday. */
export type HabitPeriod = "day" | "week" | "month";

/** Numeric habits only: a target to reach, or a limit not to exceed. */
export type HabitTargetType = "at_least" | "at_most";

/** A theme colour key (src/ui/habits.ts maps it to the palette in force). */
export type HabitColor = "optimal" | "strain" | "coach" | "warning" | "recovery-red" | "recovery-blue" | "sleep" | "recovery-green";

export const HABIT_COLORS: readonly HabitColor[] = ["optimal", "strain", "coach", "warning", "recovery-red", "recovery-blue", "sleep", "recovery-green"];

export type Habit = {
  id: string;
  name: string;
  /** The question the habit asks ("Did you read?"), shown under the name when set. */
  question: string | null;
  /** A free note about the habit (why, how). */
  notes: string | null;
  kind: HabitKind;
  color: HabitColor;
  period: HabitPeriod;
  /** Times per period for yes/no, amount per period for numeric. */
  target: number;
  targetType: HabitTargetType;
  /** The numeric amount's unit ("glasses", "min"); null for yes/no. */
  unit: string | null;
  position: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

/** One day's entry. No row means no entry (unknown). `skip` takes the day out of the score and the period. */
export type HabitEntry = {
  habitId: string;
  /** Local `YYYY-MM-DD`. */
  day: string;
  /** Yes/no: 1 done, 0 not done. Numeric: the amount (0 is a real amount). */
  value: number;
  skip: boolean;
  note: string | null;
  updatedAt: number;
};
