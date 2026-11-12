// The habit tracker's copy: a habit's period progress ("3/7 this week") and a streak in its own period ("2 weeks").
// Shared by the screens and the Android widgets, which run headless with i18n already initialised.
import { i18n } from "@/i18n/config";
import type { HabitStats } from "@/core/habits/logic";
import type { Habit } from "@/core/habits/types";

const round = (v: number) => (Math.round(v * 10) / 10).toString();

export function periodText(habit: Habit, stats: HabitStats): string {
  if (!stats.scheduled) return i18n.t("habits:card.weekdays");
  const days = habit.intervalDays;
  if (habit.kind === "numeric") {
    if (habit.period === "interval") return i18n.t(habit.unit ? "habits:card.amountInterval" : "habits:card.amountPlainInterval", { value: round(stats.period.sum), target: round(habit.target), unit: habit.unit ?? "", days });
    const key =
      habit.period === "day"
        ? habit.unit
          ? "habits:card.amountDay"
          : "habits:card.amountPlainDay"
        : habit.period === "week"
          ? habit.unit
            ? "habits:card.amountWeek"
            : "habits:card.amountPlainWeek"
          : habit.unit
            ? "habits:card.amountMonth"
            : "habits:card.amountPlainMonth";
    return i18n.t(key, { value: round(stats.period.sum), target: round(habit.target), unit: habit.unit ?? "" });
  }
  if (habit.period === "interval") return i18n.t("habits:card.timesInterval", { done: round(stats.period.sum), target: round(habit.target), days });
  if (habit.period === "day") {
    if (stats.today.state === "skip") return i18n.t("habits:card.skip");
    return i18n.t(stats.today.state === "done" ? "habits:card.doneToday" : "habits:card.notDoneToday");
  }
  return i18n.t(habit.period === "week" ? "habits:card.timesWeek" : "habits:card.timesMonth", { done: round(stats.period.sum), target: round(habit.target) });
}

/** "3 days", "2 weeks": a streak in the habit's own period. */
export function streakText(habit: Habit, count: number): string {
  const key =
    habit.period === "day" ? "habits:streak_day" : habit.period === "week" ? "habits:streak_week" : habit.period === "month" ? "habits:streak_month" : "habits:streak_interval";
  return i18n.t(key, { count });
}
