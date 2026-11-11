// New or edit habit `/habits/edit?id=`: name, question, type, colour, frequency, target and unit, in the kit's form
// pieces. Saving writes the habit and goes back; the widgets follow on the next render.
import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react-native";
import { i18n } from "@/i18n/config";
import { HABIT_COLORS, type Habit, type HabitColor, type HabitKind, type HabitPeriod, type HabitTargetType } from "@/core/habits/types";
import { getHabitEditor } from "@/queries/habits";
import { saveHabit } from "@/actions/habits";
import { actionCtx } from "@/state/app";
import { habitsChanged } from "@/state/habits";
import { useScreen } from "@/screens/useScreen";
import { Chips, Field, FormAlert, Input } from "@/screens/log/fields";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { TaskPage, TaskSection } from "@/ui/shells/TaskPage";
import { goBack } from "@/ui/navigate";
import { haptic } from "@/ui/haptics";
import { toast } from "@/ui/Toast";
import { habitColor } from "./parts";

const nowS = () => Math.floor(Date.now() / 1000);

export function HabitEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation("habits");
  const { data, error, reload } = useScreen((ctx) => getHabitEditor(ctx, id), ["habit-editor", id ?? "new"], { eager: true });
  if (!data) {
    return (
      <TaskPage title={id ? t("editor.editTitle") : t("editor.newTitle")}>
        <View className="h-40" />
        {!!error && (
          <Button variant="secondary" onPress={reload}>
            {i18n.t("common:actions.tryAgain")}
          </Button>
        )}
      </TaskPage>
    );
  }
  return <HabitForm key={data.habit?.id ?? "new"} habit={data.habit} />;
}

function HabitForm({ habit }: { habit: Habit | null }) {
  const { t } = useTranslation("habits");
  const { c } = useTheme();
  const [name, setName] = useState(habit?.name ?? "");
  const [question, setQuestion] = useState(habit?.question ?? "");
  const [notes, setNotes] = useState(habit?.notes ?? "");
  const [kind, setKind] = useState<HabitKind>(habit?.kind ?? "yes_no");
  const [color, setColor] = useState<HabitColor>(habit?.color ?? "optimal");
  const [period, setPeriod] = useState<HabitPeriod>(habit?.period ?? "day");
  const [target, setTarget] = useState(String(habit?.target ?? 1));
  const [targetType, setTargetType] = useState<HabitTargetType>(habit?.targetType ?? "at_least");
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    const amount = parseFloat(target.replace(",", "."));
    const res = await saveHabit(
      actionCtx().store,
      { id: habit?.id, name, question, notes, kind, color, period, target: Number.isFinite(amount) ? amount : 0, targetType, unit },
      nowS(),
    ).catch(() => ({ ok: false as const, error: "invalid" as const }));
    setSaving(false);
    if (!res.ok) {
      haptic.error();
      setError(t(res.error === "notFound" ? "editor.saveFailed" : "editor.invalid"));
      return;
    }
    habitsChanged();
    toast.success(t("editor.saved"));
    goBack();
  };

  return (
    <TaskPage
      title={habit ? t("editor.editTitle") : t("editor.newTitle")}
      footer={
        <>
          {!!error && <FormAlert>{error}</FormAlert>}
          <Button onPress={() => void save()} disabled={saving}>
            {saving ? t("editor.saving") : t("editor.save")}
          </Button>
        </>
      }
    >
      <View className="gap-6 pt-2">
        <View className="gap-3">
          <TaskSection>{t("editor.name")}</TaskSection>
          <Field label={t("editor.name")}>
            <Input autoFocus value={name} onChangeText={(v) => (setName(v), setError(null))} placeholder={t("editor.namePlaceholder")} maxLength={60} accessibilityLabel={t("editor.name")} className="text-base" />
          </Field>
          <Field label={t("editor.question")} hint={t("editor.questionPlaceholder")}>
            <Input value={question} onChangeText={setQuestion} placeholder={t("editor.questionPlaceholder")} maxLength={140} accessibilityLabel={t("editor.question")} className="text-base" />
          </Field>
        </View>

        <View className="gap-3">
          <TaskSection>{t("editor.kind")}</TaskSection>
          <Chips
            label={t("editor.kind")}
            options={[
              ["yes_no", t("editor.yesNo")],
              ["numeric", t("editor.numeric")],
            ]}
            value={kind}
            onChange={(v) => v && setKind(v as HabitKind)}
          />
          <Text className="text-[13px] leading-[18px] text-muted-foreground">{t("editor.color")}</Text>
          <View className="flex-row flex-wrap gap-2">
            {HABIT_COLORS.map((key) => (
              <Press key={key} accessibilityRole="button" accessibilityLabel={t(`editor.color_${key}`)} accessibilityState={{ selected: color === key }} onPress={() => setColor(key)} className="size-11 items-center justify-center">
                <View className="size-8 items-center justify-center rounded-full" style={{ backgroundColor: habitColor(c, key) }}>
                  {color === key && <Icon icon={Check} size={16} tone="background" strokeWidth={3} />}
                </View>
              </Press>
            ))}
          </View>
        </View>

        <View className="gap-3">
          <TaskSection>{t("editor.frequency")}</TaskSection>
          <Chips
            label={t("editor.frequency")}
            options={[
              ["day", t("editor.period_day")],
              ["week", t("editor.period_week")],
              ["month", t("editor.period_month")],
            ]}
            value={period}
            onChange={(v) => v && setPeriod(v as HabitPeriod)}
          />
          <View className="flex-row gap-2">
            <Field label={kind === "numeric" ? t("editor.targetAmount") : t("editor.targetTimes")} className="flex-1">
              <Input value={target} onChangeText={(v) => (setTarget(v), setError(null))} keyboardType={kind === "numeric" ? "decimal-pad" : "numeric"} accessibilityLabel={t("editor.target")} className="text-base tabular-nums" />
            </Field>
            {kind === "numeric" && (
              <Field label={t("editor.unit")} className="flex-1">
                <Input value={unit} onChangeText={setUnit} placeholder={t("editor.unitPlaceholder")} maxLength={20} accessibilityLabel={t("editor.unit")} className="text-base" />
              </Field>
            )}
          </View>
          {kind === "numeric" && (
            <Chips
              label={t("editor.targetType")}
              options={[
                ["at_least", t("editor.atLeast")],
                ["at_most", t("editor.atMost")],
              ]}
              value={targetType}
              onChange={(v) => v && setTargetType(v as HabitTargetType)}
            />
          )}
        </View>

        <View className="gap-3">
          <TaskSection>{t("editor.notes")}</TaskSection>
          <Input multiline value={notes} onChangeText={setNotes} placeholder={t("editor.notesPlaceholder")} maxLength={500} accessibilityLabel={t("editor.notes")} className="min-h-24 rounded-lg px-3 py-2 text-base" />
        </View>
      </View>
    </TaskPage>
  );
}
