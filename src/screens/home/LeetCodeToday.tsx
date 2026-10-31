// Home's top area, where the Pulse wordmark used to sit: today's distinct LeetCode problems, only when a profile is
// connected and only on today. A failed refresh says "Sync failed" rather than showing yesterday's (or a zero) count.
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Code2, TriangleAlert } from "lucide-react-native";
import { localDay } from "@/lib/time";
import { todayProblemsOn } from "@/leetcode/view";
import { useLeetCode } from "@/state/leetcode";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { push } from "@/ui/navigate";
import { Press } from "@/ui/Press";
import { Skeleton } from "@/ui/Skeleton";
import { Text } from "@/ui/Text";

const PILL = "h-7 flex-row items-center gap-1.5 self-center rounded-full bg-foreground/[0.045] px-3";

export function LeetCodeToday({ show, today, timeZone }: { show: boolean; today: string; timeZone: string }) {
  const { t } = useTranslation("leetcode");
  const state = useLeetCode();
  if (!show || !state.ready || !state.username) return null;

  if (state.error) {
    return (
      <Press
        activeScale={0.96}
        accessibilityRole="link"
        accessibilityLabel={t("home.openFailed")}
        onPress={() => push("/leetcode")}
        className={PILL}
      >
        <Icon icon={TriangleAlert} size={14} tone="warning-text" strokeWidth={2} />
        <Text className="text-[11px] font-bold uppercase leading-4 tracking-[0.1em] text-warning-text">{t("home.failed")}</Text>
      </Press>
    );
  }

  const snapshot = state.snapshot;
  if (!snapshot)
    return (
      <View className={PILL}>
        <Skeleton className="h-3 w-28 rounded-full" />
      </View>
    );
  // A snapshot from before today has not seen today's solves yet: wait for the refresh rather than showing a stale 0.
  if (state.status === "syncing" && localDay(snapshot.fetchedAt, timeZone) !== today)
    return (
      <View className={PILL}>
        <Skeleton className="h-3 w-28 rounded-full" />
      </View>
    );
  const { distinct, truncated } = todayProblemsOn(snapshot.recent, today, timeZone);
  const count = `${distinct}${truncated ? "+" : ""}`;
  return (
    <Press
      activeScale={0.96}
      accessibilityRole="link"
      accessibilityLabel={t("home.open", { count })}
      onPress={() => push("/leetcode")}
      className={PILL}
    >
      <Icon icon={Code2} size={14} tone="foreground-secondary" strokeWidth={2} />
      <Text className={cn("font-numeric text-sm font-bold leading-4 tabular-nums")}>{count}</Text>
      <Text className="text-[11px] font-bold uppercase leading-4 tracking-[0.1em] text-foreground-secondary">{t("home.solved")}</Text>
    </Press>
  );
}
