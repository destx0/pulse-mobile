// The template editor `/gym/routine/[id]`: a name, the lifts it holds and their planned sets and reps. "new" starts a
// blank one. The exercise picker hands a lift back through pending.ts, so a template exists only once it is saved.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Dumbbell, Plus, Trash2 } from "lucide-react-native";
import { actionCtx, dataChanged } from "@/state/app";
import { deleteRoutine, saveRoutine, startSession } from "@/actions/gym";
import type { GymExercise } from "@/core/gym/types";
import type { RoutineVM } from "@/queries/gym";
import { getGymRoutine } from "@/queries/gym";
import { useScreen } from "@/screens/useScreen";
import { Button } from "@/ui/Button";
import { Card, CardFill } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { DetailShell } from "@/ui/shells/DetailShell";
import { Input } from "@/screens/log/fields";
import { goBack, push } from "@/ui/navigate";
import { ConfirmDialog, GymEmpty } from "./parts";
import { onPickedExercise } from "./pending";

type Item = { exercise: GymExercise; sets: number; reps: number };

export function RoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { t } = useTranslation("gym");
  const { data } = useScreen((ctx) => getGymRoutine(ctx, id), ["gym-routine", id]);
  if (!isNew && !data) return <DetailShell title={t("routine.edit")} loading backHref="/gym" bodySkeleton={<View className="h-40" />} />;
  return <Editor key={isNew ? "new" : id} id={id} isNew={isNew} initial={data ?? null} />;
}

function Editor({ id, isNew, initial }: { id: string; isNew: boolean; initial: RoutineVM | null }) {
  const { t } = useTranslation("gym");
  const [name, setName] = useState(initial?.routine.name ?? "");
  const [items, setItems] = useState<Item[]>(initial?.items.map((i) => ({ exercise: i.exercise, sets: i.sets, reps: i.reps })) ?? []);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // A lift picked on the exercises screen lands at the end of the draft.
  useEffect(
    () =>
      onPickedExercise((exercise) => {
        setItems((prev) => (prev.some((i) => i.exercise.id === exercise.id) ? prev : [...prev, { exercise, sets: 3, reps: 10 }]));
      }),
    [],
  );

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await saveRoutine(
        actionCtx().store,
        { id: isNew ? undefined : id, name: name.trim() || t("routine.new"), items: items.map((i) => ({ exerciseId: i.exercise.id, sets: i.sets, reps: i.reps })) },
        Math.floor(Date.now() / 1000),
      );
      if (!res.ok) return;
      dataChanged();
      goBack();
    } finally {
      setSaving(false);
    }
  };

  const start = async () => {
    const res = await startSession(actionCtx(), { routineId: id });
    if (!res.ok) return;
    dataChanged();
    push(`/gym/session/${res.data.session.id}`);
  };

  return (
    <View className="flex-1">
      <DetailShell
        title={isNew ? t("routine.new") : t("routine.edit")}
        floatingAction={false}
        backHref="/gym"
        action={
          !isNew ? (
            <Press accessibilityRole="button" onPress={() => void start()} className="h-9 items-center justify-center rounded-full bg-primary px-3.5">
              <Text className="text-[12px] font-bold uppercase tracking-[0.08em] text-primary-foreground">{t("routine.start")}</Text>
            </Press>
          ) : undefined
        }
        primary={
          <View className="gap-6">
            <View className="gap-2">
              <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("routine.name")}</Text>
              <Input value={name} onChangeText={setName} placeholder={t("routine.namePlaceholder")} maxLength={60} />
            </View>

            {items.length ? (
              <Card className="px-3 py-1">
                <CardFill />
                {items.map((item, i) => (
                  <View key={item.exercise.id} className={`flex-row items-center gap-2 py-2.5 ${i > 0 ? "border-t border-border/60" : ""}`}>
                    <Text className="min-w-0 flex-1 text-[14px] font-medium leading-5" numberOfLines={1}>
                      {item.exercise.name}
                    </Text>
                    <View className="flex-row items-center gap-1">
                      <Input
                        value={String(item.sets)}
                        onChangeText={(v) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, sets: Math.max(0, Math.min(20, Number(v.replace(/\D/g, "")) || 0)) } : x)))}
                        keyboardType="number-pad"
                        className="w-11 border-0 bg-secondary px-1 text-center"
                        maxLength={2}
                      />
                      <Text className="text-[12px] text-muted-foreground">{"×"}</Text>
                      <Input
                        value={String(item.reps)}
                        onChangeText={(v) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, reps: Math.max(0, Math.min(100, Number(v.replace(/\D/g, "")) || 0)) } : x)))}
                        keyboardType="number-pad"
                        className="w-11 border-0 bg-secondary px-1 text-center"
                        maxLength={3}
                      />
                      <Press accessibilityRole="button" accessibilityLabel={t("routine.remove")} hitSlop={8} onPress={() => setItems((prev) => prev.filter((_, j) => j !== i))} className="size-9 items-center justify-center">
                        <Icon icon={Trash2} size={16} tone="muted-foreground" />
                      </Press>
                    </View>
                  </View>
                ))}
              </Card>
            ) : (
              <GymEmpty icon={Dumbbell} title={t("routine.empty")} body={t("routine.emptyBody")} />
            )}

            <Button variant="secondary" onPress={() => push(`/gym/exercises?routine=${isNew ? "new" : id}`)}>
              <View className="flex-row items-center gap-2">
                <Icon icon={Plus} size={16} tone="foreground" />
                <Text className="text-[13px] font-bold uppercase tracking-[0.1em]">{t("routine.addExercise")}</Text>
              </View>
            </Button>
          </View>
        }
        footer={
          <View className="gap-3 pb-8">
            <Button onPress={() => void save()} disabled={saving || !items.length}>
              {t("routine.save")}
            </Button>
            {!isNew && (
              <Button variant="ghost" textClassName="text-recovery-red-text" onPress={() => setConfirm(true)}>
                {t("routine.delete")}
              </Button>
            )}
          </View>
        }
      />
      <ConfirmDialog
        open={confirm}
        title={t("routine.deleteTitle")}
        body={t("routine.deleteBody")}
        confirm={t("routine.delete")}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await deleteRoutine(actionCtx().store, id);
          dataChanged();
          goBack();
        }}
      />
    </View>
  );
}
