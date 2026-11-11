// The widgets' per-widget configuration keys. Kept in their own module so "Delete everything" can clear them without
// pulling the native widget library into the app's state module.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const HABIT_WIDGET_KEY_PREFIX = "pulse.habitWidget.";

/** The habit a per-habit widget shows. */
export const habitWidgetKey = (widgetId: number) => `${HABIT_WIDGET_KEY_PREFIX}${widgetId}`;

/** Removes every widget's chosen habit (Delete everything). */
export async function clearHabitWidgetConfigs(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys().catch(() => []);
  const mine = keys.filter((key) => key.startsWith(HABIT_WIDGET_KEY_PREFIX));
  if (mine.length) await AsyncStorage.multiRemove(mine).catch(() => {});
}
