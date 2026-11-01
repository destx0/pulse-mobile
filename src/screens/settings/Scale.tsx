// Settings › Scale (`/settings?s=scale`): the scale-only athlete flag, the remembered scale, and the way to the scale
// screen. The flag is stored in AsyncStorage ("pulse.lefu.athlete") and sent to the scale in its FD 37 profile command;
// Pulse's own profile has no athlete field, and this one is never inferred from activity or weight.
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useLeFuScaleControl } from "@/state/lefuScale";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { push } from "@/ui/navigate";
import { SectionShell } from "@/ui/shells/SectionShell";
import { Text } from "@/ui/Text";
import { statusLabel } from "../scale/ScaleScreen";
import { HINT, ROW, ROW_LABEL, ROW_RULE, ROW_VALUE, SwitchRow } from "./controls";

function Row({ label, value, tone, rule }: { label: string; value: string; tone?: string; rule?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className={cn(ROW, rule && ROW_RULE)}>
      <Text className={ROW_LABEL}>{label}</Text>
      <Text className={cn(ROW_VALUE, tone)}>{value}</Text>
    </View>
  );
}

export function ScaleSection() {
  const { t } = useTranslation("scale");
  const scale = useLeFuScaleControl();
  return (
    <SectionShell variant="card" title={t("settings.title")}>
      <View>
        <Row label={t("settings.connection")} value={statusLabel(scale)} tone={scale.status === "connected" ? "text-optimal-text" : undefined} />
        <Row rule label={t("settings.scale")} value={scale.remembered?.name ?? t("none")} />
      </View>
      <SwitchRow label={t("settings.athlete")} hint={t("settings.athleteHint")} value={scale.athlete} onChange={(v) => void scale.setAthlete(v)} rule={false} />
      <Button className="mt-4" onPress={() => push("/scale")}>
        {t("settings.open")}
      </Button>
      <Text className={cn(HINT, "mt-2")}>{t("settings.note")}</Text>
    </SectionShell>
  );
}
