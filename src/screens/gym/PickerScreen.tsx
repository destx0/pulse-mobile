// The exercise picker `/gym/exercises`: search the catalogue, the exercises trained recently first. Opened from a
// workout (`?session=`) it adds the lift to it; opened from a template editor it hands the choice back (pending.ts);
// opened from the Gym tab it resumes a running workout or starts one with the lift, so the search is never a dead end.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Dumbbell, Plus, Search } from "lucide-react-native";
import { actionCtx, dataChanged } from "@/state/app";
import { activeSession, addExerciseToSession, createExercise, startSession } from "@/actions/gym";
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
import { goBack, replace } from "@/ui/navigate";
import { hasPickerListener, pickedExercise } from "./pending";
import { QueryError } from "@/ui/shells/QueryError";

export function PickerScreen() {
  const { session: sessionId } = useLocalSearchParams<{ session?: string }>();
  const { t } = useTranslation("gym");
  const { data, error, reload } = useScreen(getGymPicker, ["gym-picker"]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // The whole catalogue, alphabetically: "All exercises" means all of them, not the first sixty. Search still ranks.
  const results = useMemo(() => (data ? searchExercises(query, [], data.all.length, data.all) : []), [data, query]);

  const pick = async (exercise: GymExercise) => {
    const c = actionCtx();
    if (sessionId) {
      const sessions = await c.store.gymSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return goBack();
      await addExerciseToSession(c.store, session, exercise, { count: 3, reps: exercise.hold ? 0 : 10 });
      dataChanged("gym");
      goBack();
      return;
    }
    if (hasPickerListener()) {
      pickedExercise(exercise);
      goBack();
      return;
    }
    // No workout and no template is waiting: use the running workout, or start one with this lift. The picker replaces
    // itself, so Back from the workout lands on the Gym tab, not on the chooser again.
    let session = await activeSession(c.store);
    if (!session) {
      const started = await startSession(c, {});
      if (!started.ok) return;
      session = started.data.session;
    }
    await addExerciseToSession(c.store, session, exercise, { count: 3, reps: exercise.hold ? 0 : 10 });
    dataChanged("gym");
    replace(`/gym/session/${session.id}`);
  };

  return (
    <DetailShell
      title={t("exercise.browse")}
      floatingAction={false}
      backHref="/gym"
      dismiss="close"
      loading={!data}
      bodySkeleton={<View className="h-40" />}
      action={
        <Press accessibilityRole="button" onPress={() => setCreating(true)} className="h-9 flex-row items-center gap-1.5 rounded-full bg-primary px-3.5">
          <Icon icon={Plus} size={14} tone="primary-foreground" />
          <Text className="text-[12px] font-bold uppercase tracking-[0.08em] text-primary-foreground">{t("exercise.new")}</Text>
        </Press>
      }
      primary={
        !data ? (error ? <QueryError compact error={error} reload={reload} /> : null) : (
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
                <Text className="py-6 text-center text-[14px] text-muted-foreground">{t("exercise.noMatches")}</Text>
              )}
            </View>
          </View>
        )
      }
      footer={
        creating ? (
          <NewExerciseDialog
            onCancel={() => setCreating(false)}
            onDone={(e) => {
              setCreating(false);
              if (e) void pick(e);
            }}
          />
        ) : undefined
      }
    />
  );
}

function ExerciseRow({ exercise, first, onPress }: { exercise: GymExercise; first: boolean; onPress: () => void }) {
  const { t } = useTranslation("gym");
  return (
    <Press accessibilityRole="button" activeBg="bg-fill-hover" onPress={onPress} className={`flex-row items-center gap-3 py-3 ${first ? "" : "border-t border-border"}`}>
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

/** The owner's own exercise: a name and the body part it trains. A dialog, so it is reachable from the header. */
function NewExerciseDialog({ onDone, onCancel }: { onDone: (e: GymExercise | null) => void; onCancel: () => void }) {
  const { t } = useTranslation("gym");
  const [name, setName] = useState("");
  const [part, setPart] = useState<BodyPart>("chest");
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable onPress={onCancel} className="flex-1 items-center justify-center bg-dim-strong px-4">
        <Pressable onPress={() => {}} className="w-full max-w-[384px] gap-4 rounded-3xl bg-popover p-5">
          <Text className="text-[17px] font-semibold">{t("exercise.new")}</Text>
          <Input value={name} onChangeText={setName} placeholder={t("exercise.newName")} maxLength={60} />
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
          <View className="gap-2">
            <Button
              disabled={!name.trim()}
              onPress={async () => {
                const ex = await createExercise(actionCtx().store, { name, bodyPart: part });
                dataChanged("gym");
                onDone(ex);
              }}
            >
              {t("exercise.create")}
            </Button>
            <Button variant="outline" onPress={onCancel}>
              {t("session.cancel")}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
