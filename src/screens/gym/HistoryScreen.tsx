// Every workout `/gym/history`, newest first and grouped by month, as Strong's History tab: one card per workout with an
// exercise per line ("4 × Hack Squat", its best set beside it), then its length, volume and records. The calendar sits
// behind the header's button. Cards draw a batch at a time: a five-year log is hundreds of cards, too many to build at
// once on a small phone.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CalendarDays, Clock, Trophy, Weight } from "lucide-react-native";
import type { Best } from "@/core/gym/stats";
import type { WeightUnit } from "@/core/gym/types";
import { loadText } from "@/core/gym/load";
import { getGymCalendar, getGymHistory, type HistoryCard, type HistoryVM } from "@/queries/gym";
import { prefetch, useScreen } from "@/screens/useScreen";
import { CARD_CLASS, CardFill, useCardStyle } from "@/ui/Card";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { DetailShell } from "@/ui/shells/DetailShell";
import { DAY, clock, formatDay } from "@/lib/format";
import { push } from "@/ui/navigate";
import { Block, GymEmpty, StatTile, clockText, lengthText, volumeText } from "./parts";
import { GymSkeleton } from "./GymSkeleton";
import { QueryError } from "@/ui/shells/QueryError";

const PAGE = 12;

/** A best set as the history prints it: "65 kg × 10", "× 12", "0:20", "2.4 km". */
export function bestText(best: Best | null, unit: WeightUnit): string {
  if (!best) return "—";
  switch (best.kind) {
    case "weight":
      return `${loadText(best.weightKg, unit)} ${unit} × ${best.reps}`;
    case "reps":
      return `× ${best.reps}`;
    case "time":
      return clockText(best.seconds);
    case "distance":
      return `${Math.round(best.meters / 10) / 100} km`;
  }
}

/** The months as far as the first `count` cards reach; a month's header still counts all of its workouts. */
function firstCards(months: HistoryVM["months"], count: number) {
  const out: (HistoryVM["months"][number] & { shown: HistoryCard[] })[] = [];
  let left = count;
  for (const m of months) {
    if (left <= 0) break;
    const shown = m.cards.slice(0, left);
    left -= shown.length;
    out.push({ ...m, shown });
  }
  return out;
}

export function HistoryScreen() {
  const { t } = useTranslation("gym");
  const { data, error, reload } = useScreen(getGymHistory, ["gym-history"]);
  const [count, setCount] = useState(PAGE);
  const openCalendar = () => {
    void prefetch(getGymCalendar, ["gym-calendar"]);
    push("/gym/calendar");
  };

  const months = firstCards(data?.months ?? [], count);

  return (
    <DetailShell
      title={t("history.title")}
      subtitle={data ? t("history.total", { count: data.total }) : undefined}
      floatingAction={false}
      backHref="/gym"
      loading={!data}
      bodySkeleton={<GymSkeleton />}
      action={
        <Press accessibilityRole="button" accessibilityLabel={t("history.calendar")} onPress={openCalendar} className="size-11 items-center justify-center">
          <Icon icon={CalendarDays} size={20} tone="foreground-secondary" />
        </Press>
      }
      primary={
        !data ? (error ? <QueryError compact error={error} reload={reload} /> : null) : data.months.length ? (
          <View className="gap-6">
            <Press accessibilityRole="button" activeScale={0.98} onPress={openCalendar} className="flex-row gap-2">
              <StatTile label={t("history.thisMonth")} value={String(data.thisMonth)} />
              <StatTile label={t("history.streak")} value={t("history.weeks", { count: data.streak })} />
            </Press>
            {months.map((month) => (
              <Block
                key={month.month}
                title={formatDay(`${month.month}-01`, DAY.monthYear)}
                action={<Text className="text-[13px] text-muted-foreground">{t("history.monthCount", { count: month.cards.length })}</Text>}
              >
                <View className="gap-3">
                  {month.shown.map((card) => (
                    <WorkoutCard key={card.id} card={card} />
                  ))}
                </View>
              </Block>
            ))}
            {data.total > count && (
              <Press accessibilityRole="button" onPress={() => setCount((n) => n + PAGE)} className="h-12 items-center justify-center">
                <Text className="text-[12px] font-bold uppercase tracking-[0.1em] text-foreground-secondary">{t("history.showMore")}</Text>
              </Press>
            )}
          </View>
        ) : (
          <GymEmpty icon={CalendarDays} title={t("history.empty")} body={t("history.emptyBody")} />
        )
      }
    />
  );
}

/** One workout: its name and when, an exercise per line with the best set, then length, volume and records. */
function WorkoutCard({ card }: { card: HistoryCard }) {
  const { t } = useTranslation("gym");
  const cardStyle = useCardStyle();
  const seconds = card.endTs ? card.endTs - card.startTs : 0;
  return (
    <Press accessibilityRole="link" activeScale={0.98} onPress={() => push(`/gym/session/${card.id}`)} className={cn(CARD_CLASS, "gap-3 px-4 py-3.5")} style={cardStyle}>
      <CardFill />
      <View>
        <Text className="text-[16px] font-semibold leading-[22px]" numberOfLines={1}>
          {card.name}
        </Text>
        <Text className="text-[13px] leading-[18px] text-muted-foreground">
          {t("history.when", { day: formatDay(card.day, { weekday: "long", day: "numeric", month: "long" }), time: clock(card.startTs * 1000) })}
        </Text>
      </View>
      <View className="gap-1">
        <View className="flex-row gap-3">
          <Text className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("history.sets")}</Text>
          <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("history.bestSet")}</Text>
        </View>
        {card.lines.map((line) => (
          <View key={line.exerciseId} className="flex-row items-center gap-3">
            <Text className="min-w-0 flex-1 text-[14px] leading-5" numberOfLines={1}>{`${line.sets} × ${line.name}`}</Text>
            <Text className="shrink-0 font-numeric text-[14px] leading-5 tabular-nums text-foreground-secondary">{bestText(line.best, line.unit)}</Text>
          </View>
        ))}
      </View>
      <View className="flex-row items-center gap-4 border-t border-border pt-2.5">
        {seconds > 0 && <Fact icon={Clock} text={lengthText(seconds)} />}
        <Fact icon={Weight} text={volumeText(card.volumeKg, card.unit)} />
        <Fact icon={Trophy} text={t("history.records", { count: card.records })} highlight={card.records > 0} />
      </View>
    </Press>
  );
}

function Fact({ icon, text, highlight }: { icon: typeof Clock; text: string; highlight?: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon icon={icon} size={14} tone={highlight ? "strain" : "muted-foreground"} />
      <Text className={cn("font-numeric text-[13px] tabular-nums", highlight ? "font-semibold text-strain-text" : "text-foreground-secondary")}>{text}</Text>
    </View>
  );
}
