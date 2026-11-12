// Turns a widget's stored configuration into the view it draws. The task handler and the app's own widget refresh both
// come through here: one store read per pass, the latest habit and entries, and an empty "choose a habit" widget when
// the configured habit is gone or never chosen.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WidgetInfo, WidgetRepresentation } from "react-native-android-widget";
import { dayState, habitStats, lastDays, scoreSeries } from "@/core/habits/logic";
import type { Habit, HabitEntry } from "@/core/habits/types";
import { openStore } from "@/data/db";
import { habitCards } from "@/queries/habits";
import { addDays, localDay } from "@/lib/time";
import { habitWidgetKey } from "./configKeys";
import { widgetRepresentation, type HabitWidgetView, type TodayView } from "./views";

export const HABIT_WIDGETS = ["HabitDot", "HabitCheck", "HabitScore", "HabitStreak", "HabitHistory", "HabitToday"] as const;

export type WidgetSnapshot = { today: string; habits: Habit[]; entries: HabitEntry[] };

export async function loadWidgetSnapshot(): Promise<WidgetSnapshot> {
  const store = await openStore();
  const profile = await store.getProfile();
  const timeZone = profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const today = localDay(Math.floor(Date.now() / 1000), timeZone);
  const [habits, entries] = await Promise.all([store.habits(), store.habitEntries()]);
  return { today, habits: habits.filter((h) => !h.archived), entries };
}

export function habitView(snapshot: WidgetSnapshot, habitId: string): HabitWidgetView | null {
  const habit = snapshot.habits.find((h) => h.id === habitId);
  if (!habit) return null;
  const entries = snapshot.entries.filter((e) => e.habitId === habit.id);
  const map = new Map(entries.map((e) => [e.day, e]));
  const stats = habitStats(habit, entries, snapshot.today);
  const days = lastDays(snapshot.today, 70).map((day) => ({ day, state: dayState(habit, map, day) }));
  const scores = [...scoreSeries(habit, map, addDays(snapshot.today, -29), snapshot.today).values()].map((v) => Math.round(v * 100));
  return { habit, stats, days, scores };
}

export function todayView(snapshot: WidgetSnapshot): TodayView {
  const cards = habitCards(snapshot.habits, snapshot.entries, snapshot.today).filter((c) => c.stats.scheduled);
  return { cards: cards.map((c) => ({ habit: c.habit, stats: c.stats })), done: cards.filter((c) => c.stats.done).length, total: cards.length };
}

/** The widget's current props: its name decides the view, its stored habit decides which one. */
export async function widgetProps(info: WidgetInfo, snapshot: WidgetSnapshot): Promise<HabitWidgetView | TodayView | null> {
  if (info.widgetName === "HabitToday") return todayView(snapshot);
  const habitId = await AsyncStorage.getItem(habitWidgetKey(info.widgetId)).catch(() => null);
  return habitId ? habitView(snapshot, habitId) : null;
}

export async function renderWidget(info: WidgetInfo, snapshot?: WidgetSnapshot): Promise<WidgetRepresentation> {
  const data = snapshot ?? (await loadWidgetSnapshot());
  return widgetRepresentation(info.widgetName, await widgetProps(info, data));
}
