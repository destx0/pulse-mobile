// LeetCode `/leetcode`: a public profile's practice, not a health score. The screen renders from the stored snapshot
// (no network call to draw), shows LeetCode's accepted-submission activity as submissions (never problems solved),
// and keeps the last good data when a refresh fails.
import { useMemo, useRef, useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, Code2, RefreshCw, TriangleAlert } from "lucide-react-native";
import { ago, DAY, formatDay, formatValue } from "@/lib/format";
import { addDays, daysBetween, localDay } from "@/lib/time";
import { leetcodeErrorCopy } from "@/leetcode/copy";
import { leetcodeView } from "@/leetcode/view";
import type { LeetCodeView } from "@/leetcode/types";
import { disconnectLeetCode, refreshLeetCode, useLeetCode } from "@/state/leetcode";
import { alpha } from "@/ui/color";
import { Button } from "@/ui/Button";
import { Card, CardFill, SECONDARY_ROW } from "@/ui/Card";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { CAPTION, LABEL } from "@/ui/metrics/primitives";
import { push } from "@/ui/navigate";
import { Press } from "@/ui/Press";
import { DetailShell } from "@/ui/shells/DetailShell";
import { EmptyState } from "@/ui/shells/EmptyState";
import { SectionShell } from "@/ui/shells/SectionShell";
import { useShellCalendar } from "@/ui/shells/ShellStatus";
import { Skeleton, SkeletonText } from "@/ui/Skeleton";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { toast } from "@/ui/Toast";
import { ConfirmDialog } from "../settings/controls";

const BODY = "text-[15px] leading-[22px] text-foreground-secondary";

/** One value under a card: the reference app's small caps label over a numeral. */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View className={cn(SECONDARY_ROW, "min-w-0 flex-1 p-3")}>
      <Text className={cn(LABEL, "text-muted-foreground")}>{label}</Text>
      <Text className="mt-1 font-numeric text-xl font-bold leading-6 tabular-nums">{value}</Text>
    </View>
  );
}

function ProfileCard({ view }: { view: LeetCodeView }) {
  const { t } = useTranslation("leetcode");
  const ranking = view.profile.ranking;
  return (
    <Card className="p-4">
      <CardFill />
      <View className="flex-row items-center gap-3">
        <View accessibilityElementsHidden className="size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-faint">
          {view.profile.avatarUrl ? <Image source={{ uri: view.profile.avatarUrl }} accessibilityIgnoresInvertColors style={{ width: "100%", height: "100%" }} /> : <Icon icon={Code2} size={28} tone="foreground-secondary" strokeWidth={1.5} />}
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-xl font-semibold leading-7">
            {view.profile.username}
          </Text>
          <Text numberOfLines={1} className={CAPTION}>
            {view.profile.name || t("screen.profileNoName")}
          </Text>
        </View>
        {ranking !== null && (
          <View className="items-end">
            <Text className={cn(LABEL, "text-muted-foreground")}>{t("screen.rank")}</Text>
            <Text className="font-numeric text-lg font-bold leading-6 tabular-nums">{formatValue("grouped", ranking)}</Text>
          </View>
        )}
      </View>
      <View className="mt-4 flex-row gap-2">
        <MiniStat label={t("screen.streak")} value={formatValue("int", view.streak)} />
        <MiniStat label={t("screen.activeDays")} value={formatValue("int", view.activeDays)} />
        <MiniStat label={t("screen.today")} value={`${view.today.distinct}${view.today.truncated ? "+" : ""}`} />
      </View>
    </Card>
  );
}

