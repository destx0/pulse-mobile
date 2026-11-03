// The calculators `/gym/tools`: a set's estimated one-rep max with its percentage table, and the plates for a bar.
// One kg / lb switch at the top drives both, so a pound gym never has to convert in its head.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { BARS, DEFAULT_PLATES_KG, DEFAULT_PLATES_LB, RM_PERCENTS, estimate1Rm, fromUnit, percentOf1Rm, platesPerSide, toUnit, trimLoad } from "@/core/gym/load";
import type { WeightUnit } from "@/core/gym/types";
import { Card, CardFill } from "@/ui/Card";
import { Text } from "@/ui/Text";
import { DetailShell } from "@/ui/shells/DetailShell";
import { Input } from "@/screens/log/fields";
import { cn } from "@/ui/cn";
import { MISSING } from "@/lib/format";

export function ToolsScreen() {
  const { t } = useTranslation("gym");
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [target, setTarget] = useState("");
  const [bar, setBar] = useState<number | null>(null);

  const n = (v: string) => {
    const x = parseFloat(v.replace(",", "."));
    return Number.isFinite(x) ? x : 0;
  };
  const bars = unit === "kg" ? BARS.kg : BARS.lb;
  const barWeight = bar ?? bars[0];
  const plates = unit === "kg" ? DEFAULT_PLATES_KG : DEFAULT_PLATES_LB;
  const oneRmKg = estimate1Rm(fromUnit(n(weight), unit), Math.round(n(reps)));
  const oneRm = toUnit(oneRmKg, unit);
  const plateResult = useMemo(() => platesPerSide(n(target), barWeight, plates, unit), [target, barWeight, unit, plates]);

  const switchUnit = (next: WeightUnit) => {
    if (next === unit) return;
    // Change the unit, not the weight: 100 lb stays 45.4 kg and shows 100 lb again when switched back.
    const convert = (v: string) => {
      const x = n(v);
      return x ? trimLoad(Math.round(toUnit(fromUnit(x, unit), next) * 10) / 10) : v;
    };
    setWeight(convert);
    setTarget(convert);
    setUnit(next);
    setBar(null);
  };

  return (
    <DetailShell
      title={t("tools.title")}
      floatingAction={false}
      backHref="/gym"
      primary={
        <View className="gap-8">
          <View className="flex-row justify-end">
            <View className="flex-row gap-2 self-start rounded-lg bg-muted p-0.5">
              {(["kg", "lb"] as const).map((u) => (
                <Text
                  key={u}
                  onPress={() => switchUnit(u)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: unit === u }}
                  className={cn("h-9 min-w-14 rounded-md px-3 text-center text-[13px] font-bold uppercase leading-9", unit === u ? "bg-secondary text-foreground" : "text-muted-foreground")}
                >
                  {u}
                </Text>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text accessibilityRole="header" className="text-[22px] font-semibold leading-7 tracking-[-0.01em]">
              {t("tools.oneRm")}
            </Text>
            <Text className="text-[13px] leading-[19px] text-foreground-secondary">{t("tools.oneRmBody")}</Text>
            <Card className="gap-3 px-4 py-4">
              <CardFill />
              <View className="flex-row gap-3">
                <View className="flex-1 gap-1.5">
                  <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{`${t("tools.weight")} (${unit})`}</Text>
                  <Input value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="0" />
                </View>
                <View className="flex-1 gap-1.5">
                  <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("tools.reps")}</Text>
                  <Input value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="0" />
                </View>
              </View>
              <View className="flex-row items-baseline gap-2">
                <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("tools.result")}</Text>
                <Text className="font-numeric text-[24px] font-semibold leading-8">{oneRm ? trimLoad(Math.round(oneRm * 10) / 10) : "0"}</Text>
                <Text className="text-[13px] text-muted-foreground">{unit}</Text>
              </View>
              {oneRm > 0 && (
                <View className="gap-1 border-t border-border/60 pt-2">
                  {RM_PERCENTS.map((p) => (
                    <View key={p} className="flex-row items-center justify-between py-1">
                      <Text className="font-numeric text-[13px] text-foreground-secondary">{t("tools.percent", { percent: p })}</Text>
                      <Text className="font-numeric text-[13px] font-semibold">{`${trimLoad(Math.round(percentOf1Rm(oneRmKg, p, unit) * 10) / 10)} ${unit}`}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </View>

          <View className="gap-2">
            <Text accessibilityRole="header" className="text-[22px] font-semibold leading-7 tracking-[-0.01em]">
              {t("tools.plates")}
            </Text>
            <Text className="text-[13px] leading-[19px] text-foreground-secondary">{t("tools.platesBody")}</Text>
            <Card className="gap-3 px-4 py-4">
              <CardFill />
              <View className="gap-1.5">
                <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("tools.target")}</Text>
                <Input value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0" />
              </View>
              <View className="gap-1.5">
                <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("tools.bar")}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {bars.map((b) => (
                    <Text
                      key={b}
                      onPress={() => setBar(b)}
                      className={cn("h-9 min-w-14 rounded-lg px-3 text-center text-[13px] font-semibold leading-9", barWeight === b ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}
                    >
                      {b} {unit}
                    </Text>
                  ))}
                </View>
              </View>
              <View className="gap-1 border-t border-border/60 pt-2">
                <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("tools.perSide")}</Text>
                {n(target) <= 0 ? (
                  <Text className="text-[15px] text-muted-foreground">{MISSING}</Text>
                ) : plateResult.belowBar ? (
                  <Text className="text-[15px] font-medium text-recovery-red-text">{t("tools.belowBar")}</Text>
                ) : plateResult.perSide.length ? (
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    {plateResult.perSide.map((p, i) => (
                      <View key={i} className="h-8 items-center justify-center rounded-md bg-secondary px-2.5">
                        <Text className="font-numeric text-[13px] font-semibold">{p}</Text>
                      </View>
                    ))}
                    {plateResult.remainder > 0 && <Text className="text-[12px] text-warning-text">{t("tools.remainder", { value: `${plateResult.remainder} ${unit}` })}</Text>}
                  </View>
                ) : (
                  <Text className="text-[15px] text-muted-foreground">{t("tools.none")}</Text>
                )}
              </View>
            </Card>
          </View>
        </View>
      }
    />
  );
}
