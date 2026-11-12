// The food-order card on Habits: how many orders the SMS confirmations found this week, a day strip, and the last
// merchant. The message text never leaves the phone; only merchant, day and the dedupe key are stored.
import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { Utensils } from "lucide-react-native";
import { scanFoodOrders } from "@/actions/foodOrders";
import { actionCtx, dataChanged } from "@/state/app";
import { getFoodOrders } from "@/queries/foodOrders";
import { useScreen } from "@/screens/useScreen";
import { formatDay } from "@/lib/format";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { SectionShell } from "@/ui/shells/SectionShell";
import { toast } from "@/ui/Toast";
import { CAPTION } from "@/ui/metrics/primitives";

const LAST_SCAN = "pulse.foodOrders.lastScan";
const SCAN_EVERY_MS = 6 * 60 * 60 * 1000;

const nowS = () => Math.floor(Date.now() / 1000);

export function FoodOrdersCard() {
  const { t } = useTranslation("habits");
  const { data, reload } = useScreen(getFoodOrders, ["food-orders"], { freshMs: 0 });
  const [granted, setGranted] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auto = useRef(false);

  const scan = async (announce: boolean) => {
    setScanning(true);
    setError(null);
    try {
      const res = await scanFoodOrders(actionCtx().store, actionCtx().timeZone, nowS());
      if (!res.ok) {
        if (res.error === "permission") setGranted(false);
        if (announce) setError(t(res.error === "unsupported" ? "food.unsupported" : "food.permissionDenied"));
        return;
      }
      setGranted(true);
      await AsyncStorage.setItem(LAST_SCAN, String(Date.now())).catch(() => {});
      dataChanged("habits");
      reload();
      if (announce) toast.success(res.added > 0 ? t("food.found", { count: res.added }) : t("food.noneFound"));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (auto.current) return;
    auto.current = true;
    if (Platform.OS !== "android") return;
    void (async () => {
      const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS).catch(() => false);
      setGranted(ok);
      if (!ok) return;
      const last = Number(await AsyncStorage.getItem(LAST_SCAN).catch(() => 0));
      if (!Number.isFinite(last) || Date.now() - last > SCAN_EVERY_MS) await scan(false);
    })();
    // The scan runs once per mount; the button re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return null;
  const { week, last } = data;
  const lastLine = last
    ? t("food.last", { merchant: last.merchant, day: formatDay(last.day, { month: "short", day: "numeric" }) })
    : t("food.emptyBody");

  return (
    <SectionShell
      variant="card"
      title={t("food.title")}
      info={{ title: t("food.title"), body: t("food.source") }}
      action={
        <Press accessibilityRole="button" accessibilityLabel={t("food.scan")} disabled={scanning} onPress={() => void scan(true)} hitSlop={10} className="flex-row items-center gap-1.5">
          <Icon icon={Utensils} size={14} tone="foreground-secondary" />
          <Text className="text-xs font-bold uppercase leading-4 tracking-[0.1em] text-foreground-secondary">{scanning ? t("food.scanning") : t("food.scan")}</Text>
        </Press>
      }
    >
      <View className="gap-2.5">
        <View className="flex-row items-end gap-2">
          <Text className="font-numeric text-2xl font-bold leading-7 tabular-nums">{week}</Text>
          <Text className={cn(CAPTION, "pb-0.5")}>{t("food.thisWeek", { count: week })}</Text>
        </View>
        <Text className={CAPTION} numberOfLines={1}>
          {lastLine}
        </Text>
        {granted === false && (
          <View className="gap-2">
            <Button variant="secondary" onPress={() => void scan(true)} disabled={scanning}>
              {t("food.connect")}
            </Button>
            <Text className="text-[11px] leading-4 text-muted-foreground">{t("food.privacy")}</Text>
          </View>
        )}
        {!!error && <Text accessibilityRole="alert" className="text-[12px] font-medium leading-4 text-recovery-red-text">{error}</Text>}
      </View>
    </SectionShell>
  );
}