function SolvedCard({ view }: { view: LeetCodeView }) {
  const { t } = useTranslation("leetcode");
  const { c } = useTheme();
  const total = view.solved.total;
  const rows = [
    { key: "easy", label: t("screen.easy"), value: view.solved.easy, tone: 0.55 },
    { key: "medium", label: t("screen.medium"), value: view.solved.medium, tone: 0.78 },
    { key: "hard", label: t("screen.hard"), value: view.solved.hard, tone: 1 },
  ];
  return (
    <SectionShell variant="card" title={t("screen.solved")} aside={t("screen.solvedAside", { count: formatValue("int", total) })}>
      <View className="gap-3">
        {rows.map((r) => (
          <View key={r.key}>
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-[15px] leading-[22px]">{r.label}</Text>
              <Text className="font-numeric text-[15px] font-bold leading-[22px] tabular-nums">{formatValue("int", r.value)}</Text>
            </View>
            <View className="mt-1.5 h-1.5 overflow-hidden rounded-xs bg-muted">
              <View className="h-full rounded-xs" style={{ width: `${total > 0 ? Math.min(100, (r.value / total) * 100) : 0}%`, backgroundColor: alpha(c.optimal, r.tone) }} />
            </View>
          </View>
        ))}
      </View>
    </SectionShell>
  );
}

/** The contribution grid's cell and gap: a week is one 9 px column, two pixels apart. */
const CELL = 9;
const GAP = 2;
const COLUMN = CELL + GAP;
const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

/**
 * The 12-month view as a contribution grid: weeks are columns, weekdays are rows, so a month no longer scatters
 * its days along a row of different lengths. The grid scrolls sideways and opens on the latest weeks; the card's
 * total is the year's submission count. LeetCode's calendar counts submissions, not problems.
 */
