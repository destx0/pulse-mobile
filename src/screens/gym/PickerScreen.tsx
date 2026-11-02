// The exercise picker `/gym/exercises`: search the catalogue, the exercises trained recently first. Opened from a
// workout (`?session=`) it adds the lift to it; opened from a template editor it hands the choice back (pending.ts).
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Dumbbell, Plus, Search } from "lucide-react-native";
import { actionCtx, dataChanged } from "@/state/app";
import { addExerciseToSession, createExercise } from "@/actions/gym";
import { BODY_PARTS, type BodyPart, type GymExercise } from "@/core/gym/types";
import { searchExercises } from "@/core/gym/catalogue";
import { getGymPicker } from "@/queries/gym";
import { useScreen } from "@/screens/useScreen";
import { Button } from "@/ui/Button";
import { Card, CardFill } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { DetailShell } from "@/ui/shells/DetailShell";
import { Input } from "@/screens/log/fields";
import { goBack } from "@/ui/navigate";
import { toast } from "@/ui/Toast";
import { hasPickerListener, pickedExercise } from "./pending";

export function PickerScreen() {
  const { session: sessionId } = useLocalSearchParams<{ session?: string }>();
  const { t } = useTranslation("gym");
  const { data } = useScreen(getGymPicker, ["gym-picker"]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const name = (e: GymExercise) => e.name;
  const results = useMemo(() => (data ? searchExercises(query, data.all.filter((e) => e.custom), 60) : []), [data, query]);

  const pick = async (exercise: GymExercise) => {
    if (sessionId) {
      const sessions = await actionCtx().store.gymSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return goBack();
      await addExerciseToSession(actionCtx().store, session, exercise, { count: 3, reps: exercise.hold ? 0 : 10 });
      dataChanged();
      goBack();
      return;
    }
    if (hasPickerListener()) {
      pickedExercise(exercise);
      goBack();
      return;
    }
    toast.error(t("exercise.added", { name: name(exercise) }));
  };

  return (
    <DetailShell
      title={t("exercise.browse")}
      floatingAction={false}
      backHref="/gym"
      dismiss="close"
      loading={!data}
      bodySkeleton={<View className="h-40" />}
      primary={
        !data ? null : (
          <View className="gap-6">
            <View className="flex-row items-center gap-2 rounded-xl bg-secondary px-3">
              <Icon icon={Search} size={18} tone="muted-foreground" />
              <Input value={query} onChangeText={setQuery} placeholder={t("exercise.search")} className="flex-1 border-0 bg-transparent" autoCorrect={false} returnKeyType="search" />
            </View>

            {!query && data.recent.length > 0 && (
              <View className="gap-2">
                <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("exercise.recent")}</Text>
                <Card className="px-3 py-1">
                  <CardFill />
                  {data.recent.map((exercise, i) => (
                    <ExerciseRow key={exercise.id} exercise={exercise} first={i === 0} onPress={() => void pick(exercise)} />
                  ))}
                </Card>
              </View>
            )}

            <View className="gap-2">
              <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("exercise.all")}</Text>
              {results.length ? (
                <Card className="px-3 py-1">
                  <CardFill />
                  {results.map((exercise, i) => (
                    <ExerciseRow key={exercise.id} exercise={exercise} first={i === 0} onPress={() => void pick(exercise)} />
                  ))}
                </Card>
              ) : (
                <Text className="py-6 text-center text-[14px] text-muted-foreground">{t("exercise.search")}</Text>
              )}
            </View>

            <Button variant="secondary" onPress={() => setCreating(true)}>
              <View className="flex-row items-center gap-2">
                <Icon icon={Plus} size={16} tone="foreground" />
                <Text className="text-[13px] font-bold uppercase tracking-[0.1em]">{t("exercise.new")}</Text>
              </View>
            </Button>
          </View>
        )
      }
      footer={creating ? <NewExercise onDone={(e) => (setCreating(false), e ? void pick(e) : undefined)} /> : undefined}
    />
  );
}

function ExerciseRow({ exercise, first, onPress }: { exercise: GymExercise; first: boolean; onPress: () => void }) {
  const { t } = useTranslation("gym");
  return (
    <Press accessibilityRole="button" activeBg="bg-fill-hover" onPress={onPress} className={`flex-row items-center gap-3 py-3 ${first ? "" : "border-t border-border/60"}`}>
      <Icon icon={Dumbbell} size={15} tone="muted-foreground" />
      <View className="min-w-0 flex-1">
        <Text className="text-[14px] font-medium leading-5" numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text className="text-[11px] leading-4 text-muted-foreground">
          {t(`parts.${exercise.bodyPart}`)} · {exercise.equipment}
        </Text>
      </View>
      <Icon icon={Plus} size={16} tone="foreground-secondary" />
    </Press>
  );
}

/** The owner's own exercise: a name and the body part it trains. */
function NewExercise({ onDone }: { onDone: (e: GymExercise | null) => void }) {
  const { t } = useTranslation("gym");
  const [name, setName] = useState("");
  const [part, setPart] = useState<BodyPart>("chest");
  return (
    <View className="mb-6 gap-3 rounded-2xl bg-card p-4">
      <Text className="text-[15px] font-semibold">{t("exercise.new")}</Text>
      <Input autoFocus value={name} onChangeText={setName} placeholder={t("exercise.newName")} maxLength={60} />
      <View className="flex-row flex-wrap gap-1.5">
        {BODY_PARTS.map((p) => (
          <Press
            key={p}
            accessibilityRole="button"
            accessibilityState={{ selected: part === p }}
            onPress={() => setPart(p)}
            className={`h-8 items-center justify-center rounded-full px-3 ${part === p ? "bg-primary" : "bg-secondary"}`}
          >
            <Text className={`text-[12px] font-medium ${part === p ? "text-primary-foreground" : "text-foreground"}`}>{t(`parts.${p}`)}</Text>
          </Press>
        ))}
      </View>
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={() => onDone(null)}>
          {t("session.cancel")}
        </Button>
        <Button
          className="flex-1"
          disabled={!name.trim()}
          onPress={async () => {
            const ex = await createExercise(actionCtx().store, { name, bodyPart: part });
            dataChanged();
            onDone(ex);
          }}
        >
          {t("exercise.create")}
        </Button>
      </View>
    </View>
  );
}
