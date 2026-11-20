// One exercise `/gym/exercise/[id]`, Strong's exercise page in Pulse's look: History (every session it was trained in,
// set by set with each set's estimated 1RM), Charts (its best set, heaviest weight, volume and reps over time) and
// Records (its personal bests and the heaviest weight for each rep count).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Dumbbell, Trophy } from "lucide-react-native";
import { estimate1Rm, loadText, toUnit, trimLoad } from "@/core/gym/load";
import { isRepSet, type ExercisePoint, type ExerciseRecords } from "@/core/gym/stats";
import type { GymExercise, GymSet, WeightUnit } from "@/core/gym/types";
import { getGymExercise, type ExercisePageVM } from "@/queries/gym";
import { useScreen } from "@/screens/useScreen";
import { CARD_CLASS, Card, CardFill, useCardStyle } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Segmented } from "@/ui/Segmented";
import { Text } from "@/ui/Text";
import { DetailShell } from "@/ui/shells/DetailShell";
import { QueryError } from "@/ui/shells/QueryError";
import { DAY, clock, formatDay } from "@/lib/format";
import { push } from "@/ui/navigate";
import { cn } from "@/ui/cn";
import { GymChart } from "./GymChart";
import { GymEmpty, clockText, volumeText } from "./parts";

type Tab = "history" | "charts" | "records";
type Range = "3m" | "1y" | "all";

/** The tab and range last used, for the next exercise opened this launch. */
let lastTab: Tab | null = null;
let lastRange: Range = "1y";

const PAGE = 8;

/** A weight of kilograms in the exercise's unit, trimmed: "37.5". */
const w = (kg: number, unit: WeightUnit) => loadText(kg, unit);
/** An estimated 1RM, rounded to a whole number in the unit, as Strong's 1RM column. */
const rmText = (kg: number, unit: WeightUnit) => String(Math.round(toUnit(kg, unit)));
const dayOf = (ts: number | null) => (ts ? formatDay(new Date(ts * 1000).toISOString().slice(0, 10), DAY.full) : "");

export function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation("gym");
  const { data, error, reload } = useScreen((ctx) => getGymExercise(ctx, id), ["gym-exercise", id]);
  const [tab, setTab] = useState<Tab | null>(lastTab);
  const shown: Tab = tab ?? (data && data.points.length > 1 ? "charts" : "history");
  const pick = (next: Tab) => {
    lastTab = next;
    setTab(next);
  };

  return (
    <DetailShell
      title={data?.exercise.name ?? t("exercise.title")}
      subtitle={data ? t(`parts.${data.exercise.bodyPart}`) : undefined}
      floatingAction={false}
      backHref="/gym"
      loading={!data}
      bodySkeleton={<View className="h-40" />}
      primary={
        !data ? (error ? <QueryError compact error={error} reload={reload} /> : null) : !data.sessions.length ? (
          <GymEmpty icon={Dumbbell} title={t("exercise.noHistory")} body={t("exercise.noChart")} />
        ) : (
          <View className="gap-5">
            <Segmented
              fill
              label={t("exercise.tabs")}
              value={shown}
              onChange={pick}
              textClassName="text-[12px] font-bold uppercase tracking-[0.08em]"
              options={[
                { value: "history", label: t("exercise.tabHistory") },
                { value: "charts", label: t("exercise.tabCharts") },
                { value: "records", label: t("exercise.tabRecords") },
              ]}
            />
            {shown === "history" && <HistoryTab data={data} />}
            {shown === "charts" && <ChartsTab exercise={data.exercise} points={data.points} />}
            {shown === "records" && <RecordsTab exercise={data.exercise} prs={data.prs} />}
          </View>
        )
      }
    />
  );
}

/** One set's text: "37.5 kg × 10", "0:45", "2.4 km · 12:00". */
function setText(s: GymSet, unit: WeightUnit): string {
  if (s.distanceM) return `${Math.round(s.distanceM / 10) / 100} km${s.seconds ? ` · ${clockText(s.seconds)}` : ""}`;
  if (s.seconds && !s.reps) return clockText(s.seconds);
  return s.weightKg > 0 ? `${w(s.weightKg, unit)} ${unit} × ${s.reps}` : `× ${s.reps}`;
}

