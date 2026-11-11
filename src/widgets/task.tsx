// The widget task handler: Android wakes it for a widget being added, resized, refreshed or tapped, with no UI. It opens
// the same SQLite store, toggles a tick for a yes/no habit, and redraws the widget. Everything stays on the phone.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { toggleHabit } from "@/actions/habits";
import { openStore } from "@/data/db";
import { initI18n } from "@/i18n/config";
import { resolveLanguage } from "@/i18n/language";
import { localDay } from "@/lib/time";
import { habitWidgetKey } from "./configKeys";
import { loadWidgetSnapshot, renderWidget } from "./render";

let languageReady = false;
async function ensureLanguage() {
  if (languageReady) return;
  languageReady = true;
  initI18n(await resolveLanguage().catch(() => "en" as const));
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  await ensureLanguage();
  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      const snapshot = await loadWidgetSnapshot();
      props.renderWidget(await renderWidget(props.widgetInfo, snapshot));
      break;
    }
    case "WIDGET_DELETED":
      await AsyncStorage.removeItem(habitWidgetKey(props.widgetInfo.widgetId)).catch(() => {});
      break;
    case "WIDGET_CLICK":
      if (props.clickAction === "toggle") {
        const habitId = props.clickActionData?.habitId;
        if (typeof habitId === "string") {
          const store = await openStore();
          const habit = (await store.habits()).find((h) => h.id === habitId);
          if (habit) {
            const profile = await store.getProfile();
            const timeZone = profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
            const now = Math.floor(Date.now() / 1000);
            await toggleHabit(store, habit, localDay(now, timeZone), now);
          }
        }
        const snapshot = await loadWidgetSnapshot();
        props.renderWidget(await renderWidget(props.widgetInfo, snapshot));
      }
      break;
  }
}
