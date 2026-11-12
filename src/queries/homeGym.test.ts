// Home's gym card: the template last used inside the month is the suggestion, a session still running wins over it,
// and a template left unused for over a month is not guessed.
import { beforeEach, describe, expect, it } from "vitest";
import { openMemoryStore } from "@/data/memory";
import type { Store } from "@/data/store";
import type { QueryCtx } from "./ctx";
import { getHomeGym } from "./homeGym";

const NOW = Date.parse("2026-11-02T09:00:00Z") / 1000;
const DAY = 86_400;
const PROFILE = { birthDate: "1990-01-01", sex: "male" as const, maxHr: null, heightCm: null, timeZone: "UTC" };
let store: Store;
const ctx = (): QueryCtx => ({ store, profile: PROFILE, timeZone: "UTC", today: "2026-11-02", now: NOW, sync: { lastSyncTs: null, firstDay: null, lastError: null } });

async function routine(id: string, name: string, exercises: string[]) {
  await store.putGymRoutine({ id, name, notes: null, position: 0, updatedAt: NOW }, exercises.map((exerciseId, position) => ({ routineId: id, exerciseId, position, sets: 3, reps: 8, restSec: null, note: null })));
}

async function session(id: string, routineId: string | null, daysAgo: number, finished = true) {
  const startTs = NOW - daysAgo * DAY;
  await store.putGymSession({ id, day: new Date(startTs * 1000).toISOString().slice(0, 10), startTs, endTs: finished ? startTs + 3000 : null, name: id, notes: null, routineId, finished, restStartedTs: null, restSec: null });
}

beforeEach(async () => {
  store = openMemoryStore();
  await routine("push", "Push", ["bench-press-barbell", "bench-press-barbell", "lat-pulldown-cable"]);
  await routine("pull", "Pull", ["lat-pulldown-cable"]);
  await routine("legs", "Legs", ["squat-barbell"]);
});

describe("getHomeGym", () => {
  it("suggests the template of the most recent workout inside the last 30 days", async () => {
    await session("old-legs", "legs", 40);
    await session("push", "push", 12);
    await session("pull", "pull", 2);
    expect(await getHomeGym(ctx())).toEqual({
      active: null,
      doneToday: null,
      suggested: { routineId: "pull", name: "Pull", exercises: 1, lastTs: NOW - 2 * DAY },
    });
  });

  it("counts each exercise once in the suggestion", async () => {
    await session("push", "push", 1);
    expect((await getHomeGym(ctx())).suggested).toMatchObject({ routineId: "push", name: "Push", exercises: 2 });
  });

  it("has no suggestion when the last template use is over a month old", async () => {
    await session("legs", "legs", 31);
    expect(await getHomeGym(ctx())).toEqual({ active: null, doneToday: null, suggested: null });
  });

  it("skips a deleted template and names the newest one still there", async () => {
    await session("gone", "gone", 1);
    await session("push", "push", 5);
    expect((await getHomeGym(ctx())).suggested).toMatchObject({ routineId: "push", name: "Push" });
  });

  it("reports the workout still running", async () => {
    await session("now", "pull", 0, false);
    expect(await getHomeGym(ctx())).toEqual({ active: { sessionId: "now", name: "now" }, doneToday: null, suggested: null });
  });

  it("does not suggest the template again after a workout today", async () => {
    await session("today", "legs", 0);
    expect(await getHomeGym(ctx())).toEqual({ active: null, doneToday: { name: "today", endTs: NOW + 3000 }, suggested: null });
  });
});
