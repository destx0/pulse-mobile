// The workout calendar `/gym/calendar`, Strong's: a month grid per month, newest first, each workout day filled and
// ticked. Tapping a ticked day opens that day's workout. The counts over it are the year's workouts and the week streak.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CalendarDays, Check } from "lucide-react-native";
import { addMonths, monthGrid, monthLabel, monthOf, weekdayLabels } from "@/lib/calendar";
import { DAY, formatDay } from "@/lib/format";
import { getGymCalendar } from "@/queries/gym";
import { useScreen } from "@/screens/useScreen";
import { Card, CardFill } from "@/ui/Card";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { DetailShell } from "@/ui/shells/DetailShell";
import { QueryError } from "@/ui/shells/QueryError";
import { push } from "@/ui/navigate";
import { GymEmpty, StatTile } from "./parts";

/** Months drawn per step: half a year of grids, then more on request. */
const STEP = 6;

export function CalendarScreen() {
  const { t } = useTranslation("gym");
  const { data, error, reload } = useScreen(getGymCalendar, ["gym-calendar"], { eager: true });
  const [count, setCount] = useState(STEP);
  const weekdays = weekdayLabels();

  const months: string[] = [];
  if (data?.firstMonth) {
    for (let m = monthOf(data.today); m >= data.firstMonth && months.length < count; m = addMonths(m, -1)) months.push(m);
  }
  const more = !!data?.firstMonth && months.length === count && addMonths(months[months.length - 1], -1) >= data.firstMonth;

  return (
    <DetailShell
      title={t("calendar.title")}
      floatingAction={false}
      backHref="/gym/history"
      loading={!data}
      bodySkeleton={<View className="h-80" />}
      primary={
        !data ? (error ? <QueryError compact error={error} reload={reload} /> : null) : !data.firstMonth ? (
          <GymEmpty icon={CalendarDays} title={t("calendar.empty")} body={t("calendar.emptyBody")} />
        ) : (
          <View className="gap-5">
            <View className="flex-row gap-2">
              <StatTile label={t("calendar.thisYear")} value={String(data.thisYear)} />
              <StatTile label={t("calendar.streak")} value={t("history.weeks", { count: data.streak })} />
              <StatTile label={t("calendar.total")} value={String(data.total)} />
            </View>
            {months.map((month) => {
              const count = Object.keys(data.days).filter((d) => d.startsWith(month)).reduce((n, d) => n + data.days[d].length, 0);
              return (
                <Card key={month} className="gap-2 px-3 py-3">
                  <CardFill />
                  <View className="flex-row items-baseline justify-between px-1">
                    <Text accessibilityRole="header" className="text-[17px] font-semibold">
                      {monthLabel(month, data.today)}
                    </Text>
                    <Text className="text-[12px] text-muted-foreground">{t("history.monthCount", { count })}</Text>
                  </View>
                  <View className="flex-row">
                    {weekdays.map((w) => (
                      <Text key={w.long} className="flex-1 text-center text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground" accessibilityLabel={w.long}>
                        {w.short}
                      </Text>
                    ))}
                  </View>
                  {monthGrid(month).map((week, i) => (
                    <View key={i} className="flex-row">
                      {week.map((day, j) => (
                        <View key={day ?? `x${j}`} className="flex-1 items-center py-0.5">
                          {!!day && <DayCell day={day} today={data.today} workouts={data.days[day]} />}
                        </View>
                      ))}
                    </View>
                  ))}
                </Card>
              );
            })}
            {more && (
              <Press accessibilityRole="button" onPress={() => setCount((n) => n + STEP)} className="h-12 items-center justify-center">
                <Text className="text-[12px] font-bold uppercase tracking-[0.1em] text-foreground-secondary">{t("calendar.showEarlier")}</Text>
              </Press>
            )}
          </View>
        )
      }
    />
  );
}

function DayCell({ day, today, workouts }: { day: string; today: string; workouts?: { id: string; name: string }[] }) {
  const { t } = useTranslation("gym");
  const n = Number(day.slice(8));
  const isToday = day === today;
  const label = formatDay(day, DAY.long);
  if (!workouts?.length) {
    return (
      <View
        accessible
        accessibilityLabel={t("calendar.rest", { day: label })}
        className={cn("size-10 items-center justify-center rounded-full", isToday && "bg-foreground")}
      >
        <Text className={cn("font-numeric text-[14px]", isToday ? "font-semibold text-background" : day > today ? "text-foreground/30" : "text-foreground-secondary")}>{n}</Text>
      </View>
    );
  }
  return (
    <Press
      accessibilityRole="link"
      accessibilityLabel={t("calendar.day", { day: label, names: workouts.map((w) => w.name).join(", ") })}
      activeScale={0.9}
      onPress={() => push(`/gym/session/${workouts[workouts.length - 1].id}`)}
      className={cn("size-10 items-center justify-center rounded-full", isToday ? "bg-foreground" : "bg-secondary")}
    >
      <Text className={cn("font-numeric text-[14px] font-semibold", isToday ? "text-background" : "text-foreground")}>{n}</Text>
      <View className="absolute -right-0.5 -top-0.5 size-4 items-center justify-center rounded-full bg-optimal">
        <Icon icon={Check} size={10} tone="background" strokeWidth={3.2} />
      </View>
    </Press>
  );
}
