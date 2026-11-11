// The habit tracker's rows, as the Store hands them over. The shapes are the domain's own (src/core/habits/types.ts)
// so a query or an action never builds a second version of a habit.
import type { Habit, HabitEntry } from "@/core/habits/types";

export type { Habit, HabitEntry };
