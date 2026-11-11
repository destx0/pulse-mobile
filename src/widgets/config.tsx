// The screen Android opens when a habit widget is added or reconfigured: pick the habit it shows. It runs as its own
// React root, so it uses plain React Native views and the palette's concrete colours, not NativeWind or the app shell.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useColorScheme, View, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WidgetConfigurationScreenProps } from "react-native-android-widget";
import type { Habit } from "@/core/habits/types";
import { openStore } from "@/data/db";
import { initI18n, i18n } from "@/i18n/config";
import { resolveLanguage } from "@/i18n/language";
import { DARK, LIGHT } from "@/ui/palette";
import { habitWidgetKey } from "./configKeys";
import { loadWidgetSnapshot, renderWidget } from "./render";

// English paints the first frame; the effect switches to the saved language.
initI18n("en");

export function HabitWidgetConfig({ widgetInfo, renderWidget: draw, setResult }: WidgetConfigurationScreenProps) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = scheme === "dark" ? DARK : LIGHT;
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      initI18n(await resolveLanguage().catch(() => "en" as const));
      const store = await openStore();
      const [list, current] = await Promise.all([store.habits(), AsyncStorage.getItem(habitWidgetKey(widgetInfo.widgetId)).catch(() => null)]);
      setHabits(list.filter((h) => !h.archived));
      setSelected(current);
    })();
  }, [widgetInfo.widgetId]);

  const choose = async (habit: Habit) => {
    setSelected(habit.id);
    await AsyncStorage.setItem(habitWidgetKey(widgetInfo.widgetId), habit.id).catch(() => {});
    const snapshot = await loadWidgetSnapshot();
    draw(await renderWidget(widgetInfo, snapshot));
    setResult("ok");
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.foreground }]} accessibilityRole="header">
          {i18n.t("habits:widget.choose")}
        </Text>
        <Text style={[styles.body, { color: c["foreground-secondary"] }]}>{i18n.t("habits:widget.chooseBody")}</Text>
      </View>
      {!habits ? (
        <ActivityIndicator style={styles.loading} color={c.foreground} />
      ) : habits.length === 0 ? (
        <Text style={[styles.body, { color: c["foreground-secondary"], paddingHorizontal: 20 }]}>{i18n.t("habits:widget.noHabits")}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {habits.map((habit) => {
            const on = selected === habit.id;
            return (
              <Pressable
                key={habit.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => void choose(habit)}
                style={[styles.row, { backgroundColor: c.card, borderColor: on ? c.foreground : c.border }]}
              >
                <View style={[styles.dot, { backgroundColor: c[habit.color] }]} />
                <View style={styles.rowText}>
                  <Text style={[styles.name, { color: c.foreground }]} numberOfLines={1}>
                    {habit.name}
                  </Text>
                  <Text style={[styles.meta, { color: c["muted-foreground"] }]} numberOfLines={1}>
                    {habit.period === "day" ? i18n.t("habits:editor.period_day") : habit.period === "week" ? i18n.t("habits:editor.period_week") : i18n.t("habits:editor.period_month")} · {habit.kind === "numeric" ? `${habit.target} ${habit.unit ?? ""}` : `${habit.target}×`}
                  </Text>
                </View>
                {on && <Text style={{ color: c.optimal, fontSize: 18, fontWeight: "700" }}>✓</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <Pressable accessibilityRole="button" onPress={() => setResult("cancel")} style={styles.cancel}>
        <Text style={[styles.cancelText, { color: c["foreground-secondary"] }]}>{i18n.t("habits:cancel")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 48, paddingBottom: 24 },
  header: { paddingHorizontal: 20, paddingBottom: 16, gap: 6 },
  title: { fontSize: 24, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 22 },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: 16, gap: 10 },
  row: { minHeight: 64, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: "600" },
  meta: { fontSize: 12 },
  cancel: { marginTop: 16, minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 15, fontWeight: "600" },
});
