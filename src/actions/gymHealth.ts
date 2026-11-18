// A finished gym workout as a Health Connect exercise session, so Google Health (which reads Health Connect) shows it,
// and Pulse imports it back as an activity like the live recorder's. The gym log itself (gym.ts) stays plain Store
// writes; this is the one place a gym session reaches Health Connect.
import { deleteExercise, exerciseWriteAllowed, readAll, saveExercise } from "@/health/connect";
import { mapExercises, MIN_EXERCISE_SEC } from "@/health/import";
import type { GymSession } from "@/core/gym/types";
import { HC_EXERCISE } from "@/live/workout";
import { localDay } from "@/lib/time";
import { reportError } from "@/lib/telemetry";
import { appStore, isSyncing, refresh as syncNow, rescore } from "@/state/app";

/** The Health Connect client record id of a gym session: a retry replaces the record instead of adding another. */
export const gymClientId = (id: string) => `gym:${id}`;

const rangeOf = (s: GymSession) => ({ start: new Date((s.startTs - 60) * 1000), end: new Date(((s.endTs ?? s.startTs) + 60) * 1000) });

async function rescoreDay(day: string) {
  const app = appStore();
  await app.markIntradayDirty([day]);
  // A run already under way may have read the dirty days before this one: joined, it would leave the day unscored.
  const joined = isSyncing();
  await rescore();
  if (joined) await rescore();
}

/**
 * Writes a finished workout to Health Connect (asking for the write permission first: Finish is a tap on an open
 * screen) and stores the read-back as an activity. Returns false when it was not written: too short for the import,
 * no permission, or a failed save. The workout stays in the gym log either way.
 */
export async function exportGymSession(session: GymSession, timeZone: string): Promise<boolean> {
  if (!session.finished || session.endTs === null || session.endTs - session.startTs < MIN_EXERCISE_SEC) return false;
  try {
    if (!(await exerciseWriteAllowed(true))) return false;
    const hcId = await saveExercise({
      clientRecordId: gymClientId(session.id),
      start: session.startTs * 1000,
      end: session.endTs * 1000,
      exerciseType: HC_EXERCISE.strength,
      title: session.name,
    });
    if (!hcId) return false;
    const records = (await readAll("ExerciseSession", rangeOf(session))).filter((r) => r.metadata?.id === hcId);
    if (records.length) {
      await appStore().upsertExercises(mapExercises(records, [], [], timeZone));
      await rescoreDay(localDay(session.startTs, timeZone));
    }
    // The full sync follows for the band's heart rate over the session.
    void syncNow().catch(() => {});
    return true;
  } catch (error) {
    void reportError("gym.export_failed", error);
    return false;
  }
}

/** Takes a deleted workout's session back out of Health Connect and Pulse's activities. Best effort: never throws. */
export async function removeGymSession(session: GymSession, timeZone: string): Promise<void> {
  if (!session.finished || session.endTs === null) return;
  try {
    if (!(await exerciseWriteAllowed(false))) return;
    const ids = (await readAll("ExerciseSession", rangeOf(session)))
      .filter((r) => r.metadata?.clientRecordId === gymClientId(session.id))
      .map((r) => r.metadata?.id)
      .filter((id): id is string => !!id);
    if (!ids.length) return;
    for (const id of ids) await deleteExercise(id);
    await appStore().deleteExercises(ids);
    await rescoreDay(localDay(session.startTs, timeZone));
  } catch (error) {
    void reportError("gym.remove_failed", error);
  }
}
