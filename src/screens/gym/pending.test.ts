import { describe, expect, it, vi } from "vitest";
import type { GymExercise } from "@/core/gym/types";
import { hasPickerListener, onPickedExercise, pickedExercise } from "./pending";

const exercise = (id: string): GymExercise => ({ id, name: id, bodyPart: "chest", equipment: "barbell", custom: false, hold: false, unit: "kg", note: null });

describe("the exercise picker's return path", () => {
  it("keeps the editor subscribed for a second pick, and lets go on unmount", () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = onPickedExercise(first);
    const offSecond = onPickedExercise(second);

    pickedExercise(exercise("a"));
    pickedExercise(exercise("b"));
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);

    offFirst();
    offSecond();
    expect(hasPickerListener()).toBe(false);
  });
});
