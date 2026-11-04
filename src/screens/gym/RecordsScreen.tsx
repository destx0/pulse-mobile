// The records board `/gym/records`: the best estimated one-rep max of every exercise the log has trained, newest first.
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Trophy } from "lucide-react-native";
import { loadText, toUnit, trimLoad } from "@/core/gym/load";
import { getGymRecords } from "@/queries/gym";
import { useScreen } from "@/screens/useScreen";
import { Card, CardFill } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { DetailShell } from "@/ui/shells/DetailShell";
import { DAY, formatDay } from "@/lib/format";
import { push } from "@/ui/navigate";
import { GymEmpty } from "./parts";
import { QueryError } from "@/ui/shells/QueryError";

export function RecordsScreen() {
  const { t } = useTranslation("gym");
  const { data, error, reload } = useScreen(getGymRecords, ["gym-records"]);

  return (
    <DetailShell
      title={t("records.title")}
      floatingAction={false}
      backHref="/gym"
      loading={!data}
      bodySkeleton={<View className="h-40" />}
      primary={
        !data ? (error ? <QueryError compact error={error} reload={reload} /> : null) : data.rows.length ? (
          <Card className="px-3 py-1">
            <CardFill />
            {data.rows.map((row, i) => {
              const unit = row.exercise.unit;
              return (
                <Press
                  key={row.exercise.id}
                  accessibilityRole="link"
                  activeBg="bg-fill-hover"
                  onPress={() => push(`/gym/exercise/${row.exercise.id}`)}
                  className={`flex-row items-center gap-3 py-3 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <Icon icon={Trophy} size={16} tone="muted-foreground" />
                  <View className="min-w-0 flex-1">
                    <Text className="text-[14px] font-semibold leading-5" numberOfLines={1}>
                      {row.exercise.name}
                    </Text>
                    <Text className="font-numeric text-[12px] leading-4 text-muted-foreground">
                      {`${loadText(row.weightKg, unit)} ${unit} × ${row.reps} · ${t("records.sets", { count: row.sessions })}`}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-numeric text-[17px] font-semibold leading-6">{trimLoad(Math.round(toUnit(row.record.oneRm, unit) * 10) / 10)}</Text>
                    <Text className="text-[11px] leading-4 text-muted-foreground">{`${unit} · ${row.ts ? formatDay(new Date(row.ts * 1000).toISOString().slice(0, 10), DAY.monthDay) : ""}`}</Text>
                  </View>
                </Press>
              );
            })}
          </Card>
        ) : (
          <GymEmpty icon={Trophy} title={t("records.empty")} body={t("records.emptyBody")} />
        )
      }
    />
  );
}