function ActivityCard({ view }: { view: LeetCodeView }) {
  const { t } = useTranslation("leetcode");
  const { c } = useTheme();
  const scroller = useRef<ScrollView>(null);
  const opened = useRef(false);
  const { weeks, labels, total, max } = useMemo(() => {
    const first = view.activity[0].day;
    const last = view.activity[view.activity.length - 1].day;
    const gridStart = addDays(first, -new Date(`${first}T00:00:00Z`).getUTCDay());
    const weekCount = Math.ceil((daysBetween(gridStart, last) + 1) / 7);
    const columns: ({ day: string; submissions: number } | null)[][] = Array.from({ length: weekCount }, () => Array.from({ length: 7 }, () => null));
    for (const d of view.activity) {
      const index = daysBetween(gridStart, d.day);
      columns[Math.floor(index / 7)][index % 7] = d;
    }
    // A label every six weeks or so: enough months to read the year without overlapping.
    const marks: { week: number; label: string }[] = [];
    let lastWeek = -10;
    for (const d of view.activity) {
      if (!d.day.endsWith("-01")) continue;
      const week = Math.floor(daysBetween(gridStart, d.day) / 7);
      if (week - lastWeek < 6) continue;
      marks.push({ week, label: formatDay(d.day, { month: "short" }) });
      lastWeek = week;
    }
    if (marks.length === 0 || marks[0].week > 0) marks.unshift({ week: 0, label: formatDay(first, { month: "short" }) });
    return { weeks: columns, labels: marks, total: view.activity.reduce((a, d) => a + d.submissions, 0), max: Math.max(1, ...view.activity.map((d) => d.submissions)) };
  }, [view]);
  // Four steps over the year's busiest day; a submission on a quiet day is still visibly green.
  const level = (n: number) => (n >= max * 0.75 ? 1 : n >= max * 0.5 ? 0.75 : n >= max * 0.25 ? 0.55 : 0.35);
  return (
    <SectionShell variant="card" title={t("screen.activity")} aside={t("screen.activityAside")}>
      <View className="flex-row items-baseline gap-2">
        <Text className="font-numeric text-2xl font-bold leading-7 tabular-nums">{formatValue("grouped", total)}</Text>
        <Text className={cn(CAPTION, "min-w-0 flex-1")}>{t("screen.activityTotal")}</Text>
      </View>
      <View className="mt-4 flex-row gap-2">
        <View style={{ width: 28, paddingTop: 16 }} accessibilityElementsHidden>
          {WEEKDAYS.map((day, i) => (
            <View key={i} className="justify-center" style={{ height: CELL, marginBottom: i < 6 ? GAP : 0 }}>
              <Text className="text-[9px] font-bold uppercase leading-none tracking-[0.04em] text-muted-foreground">{day}</Text>
            </View>
          ))}
        </View>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          className="min-w-0 flex-1"
          onContentSizeChange={() => {
            if (opened.current) return;
            opened.current = true;
            scroller.current?.scrollToEnd({ animated: false });
          }}
          accessibilityLabel={t("screen.activityTotalLabel", { count: total })}
        >
          <View style={{ width: weeks.length * COLUMN }}>
            <View className="relative h-4">
              {labels.map((m) => (
                <Text
                  key={`${m.week}-${m.label}`}
                  accessible={false}
                  className="absolute text-[10px] font-bold uppercase leading-3 tracking-[0.06em] text-muted-foreground"
                  style={{ left: m.week * COLUMN }}
                >
                  {m.label}
                </Text>
              ))}
            </View>
            <View accessibilityElementsHidden className="flex-row" style={{ gap: GAP }}>
              {weeks.map((week, i) => (
                <View key={i} style={{ gap: GAP }}>
                  {week.map((d, weekday) => (
                    <View
                      key={weekday}
                      className="rounded-[1px]"
                      style={{
                        width: CELL,
                        height: CELL,
                        backgroundColor: d ? (d.submissions > 0 ? alpha(c.optimal, level(d.submissions)) : alpha(c.foreground, 0.09)) : "transparent",
                      }}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
      <View className="mt-3 flex-row items-center justify-between gap-2">
        <Text className={cn(CAPTION, "shrink")}>{t("screen.activitySwipe")}</Text>
        <View className="shrink-0 flex-row items-center gap-1">
          <Text className={CAPTION}>{t("screen.activityLess")}</Text>
          {[0, 0.35, 0.55, 0.75, 1].map((v) => (
            <View key={v} className="size-2 rounded-[1px]" style={{ backgroundColor: v === 0 ? alpha(c.foreground, 0.09) : alpha(c.optimal, v) }} />
          ))}
          <Text className={CAPTION}>{t("screen.activityMore")}</Text>
        </View>
      </View>
      <Text className={cn(CAPTION, "mt-3")}>{t("screen.activityNote")}</Text>
    </SectionShell>
  );
}

function RecentCard({ view, timeZone }: { view: LeetCodeView; timeZone: string }) {
  const { t } = useTranslation("leetcode");
  return (
    <SectionShell variant="card" title={t("screen.recent")} aside={view.recent.length ? t("screen.recentAside", { count: view.recent.length }) : undefined}>
      {view.recent.length === 0 ? (
        <EmptyState body={t("screen.recentEmpty")} />
      ) : (
        <View>
          {view.recent.map((r, i) => (
            <View key={r.slug} className={cn("flex-row items-center gap-3 py-2.5", i > 0 && "border-t border-border")}>
              <Icon icon={Check} size={16} tone="optimal-text" strokeWidth={2.5} />
              <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] leading-[22px]">
                {r.title}
              </Text>
              <Text className={cn(CAPTION, "shrink-0 tabular-nums")}>{formatDay(localDay(r.timestamp, timeZone), DAY.monthDay)}</Text>
            </View>
          ))}
        </View>
      )}
    </SectionShell>
  );
}

function Loading({ title }: { title: string }) {
  return (
    <DetailShell
      title={title}
      loading
      primary={
        <View className="gap-8">
          <Card className="gap-3 p-4">
            <CardFill />
            <View className="flex-row items-center gap-3">
              <Skeleton className="size-14 rounded-full" />
              <View className="flex-1 gap-2">
                <SkeletonText fs={18} lh={24} className="w-32" />
                <SkeletonText className="w-24" />
              </View>
            </View>
            <View className="flex-row gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 flex-1 rounded-lg" />
              ))}
            </View>
          </Card>
          {[0, 1].map((i) => (
            <Card key={i} className="gap-3 p-4">
              <CardFill />
              <SkeletonText className="w-24" />
              <Skeleton className="h-24 rounded-lg" />
            </Card>
          ))}
        </View>
      }
    />
  );
}

export function LeetCodeScreen() {
  const { t } = useTranslation("leetcode");
  const { c } = useTheme();
  const { timeZone } = useShellCalendar();
  const state = useLeetCode();
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const zone = timeZone ?? "UTC";
  const loading = !state.ready || (!!state.username && !state.snapshot && !state.error);

  if (loading) return <Loading title={t("title")} />;

  if (!state.username) {
    return (
      <DetailShell
        title={t("title")}
        backHref="/more"
        primary={
          <SectionShell variant="card" title={t("title")}>
            <EmptyState icon={Code2} body={t("screen.notConnectedBody")} action={{ label: t("screen.connectCta"), href: "/settings?s=leetcode" }} />
          </SectionShell>
        }
      />
    );
  }

  if (!state.snapshot) {
    return (
      <DetailShell
        title={t("title")}
        backHref="/more"
        primary={
          <SectionShell variant="card" title={t("title")}>
            <View className="items-center gap-3 py-6">
              <Icon icon={TriangleAlert} size={24} tone="warning-text" strokeWidth={2} />
              <Text accessibilityRole="alert" className={cn(BODY, "text-center")}>
                {t("screen.syncFailedNoData", { error: state.error ? leetcodeErrorCopy(state.error) : leetcodeErrorCopy("malformed") })}
              </Text>
              <Button variant="secondary" onPress={() => void refreshLeetCode(true)}>
                {t("screen.refresh")}
              </Button>
            </View>
          </SectionShell>
        }
      />
    );
  }

  const view = leetcodeView(state.snapshot, zone, now);
  const last = state.snapshot.fetchedAt * 1000;
  const refresh = async () => {
    setBusy(true);
    const result = await refreshLeetCode(true);
    setBusy(false);
    if (result && !result.ok) toast.error(t("screen.refreshFailedToast", { error: leetcodeErrorCopy(result.error) }));
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectLeetCode();
      setConfirm(false);
      toast.success(t("settings.disconnected"));
    } catch {
      toast.error(t("settings.disconnectFailed"));
    }
    setBusy(false);
  };

  return (
    <>
      <DetailShell
        title={t("title")}
        backHref="/more"
        onRefresh={() => refreshLeetCode(true)}
        primary={
          <View className="gap-8">
            {!!state.error && (
              <Card className="flex-row gap-3 p-4" ring={c["warning-ring"]}>
                <CardFill />
                <Icon icon={TriangleAlert} size={18} tone="warning-text" strokeWidth={2} />
                <Text className="min-w-0 flex-1 text-[15px] leading-[22px] text-warning-text">
                  {t("screen.refreshFailed", { ago: ago(last, Math.max(now * 1000, last)) })}
                </Text>
              </Card>
            )}
            <ProfileCard view={view} />
            <SolvedCard view={view} />
            <ActivityCard view={view} />
            <RecentCard view={view} timeZone={zone} />
            <View className="gap-2">
              <Text className={CAPTION}>{t("screen.lastSync", { ago: ago(last, Math.max(now * 1000, last)) })}</Text>
              <View className="flex-row gap-2">
                <Button className="flex-1" disabled={busy} onPress={() => void refresh()}>
                  <Icon icon={RefreshCw} size={16} tone="primary-foreground" strokeWidth={2} />
                  <Text className="text-[13px] font-bold uppercase tracking-[0.1em] text-primary-foreground">{busy ? t("screen.refreshing") : t("screen.refresh")}</Text>
                </Button>
                <Button variant="outline" className="flex-1" textClassName="text-recovery-red-text" disabled={busy} onPress={() => setConfirm(true)}>
                  {t("screen.disconnect")}
                </Button>
              </View>
              <Press
                activeOpacity={0.7}
                accessibilityRole="link"
                onPress={() => push("/settings?s=leetcode")}
                className="min-h-11 items-center justify-center"
              >
                <Text className="text-xs font-bold uppercase leading-4 tracking-[0.1em] text-foreground-secondary">{t("screen.openSettings")}</Text>
              </Press>
            </View>
          </View>
        }
      />
      <ConfirmDialog
        open={confirm}
        title={t("settings.disconnectTitle")}
        description={t("settings.disconnectBody")}
        confirmLabel={t("screen.disconnect")}
        pendingLabel={t("screen.disconnect")}
        pending={busy}
        onCancel={() => !busy && setConfirm(false)}
        onConfirm={() => void disconnect()}
      />
    </>
  );
}
