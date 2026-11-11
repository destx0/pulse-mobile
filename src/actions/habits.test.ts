// The habit tracker's writes on the in-memory store: create, edit, tick, skip, archive and delete, with the rules the
// editor relies on.
import { beforeEach, describe, expect, it } from "vitest";
import { openMemoryStore } from "@/data/memory";
import type { Store } from "@/data/store";
import { archiveHabit, deleteHabit, saveHabit, setHabitEntry, skipHabitDay, toggleHabit, type HabitInput } from "./habits";

const NOW = Date.parse("2026-11-02T09:00:00Z") / 1000;
let store: Store;
const input = (over: Partial<HabitInput> = {}): HabitInput => ({
  name: "Read",
  kind: "yes_no",
  color: "optimal",
  period: "day",
  target: 1,
  targetType: "at_least",
  ...over,
});

beforeEach(() => {
  store = openMemoryStore();
});

describe("a habit", () => {
  it("is created with the next position and survives an edit", async () => {
    const first = await saveHabit(store, input(), NOW);
    const second = await saveHabit(store, input({ name: "Walk", color: "strain" }), NOW + 1);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.position).toBe(1);
    const edited = await saveHabit(store, input({ id: first.data.id, name: "Read 20 pages", target: 2, period: "week" }), NOW + 2);
    expect(edited.ok && edited.data).toMatchObject({ id: first.data.id, name: "Read 20 pages", target: 2, period: "week", position: 0, createdAt: NOW, updatedAt: NOW + 2 });
    expect(await store.habits()).toHaveLength(2);
  });

  it("refuses a blank name and a target outside its kind", async () => {
    expect(await saveHabit(store, input({ name: "  " }), NOW)).toEqual({ ok: false, error: "invalid" });
    expect(await saveHabit(store, input({ target: 0 }), NOW)).toEqual({ ok: false, error: "invalid" });
    expect(await saveHabit(store, input({ kind: "numeric", target: 0 }), NOW)).toEqual({ ok: false, error: "invalid" });
  });

  it("ticks a yes/no day, clears it on the second tap, and skips a day", async () => {
    const res = await saveHabit(store, input(), NOW);
    if (!res.ok) throw new Error("habit");
    const habit = res.data;
    expect(await toggleHabit(store, habit, "2026-11-02", NOW)).toMatchObject({ value: 1, skip: false });
    expect(await store.habitEntries()).toHaveLength(1);
    expect(await toggleHabit(store, habit, "2026-11-02", NOW + 1)).toBeNull();
    expect(await store.habitEntries()).toEqual([]);
    const skipped = await skipHabitDay(store, habit, "2026-11-01", NOW + 2);
    expect(skipped.ok && skipped.data).toMatchObject({ day: "2026-11-01", skip: true, value: 0 });
  });

  it("keeps a numeric amount and its unit", async () => {
    const res = await saveHabit(store, input({ kind: "numeric", target: 8, unit: " glasses ", targetType: "at_least" }), NOW);
    if (!res.ok) throw new Error("habit");
    expect(res.data).toMatchObject({ kind: "numeric", target: 8, unit: "glasses", targetType: "at_least" });
    const entry = await setHabitEntry(store, res.data, { day: "2026-11-02", value: 3.456 }, NOW);
    expect(entry.ok && entry.data.value).toBe(3.46);
  });

  it("archives and deletes with its entries", async () => {
    const res = await saveHabit(store, input(), NOW);
    if (!res.ok) throw new Error("habit");
    await toggleHabit(store, res.data, "2026-11-02", NOW);
    await archiveHabit(store, res.data.id, true, NOW + 1);
    expect((await store.habits())[0].archived).toBe(true);
    await deleteHabit(store, res.data.id);
    expect(await store.habits()).toEqual([]);
    expect(await store.habitEntries()).toEqual([]);
  });
});
