// The exercise picker returns a choice to the screen that opened it without writing anything itself: the template
// editor keeps its draft in memory, so the picker cannot write the routine. A screen subscribes while it is open (a
// pushed screen stays mounted), the picker emits, and the editor puts the lift in its draft.
import type { GymExercise } from "@/core/gym/types";

type Listener = (exercise: GymExercise) => void;
const listeners = new Set<Listener>();

export function onPickedExercise(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const hasPickerListener = () => listeners.size > 0;

export function pickedExercise(exercise: GymExercise): void {
  const current = [...listeners];
  listeners.clear();
  for (const l of current) l(exercise);
}
