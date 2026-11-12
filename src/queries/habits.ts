// The habits' view models: the cards for today, one habit's history and score, and the editor. The score, streak and
// period maths live in src/core/habits/logic.ts so the home-screen widgets can use them without React.
import { dayState, habitStats, lastDays, scoreSeries, type DayState, type HabitStats } from "@/core/habits/logic";
import type { Habit, HabitEntry } from "@/core/habits/types";
import { addDays } from "@/lib/time";
import type { QueryCtx } from "./ctx";

export type HabitDay = { day: string; state: DayState };

export type HabitCardVM = {
  habit: Habit;
  stats: HabitStats;
  /** The last seven days, oldest first, today last. */
  week: HabitDay[];
};

export type HabitsVM = {
  today: string;
  habits: HabitCardVM[];
  archived: HabitCardVM[];
};

/** The cards for a set of habits and their entries: the tab, and the widget that lists today. */
export function habitCards(habits: readonly Habit[], entries: readonly HabitEntry[], today: string): HabitCardVM[] {
  const days = lastDays(today, 7);
  return habits.map((habit) => {
    const stats = habitStats(habit, entries, today);
    const mine = entries.filter((e) => e.habitId === habit.id);
    const byDay = new Map(mine.map((e) => [e.day, e]));
    return {
      habit,
      stats,
      week: days.map((day) => ({ day, state: dayState(habit, byDay, day) })),
    };
  });
}

export async function getHabits(ctx: QueryCtx): Promise<HabitsVM> {
  const [habits, entries] = await Promise.all([ctx.store.habits(), ctx.store.habitEntries()]);
  const active = habits.filter((h) => !h.archived);
  const archived = habits.filter((h) => h.archived);
  const cards = habitCards(active, entries, ctx.today);
  return {
    today: ctx.today,
    habits: cards,
    archived: habitCards(archived, entries, ctx.today),
  };
}

export type HabitDetailVM = {
  habit: Habit;
  stats: HabitStats;
  /** The last 180 days, oldest first, for the history calendar. */
  days: HabitDay[];
  /** The last 90 scores, oldest first, for the chart. */
  scores: { day: string; value: number }[];
};

export async function getHabit(ctx: QueryCtx, id: string): Promise<HabitDetailVM | null> {
  const [habits, entries] = await Promise.all([ctx.store.habits(), ctx.store.habitEntries()]);
  const habit = habits.find((h) => h.id === id);
  if (!habit) return null;
  const mine = entries.filter((e) => e.habitId === id);
  const stats = habitStats(habit, mine, ctx.today);
  const byDay = new Map(mine.map((e) => [e.day, e]));
  const from = addDays(ctx.today, -179);
  const days: HabitDay[] = [];
  for (let day = from; day <= ctx.today; day = addDays(day, 1)) {
    days.push({ day, state: dayState(habit, byDay, day) });
  }
  const series = scoreSeries(habit, new Map(mine.map((e) => [e.day, e])), addDays(ctx.today, -89), ctx.today);
  return {
    habit,
    stats,
    days,
    scores: [...series.entries()].map(([day, value]) => ({ day, value })),
  };
}

export type HabitEditorVM = { habit: Habit | null };

export async function getHabitEditor(ctx: QueryCtx, id?: string): Promise<HabitEditorVM> {
  if (!id) return { habit: null };
  return { habit: (await ctx.store.habits()).find((h) => h.id === id) ?? null };
}
