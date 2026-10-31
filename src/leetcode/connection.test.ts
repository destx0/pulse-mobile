// A failed refresh keeps the last good snapshot and says so; Home turns that error into "Sync failed".
import { describe, expect, it } from "vitest";
import type { LeetCodeSnapshot } from "./types";
import { connectFailedState, connectedState, loadedState, syncFailed, syncStarted, syncSucceeded } from "./connection";

const snap = (fetchedAt = 100): LeetCodeSnapshot => ({
  username: "destx0",
  fetchedAt,
  profile: { name: null, avatarUrl: null, ranking: null },
  solved: { total: 1, easy: 1, medium: 0, hard: 0 },
  streak: 1,
  activeDays: 1,
  calendar: {},
  recent: [],
});

describe("LeetCode connection state", () => {
  it("keeps the last good snapshot when a refresh fails", () => {
    const loaded = loadedState("destx0", snap(100));
    const started = syncStarted(loaded);
    expect(started.status).toBe("syncing");
    expect(started.snapshot).toBe(loaded.snapshot);

    const failed = syncFailed(started, "rate_limited", 200);
    expect(failed.snapshot).toBe(loaded.snapshot);
    expect(failed.snapshot?.fetchedAt).toBe(100);
    expect(failed.error).toBe("rate_limited");
    expect(failed.status).toBe("ready");
    expect(failed.lastAttemptAt).toBe(200);
  });

  it("clears the error only on a successful refresh, in place", () => {
    const failed = syncFailed(loadedState("destx0", snap(100)), "offline", 200);
    const fresh = snap(300);
    const ok = syncSucceeded(failed, fresh, 300);
    expect(ok.error).toBeNull();
    expect(ok.snapshot).toBe(fresh);
    expect(ok.status).toBe("ready");
  });

  it("does not replace a working connection when a new username fails to connect", () => {
    const good = connectedState(loadedState(null, null), snap(100), 100);
    const failed = connectFailedState(syncStarted(good));
    expect(failed.username).toBe("destx0");
    expect(failed.snapshot).toBe(good.snapshot);
    expect(failed.status).toBe("ready");
  });
});
