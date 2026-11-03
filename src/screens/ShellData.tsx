// This provider sits outside the navigator, so its reads cannot use the screen-focus hook. The sync state comes from the
// app state (src/state/app.ts); the calendar's first day and the wear streak are read from the Store.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadCalendarMonth } from "@/actions/calendar";
import { firstDay } from "@/queries/common";
import { getWearStreak } from "@/queries/shell";
import { queryCtx, refresh, useApp, useScoresVersion } from "@/state/app";
import { ShellCalendarProvider, ShellSyncProvider, useShellCalendar, type ShellCalendar, type ShellSync } from "@/ui/shells/ShellStatus";

const loadMonth = (month: string) => loadCalendarMonth(queryCtx(), month);

/** A sync older than this shows as behind (the web's STALE_MS). */
const STALE_MS = 2 * 3600_000;

/** `now`: when the read ran (epoch ms), which staleness is measured from; a sync or any write reads again. */
type Read = { today: string; firstDay: string | null; timeZone: string; streak: ShellSync["streak"]; now: number };

export function ShellData({ children }: { children: ReactNode }) {
  const root = useShellCalendar();
  // The streak and the first day follow scores, not every water log or gym set; only a scoring run reads them again.
  const version = useScoresVersion();
  // The person's zone is known from the profile, so the calendar has it before the first database read finishes.
  const profileTimeZone = useApp((s) => s.profile?.timeZone);
  const status = useApp((s) => s.status);
  const lastSyncTs = useApp((s) => s.sync.lastSyncTs);
  const error = useApp((s) => s.error);
  const source = useApp((s) => s.source);
  // Only the first import's progress reaches the shells (Home's "Syncing · n of N days"); later runs re-render nothing per step.
  const progress = useApp((s) => (s.status === "syncing" && s.sync.lastSyncTs === null ? s.progress : null));
  // Without a profile (before onboarding) there is nothing to read: the device's today stands in.
  const [data, setData] = useState<Read>();
  useEffect(() => {
    let live = true;
    (async () => {
      const ctx = queryCtx();
      return { today: ctx.today, firstDay: await firstDay(ctx), timeZone: ctx.timeZone, streak: await getWearStreak(ctx), now: ctx.now * 1000 };
    })().then(
      (d) => live && setData((previous) => (JSON.stringify(previous) === JSON.stringify(d) ? previous : d)),
      () => live && setData(undefined),
    );
    return () => {
      live = false;
    };
  }, [version]);
  const syncing = status === "syncing";
  const firstImport = syncing && lastSyncTs === null && !!progress && progress.total > 0;
  const sync = useMemo<ShellSync | null>(() => {
    if (!data) return null;
    const lastSuccessAt = lastSyncTs !== null ? lastSyncTs * 1000 : null;
    const stale = lastSuccessAt === null || data.now - lastSuccessAt > STALE_MS;
    return {
      sync: { state: syncing ? "syncing" : error ? "error" : stale && source !== "demo" ? "stale" : "ok", lastSuccessAt },
      connection: firstImport ? "importing" : stale ? "stale" : "connected",
      ...(firstImport && progress && { importProgress: { done: progress.done, total: progress.total } }),
      streak: data.streak,
      timeZone: data.timeZone,
      sample: source === "demo",
      syncNow: refresh,
    };
  }, [data, syncing, error, lastSyncTs, source, firstImport, progress]);
  const value = useMemo<ShellCalendar>(
    () => ({ today: data?.today ?? root.today, firstDay: data?.firstDay, timeZone: data?.timeZone ?? profileTimeZone, loadMonth }),
    [data?.today, data?.firstDay, data?.timeZone, root.today, profileTimeZone],
  );
  return (
    <ShellCalendarProvider value={value}>
      <ShellSyncProvider value={sync}>{children}</ShellSyncProvider>
    </ShellCalendarProvider>
  );
}
