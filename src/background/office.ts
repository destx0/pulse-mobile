// The office geofence (Settings › Places, Pulse-only). One region around the office: Play Services holds the fence, so
// an arrival or a departure wakes Pulse even with no UI, and the app spends no battery polling. The task writes the
// event and, on arrival, ticks the habit chosen for the office (src/core/office).
//
// Android limits: a force-stopped app is not restarted for a geofence event, and Doze or a vendor task killer can drop
// one. A missing exit shows as a capped visit (src/core/office.ts MAX_VISIT_H), never as a fabricated departure.
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { isScheduled } from "@/core/habits/logic";
import { OFFICE_RADIUS_M, type Office, type OfficeEvent } from "@/core/office";
import type { Store } from "@/data/store";
import { newId } from "@/lib/ids";
import { localDay } from "@/lib/time";
import { backgroundStore } from "./runSync";

export const OFFICE_TASK = "pulse.office.geofence";

/** The fence Play Services holds: the office, enter and exit, at the one radius. */
const regionOf = (office: Office): Location.LocationRegion => ({
  identifier: "office",
  latitude: office.latitude,
  longitude: office.longitude,
  radius: OFFICE_RADIUS_M,
  notifyOnEnter: true,
  notifyOnExit: true,
});

/** On arrival, tick the office's habit for the local day. A day that already has an entry is left alone, so clearing
 * the tick by hand survives a second arrival. */
async function tickOnArrival(store: Store, office: Office, day: string, now: number): Promise<void> {
  if (!office.habitId) return;
  const habit = (await store.habits()).find((h) => h.id === office.habitId);
  if (!habit || habit.archived || habit.kind !== "yes_no" || !isScheduled(habit, day)) return;
  if ((await store.habitEntries(day, day)).some((e) => e.habitId === habit.id)) return;
  await store.putHabitEntry({ habitId: habit.id, day, value: 1, skip: false, note: null, updatedAt: now });
}

TaskManager.defineTask(OFFICE_TASK, async ({ data, error }) => {
  if (error) return;
  const { eventType } = data as { eventType: Location.GeofencingEventType };
  try {
    const store = await backgroundStore();
    const profile = await store.getProfile();
    const office = profile?.office;
    if (!profile || !office) return;
    const ts = Math.floor(Date.now() / 1000);
    const day = localDay(ts, profile.timeZone);
    const kind = eventType === Location.GeofencingEventType.Enter ? "enter" : "exit";
    const event: OfficeEvent = { id: newId(), kind, ts, day };
    await store.addOfficeEvent(event);
    if (kind === "enter") await tickOnArrival(store, office, day, ts);
  } catch (e) {
    console.warn("[office]", e instanceof Error ? e.message : String(e));
  }
});

/**
 * Makes the running fence match the saved office. Android refuses registration without the background permission, so
 * that case only clears a stale fence; the Settings row asks for the permission. Never throws.
 */
export async function syncOfficeGeofence(): Promise<void> {
  try {
    const store = await backgroundStore();
    const office = (await store.getProfile())?.office ?? null;
    const bg = await Location.getBackgroundPermissionsAsync();
    if (!bg.granted) return;
    if (!office) {
      if (await Location.hasStartedGeofencingAsync(OFFICE_TASK).catch(() => false)) await Location.stopGeofencingAsync(OFFICE_TASK);
      return;
    }
    await Location.startGeofencingAsync(OFFICE_TASK, [regionOf(office)]);
  } catch (e) {
    console.warn("[office] fence", e instanceof Error ? e.message : String(e));
  }
}
