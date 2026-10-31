// The LeetCode connection's state transitions, kept pure so the failed-refresh rule is testable without a phone:
// a failed refresh never drops the last good snapshot, and it always leaves the failure in `error`, which Home turns
// into "Sync failed" instead of a stale or zero count.
import type { LeetCodeErrorCode, LeetCodeSnapshot } from "./types";

export type LeetCodeStatus = "disconnected" | "loading" | "syncing" | "ready";

export type LeetCodeState = {
  /** The connected profile's canonical username, or null. */
  username: string | null;
  /** The last successful fetch, or null before the first. */
  snapshot: LeetCodeSnapshot | null;
  status: LeetCodeStatus;
  /** The last refresh's failure; cleared only by a successful fetch. */
  error: LeetCodeErrorCode | null;
  /** Epoch ms of the last refresh attempt (success or failure), for the throttle. */
  lastAttemptAt: number | null;
  /** True once boot has read the saved connection (so a card can tell "not connected" from "still loading"). */
  ready: boolean;
};

export const emptyLeetCodeState = (): LeetCodeState => ({
  username: null,
  snapshot: null,
  status: "disconnected",
  error: null,
  lastAttemptAt: null,
  ready: false,
});

/** Boot finished reading the saved connection. `loading` means connected but no stored snapshot yet. */
export function loadedState(username: string | null, snapshot: LeetCodeSnapshot | null): LeetCodeState {
  if (!username) return { ...emptyLeetCodeState(), ready: true };
  return { username, snapshot, status: snapshot ? "ready" : "loading", error: null, lastAttemptAt: null, ready: true };
}

export function syncStarted(s: LeetCodeState): LeetCodeState {
  return { ...s, status: s.snapshot ? "syncing" : "loading" };
}

/** A fetch succeeded: replace the snapshot and clear the last failure. */
export function syncSucceeded(s: LeetCodeState, snapshot: LeetCodeSnapshot, at: number): LeetCodeState {
  return { ...s, username: snapshot.username, snapshot, status: "ready", error: null, lastAttemptAt: at, ready: true };
}

/** A fetch failed: the last good snapshot stays, and `error` says why the refresh failed. */
export function syncFailed(s: LeetCodeState, error: LeetCodeErrorCode, at: number): LeetCodeState {
  return { ...s, status: "ready", error, lastAttemptAt: at, ready: true };
}

/** Connecting (or changing the username) succeeded. The canonical username is LeetCode's, not what was typed. */
export function connectedState(s: LeetCodeState, snapshot: LeetCodeSnapshot, at: number): LeetCodeState {
  return { ...s, username: snapshot.username, snapshot, status: "ready", error: null, lastAttemptAt: at, ready: true };
}

/**
 * Connecting failed: the previous connection is untouched (a typo never replaces a working source), and no global
 * refresh error is set because the attempt was in Settings, which shows its own message.
 */
export function connectFailedState(s: LeetCodeState): LeetCodeState {
  return { ...s, status: s.snapshot ? "ready" : s.username ? "loading" : "disconnected" };
}

export function disconnectedState(): LeetCodeState {
  return { ...emptyLeetCodeState(), ready: true };
}
