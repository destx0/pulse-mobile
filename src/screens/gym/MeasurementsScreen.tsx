// Body measurements `/gym/measurements`: weight, body fat and the tape, one value per day, and the weight's line.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Ruler, Trash2 } from "lucide-react-native";
import { actionCtx, dataChanged } from "@/state/app";
import { deleteMeasurement, saveMeasurement } from "@/actions/gym";
import { MEASUREMENTS, type MeasurementKind } from "@/core/gym/types";
import { getGymMeasurements } from "@/queries/gym";
import { useScreen } from "@/screens/useScreen";
import { Button } from "@/ui/Button";
import { Card, CardFill } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { DetailShell } from "@/ui/shells/DetailShell";
import { Input } from "@/screens/log/fields";
import { DAY, formatDay } from "@/lib/format";
import { localDay } from "@/lib/time";
import { ConfirmDialog, GymEmpty, MiniLine } from "./parts";

export function MeasurementsScreen() {
  const { t } = useTranslation("gym");
  const { data } = useScreen(getGymMeasurements, ["gym-measurements"]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const weight = data?.weight ?? [];

  return (
    <View className="flex-1">
    <DetailShell
      title={t("measure.title")}
      floatingAction={false}
      backHref="/gym"
      loading={!data}
      bodySkeleton={<View className="h-40" />}
      action={
        <Press accessibilityRole="button" onPress={() => setAdding(true)} className="h-9 items-center justify-center rounded-full bg-primary px-3.5">
          <Text className="text-[12px] font-bold uppercase tracking-[0.08em] text-primary-foreground">{t("measure.add")}</Text>
        </Press>
      }
      primary={
        !data ? null : (
          <View className="gap-6">
            {data.latest.length > 0 ? (
              <Card className="gap-3 px-4 py-4">
                <CardFill />
                <View className="flex-row flex-wrap gap-x-6 gap-y-3">
                  {data.latest.map((m) => (
                    <View key={m.kind} className="min-w-[42%] gap-0.5">
                      <Text className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t(`measure.${m.kind}`)}</Text>
                      <Text className="font-numeric text-[20px] font-semibold leading-6">
                        {m.value}
                        <Text className="text-[12px] font-medium text-muted-foreground"> {MEASUREMENTS.find((x) => x.kind === m.kind)?.unit}</Text>
                      </Text>
                      <Text className="text-[11px] text-muted-foreground">{formatDay(m.day, DAY.monthDay)}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : (
              <GymEmpty icon={Ruler} title={t("measure.empty")} body={t("measure.emptyBody")} />
            )}

            {weight.length > 1 && (
              <Card className="gap-2 px-4 py-4">
                <CardFill />
                <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("measure.chart")}</Text>
                <MiniLine values={weight.map((w) => w.value)} />
                <View className="flex-row justify-between">
                  <Text className="text-[11px] text-muted-foreground">{formatDay(weight[0].day, DAY.monthDay)}</Text>
                  <Text className="text-[11px] text-muted-foreground">{formatDay(weight[weight.length - 1].day, DAY.monthDay)}</Text>
                </View>
              </Card>
            )}

            {data.rows.length > 0 && (
              <Card className="px-3 py-1">
                <CardFill />
                {data.rows.slice(0, 60).map((row, i) => (
                  <View key={row.id} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? "border-t border-border/60" : ""}`}>
                    <View className="min-w-0 flex-1">
                      <Text className="text-[14px] font-medium leading-5">{t(`measure.${row.kind}`)}</Text>
                      <Text className="text-[11px] leading-4 text-muted-foreground">{formatDay(row.day, DAY.monthDay)}</Text>
                    </View>
                    <Text className="font-numeric text-[15px] font-semibold">
                      {row.value}
                      <Text className="text-[11px] font-medium text-muted-foreground"> {MEASUREMENTS.find((x) => x.kind === row.kind)?.unit}</Text>
                    </Text>
                    <Press accessibilityRole="button" accessibilityLabel={t("measure.delete")} hitSlop={8} onPress={() => setRemoving(row.id)} className="size-8 items-center justify-center">
                      <Icon icon={Trash2} size={15} tone="muted-foreground" />
                    </Press>
                  </View>
                ))}
              </Card>
            )}
          </View>
        )
      }
      footer={adding ? <AddMeasurement onDone={() => setAdding(false)} /> : undefined}
    />
      <ConfirmDialog
      open={!!removing}
      title={t("measure.delete")}
      confirm={t("measure.delete")}
      onCancel={() => setRemoving(null)}
      onConfirm={async () => {
        if (removing) await deleteMeasurement(actionCtx().store, removing);
        setRemoving(null);
        dataChanged();
      }}
    />
    </View>
  );
}

function AddMeasurement({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation("gym");
  const [kind, setKind] = useState<MeasurementKind>("weight");
  const [value, setValue] = useState("");
  const unit = MEASUREMENTS.find((m) => m.kind === kind)?.unit ?? "";
  return (
    <View className="mb-8 gap-3 rounded-2xl bg-card p-4">
      <View className="flex-row flex-wrap gap-1.5">
        {MEASUREMENTS.map((m) => (
          <Press
            key={m.kind}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === m.kind }}
            onPress={() => setKind(m.kind)}
            className={`h-8 items-center justify-center rounded-full px-3 ${kind === m.kind ? "bg-primary" : "bg-secondary"}`}
          >
            <Text className={`text-[12px] font-medium ${kind === m.kind ? "text-primary-foreground" : "text-foreground"}`}>{t(`measure.${m.kind}`)}</Text>
          </Press>
        ))}
      </View>
      <View className="flex-row items-center gap-2">
        <Input autoFocus value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="0" className="flex-1" />
        <Text className="text-[14px] font-medium text-muted-foreground">{unit}</Text>
      </View>
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={onDone}>
          {t("session.cancel")}
        </Button>
        <Button
          className="flex-1"
          disabled={!value.trim()}
          onPress={async () => {
            const n = parseFloat(value.replace(",", "."));
            if (!Number.isFinite(n)) return;
            const day = localDay(Math.floor(Date.now() / 1000), actionCtx().timeZone);
            await saveMeasurement(actionCtx().store, { day, kind, value: n });
            dataChanged();
            onDone();
          }}
        >
          {t("measure.save")}
        </Button>
      </View>
    </View>
  );
}
