// The gym log's rows, as the Store hands them over. The shapes are the domain's own (src/core/gym/types.ts) so a query
// does not convert anything: this file only adds what the database keeps beyond a session, a set or a routine — the
// import mark, so a second import does not duplicate the history.
import type { GymExercise, GymMeasurement, GymRoutine, GymRoutineItem, GymSession, GymSet, SetType } from "@/core/gym/types";

export type { GymExercise, GymMeasurement, GymRoutine, GymRoutineItem, GymSession, GymSet, SetType };

/** What the last Strong import wrote. One row: an import does not need a history of itself. */
export type GymImportState = { importedAt: number; sessions: number; sets: number; firstDay: string | null; lastDay: string | null };

export const EMPTY_IMPORT: GymImportState = { importedAt: 0, sessions: 0, sets: 0, firstDay: null, lastDay: null };
