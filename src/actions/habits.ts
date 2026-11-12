// The habit tracker's writes: create and edit a habit, tick a day, skip it, and archive or delete the habit. Plain
// TypeScript over the Store, like the gym's actions, so the tests run on the in-memory store. Nothing here touches
// Health Connect or the health pipeline.
import { HABIT_COLORS, type Habit, type HabitColor, type HabitEntry, type HabitKind, type HabitPeriod, type HabitTargetType } from "@/core/habits/types";
import { isScheduled } from "@/core/habits/logic";
import type { Store } from "@/data/store";
import { newId } from "@/lib/ids";
import { localDay } from "@/lib/time";

export type HabitResult<T = undefined> = { ok: true; data: T } | { ok: false; error: "invalid" | "notFound" };
const fail = (error: "invalid" | "notFound" = "invalid") => ({ ok: false as const, error });

export type HabitInput = {
  id?: string;
  name: string;
  question?: string | null;
  notes?: string | null;
  kind: HabitKind;
  color: HabitColor;
  period: HabitPeriod;
  /** `period: "interval"`: the N in every N days. */
  intervalDays?: number;
  weekdaysOnly?: boolean;
  target: number;
  targetType: HabitTargetType;
  unit?: string | null;
};

const text = (v: string | null | undefined, max: number) => {
  const t = (v ?? "").trim().slice(0, max);
  return t || null;
};
const PERIODS: HabitPeriod[] = ["day", "week", "month", "interval"];
const KINDS: HabitKind[] = ["yes_no", "numeric"];

/** Creates or edits a habit. The target is times per period for yes/no, an amount per period for numeric. */
export async function saveHabit(store: Store, input: HabitInput, now: number): Promise<HabitResult<Habit>> {
  const name = text(input.name, 60);
  if (!name) return fail();
  if (!KINDS.includes(input.kind) || !PERIODS.includes(input.period) || !HABIT_COLORS.includes(input.color)) return fail();
  if (!Number.isFinite(input.target)) return fail();
  const numeric = input.kind === "numeric";
  const interval = input.period === "interval";
  const intervalDays = interval ? Math.round(input.intervalDays ?? 0) : 1;
  if (interval && (intervalDays < 2 || intervalDays > 365)) return fail();
  const target = numeric ? Math.round(input.target * 100) / 100 : interval ? 1 : Math.round(input.target);
  if ((numeric && (target <= 0 || target > 100_000)) || (!numeric && !interval && (target < 1 || target > 100))) return fail();
  const targetType: HabitTargetType = numeric && input.targetType === "at_most" ? "at_most" : "at_least";
  const weekdaysOnly = input.period === "day" && input.weekdaysOnly === true;
  const all = await store.habits();
  const existing = input.id ? all.find((h) => h.id === input.id) : undefined;
  if (input.id && !existing) return fail("notFound");
  const timeZone = (await store.getProfile())?.timeZone ?? "UTC";
  const habit: Habit = {
    id: existing?.id ?? newId(),
    name,
    question: text(input.question, 140),
    notes: text(input.notes, 500),
    kind: input.kind,
    color: input.color,
    period: input.period,
    intervalDays,
    weekdaysOnly,
    startDay: existing?.startDay || localDay(now, timeZone),
    target,
    targetType,
    unit: numeric ? text(input.unit, 20) : null,
    position: existing?.position ?? all.length,
    archived: existing?.archived ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await store.putHabit(habit);
  return { ok: true, data: habit };
}

export async function archiveHabit(store: Store, id: string, archived: boolean, now: number): Promise<void> {
  const habit = (await store.habits()).find((h) => h.id === id);
  if (habit) await store.putHabit({ ...habit, archived, updatedAt: now });
}

export async function deleteHabit(store: Store, id: string): Promise<void> {
  await store.deleteHabit(id);
}

/** One day's entry as given: an amount for numeric, done/not-done for yes/no, or a skip. */
export async function setHabitEntry(store: Store, habit: Habit, input: { day: string; value?: number; skip?: boolean; note?: string | null }, now: number): Promise<HabitResult<HabitEntry>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || !isScheduled(habit, input.day)) return fail();
  const skip = input.skip === true;
  const raw = habit.kind === "yes_no" ? (input.value && input.value > 0 ? 1 : 0) : (input.value ?? 0);
  if (!Number.isFinite(raw) || raw < 0 || raw > 100_000) return fail();
  const value = habit.kind === "numeric" ? Math.round(raw * 100) / 100 : raw;
  const entry: HabitEntry = { habitId: habit.id, day: input.day, value, skip, note: text(input.note, 240), updatedAt: now };
  await store.putHabitEntry(entry);
  return { ok: true, data: entry };
}

/** A tap on a yes/no day: done becomes empty (unknown), anything else becomes done. */
export async function toggleHabit(store: Store, habit: Habit, day: string, now: number): Promise<HabitEntry | null> {
  if (habit.kind === "numeric") return null;
  const existing = (await store.habitEntries(day, day)).find((e) => e.habitId === habit.id);
  if (existing && !existing.skip && existing.value > 0) {
    await store.deleteHabitEntry(habit.id, day);
    return null;
  }
  const res = await setHabitEntry(store, habit, { day, value: 1, note: existing?.note ?? null }, now);
  return res.ok ? res.data : null;
}

/** Skip a day: it leaves both the score window and the period's total. */
export async function skipHabitDay(store: Store, habit: Habit, day: string, now: number): Promise<HabitResult<HabitEntry>> {
  return setHabitEntry(store, habit, { day, skip: true, value: 0 }, now);
}

export async function clearHabitEntry(store: Store, habitId: string, day: string): Promise<void> {
  await store.deleteHabitEntry(habitId, day);
}
