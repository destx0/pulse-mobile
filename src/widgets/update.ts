// Redraws any habit widgets on the home screen after a write in the app. Called from the habit screens; failures are
// silent (a widget removed from the home screen is not an error).
import { requestWidgetUpdate } from "react-native-android-widget";
import { HABIT_WIDGETS, loadWidgetSnapshot, renderWidget } from "./render";

export async function refreshHabitWidgets(): Promise<void> {
  const snapshot = await loadWidgetSnapshot().catch(() => null);
  if (!snapshot) return;
  await Promise.allSettled(HABIT_WIDGETS.map((widgetName) => requestWidgetUpdate({ widgetName, renderWidget: (info) => renderWidget(info, snapshot) })));
}
