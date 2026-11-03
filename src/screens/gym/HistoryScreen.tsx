// Every workout `/gym/history`, newest first and grouped by month, as Strong's History tab does it.
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { getGymHistory } from "@/queries/gym";
import { useScreen } from "@/screens/useScreen";
import { Card, CardFill } from "@/ui/Card";
import { DetailShell } from "@/ui/shells/DetailShell";
import { DAY, formatDay } from "@/lib/format";
import { push } from "@/ui/navigate";
import { Block, GymEmpty, SessionRow } from "./parts";
import { GymSkeleton } from "./GymSkeleton";
import { QueryError } from "@/ui/shells/QueryError";

export function HistoryScreen() {
  const { t } = useTranslation("gym");
  const { data, error, reload } = useScreen(getGymHistory, ["gym-history"]);

  return (
    <DetailShell
      title={t("history.title")}
      subtitle={data ? t("history.total", { count: data.total }) : undefined}
      floatingAction={false}
      backHref="/gym"
      loading={!data}
      bodySkeleton={<GymSkeleton />}
      primary={
        !data ? (error ? <QueryError compact error={error} reload={reload} /> : null) : data.months.length ? (
          <View className="gap-6">
            {data.months.map((month) => (
              <Block key={month.month} title={formatDay(`${month.month}-01`, DAY.monthYear)}>
                <Card className="px-3 py-1">
                  <CardFill />
                  {month.cards.map((card, i) => (
                    <View key={card.id} className={i > 0 ? "border-t border-border/60" : undefined}>
                      <SessionRow card={card} onPress={() => push(`/gym/session/${card.id}`)} />
                    </View>
                  ))}
                </Card>
              </Block>
            ))}
          </View>
        ) : (
          <GymEmpty icon={CalendarDays} title={t("history.empty")} body={t("history.emptyBody")} />
        )
      }
    />
  );
}