function HistoryTab({ data }: { data: ExercisePageVM }) {
  const { t } = useTranslation("gym");
  const [count, setCount] = useState(PAGE);
  const cardStyle = useCardStyle();
  const unit = data.exercise.unit;
  const weighted = data.points.some((p) => p.oneRm > 0);
  return (
    <View className="gap-3">
      {data.sessions.slice(0, count).map((session) => (
        <Press
          key={session.id}
          accessibilityRole="link"
          activeScale={0.98}
          onPress={() => push(`/gym/session/${session.id}`)}
          className={cn(CARD_CLASS, "px-4 py-3.5")}
          style={cardStyle}
        >
          <CardFill />
          <Text className="text-[16px] font-semibold leading-[22px]" numberOfLines={1}>
            {session.name}
          </Text>
          <Text className="text-[13px] leading-[18px] text-muted-foreground">
            {t("history.when", { day: formatDay(session.day, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), time: clock(session.startTs * 1000) })}
          </Text>
          <View className="mt-3 flex-row items-center">
            <Text className="flex-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("exercise.setsPerformed")}</Text>
            {weighted && <Text className="w-12 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("exercise.oneRm")}</Text>}
          </View>
          <View className="mt-1.5 gap-1">
            {session.sets.map((s) => (
              <View key={s.id} className="flex-row items-center">
                <Text className={cn("w-7 font-numeric text-[14px] leading-5", s.type === "warmup" ? "text-warning-text" : "text-muted-foreground")}>
                  {s.type === "warmup" ? t("exercise.warmup") : String(s.setNo)}
                </Text>
                <Text className="flex-1 font-numeric text-[14px] leading-5 tabular-nums">{setText(s, unit)}</Text>
                {weighted && (
                  <Text className="w-12 text-right font-numeric text-[14px] leading-5 tabular-nums text-foreground-secondary">
                    {isRepSet(s) && s.weightKg > 0 && s.reps > 0 && s.type !== "warmup" ? rmText(estimate1Rm(s.weightKg, s.reps), unit) : ""}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </Press>
      ))}
      {data.sessions.length > count && (
        <Press accessibilityRole="button" onPress={() => setCount((n) => n + PAGE)} className="h-12 items-center justify-center">
          <Text className="text-[12px] font-bold uppercase tracking-[0.1em] text-foreground-secondary">{t("exercise.showMore")}</Text>
        </Press>
      )}
    </View>
  );
}

type Series = { key: string; title: string; pick: (p: ExercisePoint) => number; format: (v: number) => string };

function ChartsTab({ exercise, points }: { exercise: GymExercise; points: ExercisePoint[] }) {
  const { t } = useTranslation("gym");
  const [range, setRange] = useState<Range>(lastRange);
  const unit = exercise.unit;
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const first = points[0]?.ts ?? now;
  const from = range === "3m" ? now - 91 * 86_400 : range === "1y" ? now - 365 * 86_400 : first;
  const inRange = points.filter((p) => p.ts >= from);
  const kg = (v: number) => `${trimLoad(Math.round(toUnit(v, unit) * 10) / 10)} ${unit}`;
  const weighted = points.some((p) => p.oneRm > 0);
  const series: Series[] = weighted
    ? [
        { key: "rm", title: t("exercise.chartOneRm"), pick: (p) => p.oneRm, format: kg },
        { key: "weight", title: t("exercise.chartWeight"), pick: (p) => p.maxWeight, format: kg },
        { key: "volume", title: t("exercise.chartVolume"), pick: (p) => p.volume, format: (v) => volumeText(v, unit) },
        { key: "reps", title: t("exercise.chartReps"), pick: (p) => p.maxReps, format: (v) => String(Math.round(v)) },
      ]
    : points.some((p) => p.maxReps > 0)
      ? [
          { key: "reps", title: t("exercise.chartReps"), pick: (p) => p.maxReps, format: (v) => String(Math.round(v)) },
          { key: "total", title: t("exercise.chartTotalReps"), pick: (p) => p.totalReps, format: (v) => String(Math.round(v)) },
        ]
      : [
          ...(points.some((p) => p.maxMeters > 0) ? [{ key: "km", title: t("exercise.chartDistance"), pick: (p: ExercisePoint) => p.maxMeters, format: (v: number) => `${Math.round(v / 10) / 100} km` }] : []),
          { key: "time", title: t("exercise.chartTime"), pick: (p) => p.maxSeconds, format: (v) => clockText(v) },
        ];
  return (
    <View className="gap-4">
      <Segmented
        label={t("exercise.range")}
        value={range}
        onChange={(r) => {
          lastRange = r;
          setRange(r);
        }}
        options={[
          { value: "3m", label: t("exercise.range3m") },
          { value: "1y", label: t("exercise.range1y") },
          { value: "all", label: t("exercise.rangeAll") },
        ]}
      />
      {series.map((s) => {
        const pts = inRange.filter((p) => s.pick(p) > 0).map((p) => ({ ts: p.ts, value: s.pick(p) }));
        const best = pts.reduce((m, p) => Math.max(m, p.value), 0);
        return (
          <Card key={s.key} className="gap-3 px-4 py-4">
            <CardFill />
            <View className="flex-row items-start justify-between gap-3">
              <Text className="shrink text-[15px] font-semibold leading-5">{s.title}</Text>
              {pts.length > 0 && (
                <View className="items-end">
                  <Text className="font-numeric text-[15px] font-semibold leading-5 tabular-nums">{s.format(pts[pts.length - 1].value)}</Text>
                  <Text className="text-[11px] leading-4 text-muted-foreground">{`${t("exercise.best")} ${s.format(best)}`}</Text>
                </View>
              )}
            </View>
            {pts.length > 1 ? (
              <GymChart points={pts} from={Math.min(from, pts[0].ts)} to={now} format={s.format} />
            ) : (
              <Text className="py-6 text-center text-[13px] text-muted-foreground">{t("exercise.notEnough")}</Text>
            )}
          </Card>
        );
      })}
    </View>
  );
}

function RecordsTab({ exercise, prs }: { exercise: GymExercise; prs: ExerciseRecords }) {
  const { t } = useTranslation("gym");
  const unit = exercise.unit;
  const kg = (v: number) => `${trimLoad(Math.round(toUnit(v, unit) * 10) / 10)} ${unit}`;
  const rows = [
    prs.oneRm && { key: "rm", label: t("exercise.recOneRm"), value: kg(prs.oneRm.value), aside: `${w(prs.oneRm.weightKg, unit)} ${unit} × ${prs.oneRm.reps}`, at: prs.oneRm },
    prs.heaviest && { key: "heavy", label: t("exercise.recHeaviest"), value: kg(prs.heaviest.value), aside: `× ${prs.heaviest.reps}`, at: prs.heaviest },
    prs.setVolume && { key: "setVol", label: t("exercise.recSetVolume"), value: volumeText(prs.setVolume.value, unit), aside: `${w(prs.setVolume.weightKg, unit)} ${unit} × ${prs.setVolume.reps}`, at: prs.setVolume },
    prs.sessionVolume && { key: "sessionVol", label: t("exercise.recSessionVolume"), value: volumeText(prs.sessionVolume.value, unit), aside: "", at: prs.sessionVolume },
    prs.mostReps && { key: "reps", label: t("exercise.recMostReps"), value: String(prs.mostReps.value), aside: prs.mostReps.weightKg > 0 ? `${w(prs.mostReps.weightKg, unit)} ${unit}` : "", at: prs.mostReps },
    prs.longest && { key: "time", label: t("exercise.recLongest"), value: clockText(prs.longest.value), aside: "", at: prs.longest },
  ].filter((r): r is NonNullable<typeof r> => !!r);
  if (!rows.length) return <GymEmpty icon={Trophy} title={t("exercise.noRecords")} body={t("exercise.noChart")} />;
  return (
    <View className="gap-5">
      <Card className="px-3 py-1">
        <CardFill />
        {rows.map((r, i) => (
          <Press
            key={r.key}
            accessibilityRole="link"
            activeBg="bg-fill-hover"
            onPress={() => push(`/gym/session/${r.at.sessionId}`)}
            className={cn("flex-row items-center gap-3 py-3", i > 0 && "border-t border-border")}
          >
            <Icon icon={Trophy} size={15} tone={i === 0 ? "strain" : "muted-foreground"} />
            <View className="min-w-0 flex-1">
              <Text className="text-[14px] font-medium leading-5">{r.label}</Text>
              <Text className="text-[12px] leading-4 text-muted-foreground">{[r.aside, dayOf(r.at.ts)].filter(Boolean).join(" · ")}</Text>
            </View>
            <Text className="font-numeric text-[16px] font-semibold tabular-nums">{r.value}</Text>
          </Press>
        ))}
      </Card>
      {prs.repBests.length > 0 && (
        <View className="gap-2">
          <Text accessibilityRole="header" className="text-[20px] font-semibold leading-7 tracking-[-0.01em]">
            {t("exercise.repBests")}
          </Text>
          <Text className="text-[13px] leading-[18px] text-muted-foreground">{t("exercise.repBestsHint")}</Text>
          <Card className="px-4 py-2">
            <CardFill />
            <View className="flex-row py-1.5">
              <Text className="w-14 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("exercise.repsCol")}</Text>
              <Text className="flex-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("exercise.weightCol")}</Text>
              <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("exercise.dateCol")}</Text>
            </View>
            {prs.repBests.map((r) => (
              <Press key={r.reps} accessibilityRole="link" activeBg="bg-fill-hover" onPress={() => push(`/gym/session/${r.sessionId}`)} className="flex-row items-center border-t border-border py-2">
                <Text className="w-14 font-numeric text-[14px] tabular-nums text-muted-foreground">{r.reps}</Text>
                <Text className="flex-1 font-numeric text-[14px] font-semibold tabular-nums">{`${w(r.weightKg, unit)} ${unit}`}</Text>
                <Text className="text-[12px] text-muted-foreground">{dayOf(r.ts)}</Text>
              </Press>
            ))}
          </Card>
        </View>
      )}
    </View>
  );
}
