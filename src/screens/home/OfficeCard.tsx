// Home's office card (Pulse-only, Settings › Places): today's arrival and departure, the last visit, and this week's
// days. Hidden until an office is saved. Self-loading like GymToday, so Home's own query stays unchanged.
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { clock, durationWords, formatDay } from "@/lib/format";
import { getOffice } from "@/queries/office";
import { SectionShell } from "@/ui/shells/SectionShell";
import { useShellCalendar } from "@/ui/shells/ShellStatus";
import { CAPTION } from "@/ui/metrics/primitives";
import { Text } from "@/ui/Text";
import { useScreen } from "../useScreen";

export function OfficeCard() {
  const { t } = useTranslation("home");
  const { timeZone } = useShellCalendar();
  const { data } = useScreen(getOffice, ["office"]);
  if (!data?.office) return null;
  const { today, last, days } = data;
  const line = today
    ? today.outTs === null
      ? t("office.inAt", { time: clock(today.inTs * 1000, timeZone) })
      : `${clock(today.inTs * 1000, timeZone)} – ${clock(today.outTs * 1000, timeZone)}`
    : t("office.none");
  const detail = today
    ? today.outTs === null
      ? t("office.atOffice")
      : t("office.stayed", { duration: durationWords(today.minutes) })
    : last
      ? t("office.last", { day: formatDay(last.day, { weekday: "short" }), time: clock(last.inTs * 1000, timeZone) })
      : t("office.empty");
  return (
    <SectionShell variant="card" title={t("office.title")} action={{ label: t("office.manage"), href: "/settings?s=places" }}>
      <View className="gap-1">
        <Text className="font-numeric text-2xl font-bold leading-7 tabular-nums text-foreground">{line}</Text>
        <Text className={CAPTION}>{detail}</Text>
        {days > 0 && <Text className={CAPTION}>{t("office.week", { count: days })}</Text>}
      </View>
    </SectionShell>
  );
}
