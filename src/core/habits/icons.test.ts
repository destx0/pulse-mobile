import { describe, expect, it } from "vitest";
import { HABIT_ICONS, habitIcon } from "./icons";

describe("habit icons", () => {
  it("keeps an icon per id and always picks one from the palette", () => {
    expect(habitIcon({ id: "a" })).toBe(habitIcon({ id: "a" }));
    expect(HABIT_ICONS).toContain(habitIcon({ id: "3c5b7e37-84e0-4e5f-9a6e-1f0f0a3f9d21" }));
  });
});
