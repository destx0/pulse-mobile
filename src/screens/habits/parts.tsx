// The habit screens' shared pieces: the score ring's colour, the period line under a habit, the day marks of a week and
// the amount dialog a numeric habit opens. Pulse's tokens, in the habit tracker's own layout.
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Check, Minus, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { Habit, HabitColor } from "@/core/habits/types";
import type { DayState } from "@/core/habits/logic";
import { DAY, formatDay } from "@/lib/format";
import { Button } from "@/ui/Button";
import { Gradient } from "@/ui/Gradient";
import { Icon } from "@/ui/Icon";
import { usePanelStyle } from "@/ui/Panel";
import { Text } from "@/ui/Text";
import { cn } from "@/ui/cn";
import { useTheme } from "@/ui/theme";
import type { Palette } from "@/ui/palette";
import { Input } from "@/screens/log/fields";

/** The theme colour a habit was given, in the scheme in force. */
export const habitColor = (c: Palette, color: HabitColor) => c[color];

const round = (v: number) => (Math.round(v * 10) / 10).toString();

/** A day in the card's week row: a filled check, a cross, a dash or an empty circle. Numeric days carry their amount. */
export function DayMark({ habit, state, color, size = 26, today }: { habit: Habit; state: DayState; color: string; size?: number; today?: boolean }) {
  const value = state.value;
  const numeric = habit.kind === "numeric";
  const filled = state.state === "done";
  return (
    <View
      className={cn("items-center justify-center rounded-full border", today && "border-2")}
      style={{ width: size, height: size, borderColor: today ? color : filled ? color : "rgba(128,128,128,0.45)", backgroundColor: filled ? color : "transparent" }}
    >
      {filled ? (
        numeric ? (
          <Text className="font-numeric text-[10px] font-bold leading-3 text-white" numberOfLines={1}>
            {value != null ? (value >= 1000 ? "999" : round(value)) : ""}
          </Text>
        ) : (
          <Icon icon={Check} size={14} tone="background" strokeWidth={3} />
        )
      ) : state.state === "no" ? (
        <Icon icon={X} size={12} tone="muted-foreground" strokeWidth={2.5} />
      ) : state.state === "skip" ? (
        <Icon icon={Minus} size={12} tone="muted-foreground" strokeWidth={2.5} />
      ) : null}
    </View>
  );
}

/** A numeric day's amount: type it, clear the entry, or skip the day. */
export function HabitValueDialog({
  habit,
  day,
  initial,
  onClose,
  onSave,
  onClear,
  onSkip,
}: {
  habit: Habit;
  day: string;
  initial: number | null;
  onClose: () => void;
  onSave: (value: number) => void;
  onClear: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation("habits");
  const { c } = useTheme();
  const panel = usePanelStyle({ ring: "border" });
  const [text, setText] = useState(initial != null ? String(initial) : "");
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const value = parseFloat(text.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return setError(t("value.invalid"));
    onSave(Math.round(value * 100) / 100);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable accessibilityLabel={habit.name} onPress={onClose} className="flex-1 items-center justify-center bg-dim-strong px-4">
        <Pressable accessible={false} onPress={() => {}} className="w-full max-w-[384px] gap-5 overflow-hidden rounded-3xl p-6" style={panel}>
          <Gradient from={c["popover-top"]} to={c.popover} angle="y" />
          <View className="gap-1">
            <Text accessibilityRole="header" className="text-[17px] font-semibold leading-6">
              {habit.name}
            </Text>
            <Text className="text-[13px] leading-5 text-foreground-secondary">{formatDay(day, DAY.monthDay)}</Text>
          </View>
          <View className="gap-2">
            <Text className="text-[15px] font-medium leading-[22px]">
              {t("value.amount")}
              {habit.unit ? <Text className="font-normal text-muted-foreground"> ({habit.unit})</Text> : null}
            </Text>
            <Input autoFocus selectTextOnFocus keyboardType="decimal-pad" value={text} onChangeText={(v) => (setText(v), setError(null))} placeholder={t("value.placeholder")} accessibilityLabel={t("value.amount")} className="text-base tabular-nums" />
            {!!error && <Text className="text-[13px] font-medium leading-[18px] text-recovery-red-text">{error}</Text>}
          </View>
          <View className="gap-2">
            <Button onPress={save}>{t("value.save")}</Button>
            {initial !== null && (
              <Button variant="secondary" onPress={onClear}>
                {t("value.clear")}
              </Button>
            )}
            <Button variant="outline" onPress={onSkip}>
              {t("value.skip")}
            </Button>
            <Button variant="ghost" onPress={onClose}>
              {t("cancel")}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
