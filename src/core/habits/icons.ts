// A habit's icon: an emoji picked from the habit's own id, so every habit gets a stable random-looking
// one without storing another column or carrying image assets into the home-screen widgets.
import type { Habit } from "./types";

export const HABIT_ICONS = [
  "🌱", "💧", "📖", "🏃", "🧘", "🥗", "💤", "🦷", "🧹", "💊",
  "✍️", "🎸", "🚶", "🧠", "💪", "🍎", "☕", "📵", "🛏️", "🧴",
  "🚴", "🏋️", "🎯", "🎨", "🗣️", "📚", "🌿", "☀️", "🧊", "🚿",
] as const;

/** FNV-1a over the id: the same habit keeps the same icon on the card, the detail and the widgets. */
export function habitIcon(habit: Pick<Habit, "id">): string {
  let hash = 2166136261;
  for (let i = 0; i < habit.id.length; i++) hash = Math.imul(hash ^ habit.id.charCodeAt(i), 16777619);
  return HABIT_ICONS[(hash >>> 0) % HABIT_ICONS.length];
}
