// One exercise `/gym/exercise/[id]`: its record, the estimated-1RM curve, and every session it was trained in.
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ChartLine, Dumbbell } from "lucide-react-native";
import { getGymExercise } from "@/queries/gym";
import { useScreen } from "@/screens/useScreen";
import { Card, CardFill } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { DetailShell } from "@/ui/shells/DetailShell";
import { DAY, formatDay } from "@/lib/format";
import { loadText } from "@/core/gym/load";
import { push } from "@/ui/navigate";
import { GymEmpty, MiniLine, StatTile, volumeText } from "./parts";

export function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation("gym");
  const { data } = useScreen((ctx) => getGymExercise(ctx, id), ["gym-exercise", id]);

  return (
    <DetailShell
      title={data?.exercise.name ?? t("exercise.title")}
      subtitle={data ? t(`parts.${data.exercise.bodyPart}`) : undefined}
      floatingAction={false}
      backHref="/gym"
      loading={!data}
      bodySkeleton={<View className="h-40" />}
      primary={
        !data ? null : (
          <View className="gap-8">
            {data.record ? (
              <Card className="gap-4 px-4 py-4">
                <CardFill />
                <View className="gap-1">
                  <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("exercise.record")}</Text>
                  <View className="flex-row items-baseline gap-2">
                    <Text className="font-numeric text-[34px] font-semibold leading-10">{data.record.oneRm.toFixed(1)}</Text>
                    <Text className="text-[15px] font-medium text-foreground-secondary">kg</Text>
                    {data.previousRecord && <Text className="text-[13px] text-muted-foreground">{t("exercise.previousRecord", { value: `${data.previousRecord.oneRm.toFixed(1)} kg` })}</Text>}
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <StatTile label={t("exercise.bestWeight")} value={`${Math.round(data.record.weightKg)} kg × ${data.record.reps}`} />
                  <StatTile label={t("exercise.setsTotal", { count: data.totalSets })} value={volumeText(data.totalVolumeKg)} />
                </View>
              </Card>
            ) : (
              <GymEmpty icon={Dumbbell} title={t("exercise.noHistory")} body={t("exercise.noChart")} />
            )}

            {data.series.length > 1 && (
              <Card className="gap-2 px-4 py-4">
                <CardFill />
                <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("exercise.chart")}</Text>
                <MiniLine values={data.series.map((p) => p.oneRm)} />
                <View className="flex-row justify-between">
                  <Text className="text-[11px] text-muted-foreground">{formatDay(new Date(data.series[0].ts * 1000).toISOString().slice(0, 10), DAY.monthDay)}</Text>
                  <Text className="text-[11px] text-muted-foreground">{formatDay(new Date(data.series[data.series.length - 1].ts * 1000).toISOString().slice(0, 10), DAY.monthDay)}</Text>
                </View>
              </Card>
            )}

            {data.history.length > 0 && (
              <View className="gap-2">
                <Text accessibilityRole="header" className="text-[22px] font-semibold leading-7 tracking-[-0.01em]">
                  {t("exercise.history")}
                </Text>
                <Card className="px-3 py-1">
                  <CardFill />
                  {data.history.map((h, i) => {
                    const best = h.sets.filter((s) => s.completed && s.type !== "warmup" && s.weightKg > 0).sort((a, b) => b.weightKg - a.weightKg)[0];
                    return (
                      <Press
                        key={h.session.id}
                        accessibilityRole="link"
                        activeBg="bg-fill-hover"
                        onPress={() => push(`/gym/session/${h.session.id}`)}
                        className={`flex-row items-center gap-3 py-3 ${i > 0 ? "border-t border-border/60" : ""}`}
                      >
                        <View className="min-w-0 flex-1">
                          <Text className="text-[14px] font-semibold leading-5">{h.session.name}</Text>
                          <Text className="text-[12px] leading-4 text-muted-foreground">
                            {formatDay(h.session.day, DAY.short)} · {t("session.setsCount", { count: h.sets.filter((s) => s.completed).length })}
                          </Text>
                        </View>
                        <Text className="font-numeric text-[14px] font-semibold">
                          {h.sets
                            .filter((s) => s.completed)
                            .map((s) => (s.seconds && !s.reps ? `${s.seconds}s` : s.distanceM ? `${Math.round(s.distanceM / 10) / 100}km` : `${loadText(s.weightKg, "kg")}×${s.reps}`))
                            .slice(0, 3)
                            .join("  ")}
                        </Text>
                        {!!best && <Icon icon={ChartLine} size={14} tone="muted-foreground" />}
                      </Press>
                    );
                  })}
                </Card>
              </View>
            )}
          </View>
        )
      }
    />
  );
}
