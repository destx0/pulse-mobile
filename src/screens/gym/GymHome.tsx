// The gym tab `/gym`: Strong's Workout page. The owner's templates in one wide column, the workout in progress above
// them, then the last sessions and the week's totals. Tapping a template starts it; "Start empty" starts a blank one.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { ChevronRight, Dumbbell, Play, Plus, Search, Trophy } from "lucide-react-native";
import { actionCtx, dataChanged } from "@/state/app";
import { deleteRoutine as removeRoutine, startSession } from "@/actions/gym";
import { loadText, toUnit, trimLoad } from "@/core/gym/load";
import { getGymHome } from "@/queries/gym";
import { useScreen } from "@/screens/useScreen";
import { Button } from "@/ui/Button";
import { CARD_CLASS, Card, CardFill, useCardStyle } from "@/ui/Card";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { PageShell } from "@/ui/shells/PageShell";
import { push } from "@/ui/navigate";
import { toast } from "@/ui/Toast";
import { Block, ConfirmDialog, GymEmpty, SessionRow, StatTile, TemplateCard, clockText, lengthText, useNow, volumeText } from "./parts";
import { GymSkeleton } from "./GymSkeleton";

export function GymHome() {
  const { t } = useTranslation("gym");
  const { data } = useScreen(getGymHome, ["gym-home"]);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  // The clock only matters while a workout runs: a tab left mounted behind More must not tick every second.
  const active = data?.active;
  const now = useNow(!!active);
  const cardStyle = useCardStyle();

  const start = async (routineId?: string) => {
    if (pending) return;
    if (data?.active) {
      // One workout at a time: a tap on a template while one runs says so and opens the one already going.
      toast.info(t("home.alreadyActive"));
      push(`/gym/session/${data.active.session.id}`);
      return;
    }
    setPending(true);
    try {
      const res = await startSession(actionCtx(), routineId ? { routineId } : {});
      if (!res.ok) return;
      dataChanged();
      push(`/gym/session/${res.data.session.id}`);
    } finally {
      setPending(false);
    }
  };

  const elapsed = active ? now - active.session.startTs : 0;

  return (
    <PageShell
      title={t("tab")}
      loading={!data}
      actions={
        <Press accessibilityRole="search" accessibilityLabel={t("home.search")} onPress={() => push("/gym/exercises")} className="h-11 w-full flex-row items-center gap-2 rounded-xl bg-secondary px-3">
          <Icon icon={Search} size={18} tone="muted-foreground" />
          <Text className="text-[15px] text-muted-foreground">{t("home.searchHint")}</Text>
        </Press>
      }
    >
      {!data ? (
        <GymSkeleton />
      ) : (
        <>
          {active && (
            <Press activeScale={0.98} accessibilityRole="button" onPress={() => push(`/gym/session/${active.session.id}`)} className={cn(CARD_CLASS, "px-4 py-4")} style={cardStyle}>
              <CardFill />
              <View className="flex-row items-center gap-3">
                <View className="size-10 items-center justify-center rounded-full bg-secondary">
                  <Icon icon={Play} size={18} tone="strain" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[11px] font-bold uppercase leading-4 tracking-[0.1em] text-strain">{t("home.inProgress")}</Text>
                  <Text className="text-[17px] font-semibold leading-[22px]" numberOfLines={1}>
                    {active.session.name}
                  </Text>
                  <Text className="text-[12px] leading-4 tabular-nums text-muted-foreground">
                    {t("home.resumeSub", { done: active.done, total: active.setCount })} · {clockText(elapsed)}
                  </Text>
                </View>
                <Icon icon={ChevronRight} size={18} tone="muted-foreground" />
              </View>
            </Press>
          )}

          {!active && (
            <Button onPress={() => void start()} disabled={pending}>
              {t("home.startEmpty")}
            </Button>
          )}

          <Block
            title={t("home.templates", { count: data.routines.length })}
            action={
              data.routines.length > 0 ? (
                <Press accessibilityRole="button" onPress={() => push("/gym/routine/new")} className="flex-row items-center gap-1">
                  <Icon icon={Plus} size={15} tone="foreground-secondary" />
                  <Text className="text-[13px] font-semibold text-foreground-secondary">{t("home.newTemplate")}</Text>
                </Press>
              ) : undefined
            }
          >
            {data.routines.length ? (
              <View className="gap-3">
                {data.routines.map((card) => (
                  <TemplateCard
                    key={card.routine.id}
                    card={card}
                    onStart={() => void start(card.routine.id)}
                    onEdit={() => push(`/gym/routine/${card.routine.id}`)}
                    onDelete={() => setRemoving({ id: card.routine.id, name: card.routine.name })}
                  />
                ))}
              </View>
            ) : (
              <GymEmpty icon={Dumbbell} title={t("home.emptyTemplates")} body={t("home.emptyTemplatesBody")}>
                <Button variant="secondary" className="mt-2" onPress={() => push("/gym/routine/new")}>
                  {t("home.newTemplate")}
                </Button>
              </GymEmpty>
            )}
          </Block>

          {data.recent.length > 0 && (
            <Block
              title={t("home.recent")}
              action={
                <Press accessibilityRole="link" onPress={() => push("/gym/history")} className="flex-row items-center gap-0.5">
                  <Text className="text-[12px] font-bold uppercase leading-4 tracking-[0.1em] text-foreground-secondary">{t("home.seeAll")}</Text>
                  <Icon icon={ChevronRight} size={14} tone="foreground-secondary" />
                </Press>
              }
            >
              <Card className="px-3 py-1">
                <CardFill />
                {data.recent.map((card, i) => (
                  <View key={card.id} className={i > 0 ? "border-t border-border/60" : undefined}>
                    <SessionRow card={card} onPress={() => push(`/gym/session/${card.id}`)} />
                  </View>
                ))}
              </Card>
            </Block>
          )}

          {data.week.sessions > 0 && (
            <Block title={t("home.week")}>
              <View className="gap-2">
                <View className="flex-row gap-2">
                  <StatTile label={t("home.workouts")} value={String(data.week.sessions)} />
                  <StatTile label={t("home.sets")} value={String(data.week.sets)} />
                </View>
                <View className="flex-row gap-2">
                  <StatTile label={t("home.volume")} value={volumeText(data.week.volumeKg, data.week.unit)} />
                  <StatTile label={t("home.time")} value={lengthText(data.week.seconds)} />
                </View>
              </View>
            </Block>
          )}

          {data.records.length > 0 && (
            <Block
              title={t("home.records")}
              action={
                <Press accessibilityRole="link" onPress={() => push("/gym/records")} className="flex-row items-center gap-0.5">
                  <Text className="text-[12px] font-bold uppercase leading-4 tracking-[0.1em] text-foreground-secondary">{t("home.seeAll")}</Text>
                  <Icon icon={ChevronRight} size={14} tone="foreground-secondary" />
                </Press>
              }
            >
              <Card className="px-3 py-1">
                <CardFill />
                {data.records.map((r, i) => (
                  <Press
                    key={r.exercise.id}
                    accessibilityRole="link"
                    activeBg="bg-fill-hover"
                    onPress={() => push(`/gym/exercise/${r.exercise.id}`)}
                    className={`flex-row items-center gap-3 py-3 ${i > 0 ? "border-t border-border/60" : ""}`}
                  >
                    <Icon icon={Trophy} size={16} tone="muted-foreground" />
                    <View className="min-w-0 flex-1">
                      <Text className="text-[14px] font-semibold leading-5" numberOfLines={1}>
                        {r.exercise.name}
                      </Text>
                      <Text className="font-numeric text-[12px] leading-4 text-muted-foreground">
                        {`${loadText(r.record.weightKg, r.exercise.unit)} ${r.exercise.unit} × ${r.record.reps}`}
                      </Text>
                    </View>
                    <Text className="font-numeric text-[15px] font-semibold">{`${trimLoad(Math.round(toUnit(r.record.oneRm, r.exercise.unit) * 10) / 10)} ${r.exercise.unit}`}</Text>
                    <Icon icon={ChevronRight} size={14} tone="muted-foreground" />
                  </Press>
                ))}
              </Card>
            </Block>
          )}

        </>
      )}

      <ConfirmDialog
        open={!!removing}
        title={t("routine.deleteTitle")}
        body={t("routine.deleteBody")}
        confirm={t("routine.delete")}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await removeRoutine(actionCtx().store, removing.id);
          setRemoving(null);
          dataChanged();
        }}
      />
    </PageShell>
  );
}
