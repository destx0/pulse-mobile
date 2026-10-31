// The LeetCode connection, kept outside the health app state: a second source that never feeds a score. It is a
// module-level store read with useSyncExternalStore, like src/state/app.ts, so Home and Settings see a refresh
// without a provider. The saved username lives in AsyncStorage (a device preference, not health data); snapshots live
// in the Store per username. Boot loads the snapshot first, then refreshes in the background with a throttle.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import type { Store } from "@/data/store";
import { fetchLeetCode, normalizeUsername, type LeetCodeFetchResult } from "@/leetcode/api";
import {
  connectFailedState,
  connectedState,
  disconnectedState,
  emptyLeetCodeState,
  loadedState,
  syncFailed,
  syncStarted,
  syncSucceeded,
  type LeetCodeState,
} from "@/leetcode/connection";
import type { LeetCodeErrorCode } from "@/leetcode/types";

const USERNAME_KEY = "pulse.leetcode.username";
/** A connected profile refreshes on app open, at most this often unless the person taps Sync now. */
const REFRESH_MS = 10 * 60_000;

let state: LeetCodeState = emptyLeetCodeState();
let store: Store | null = null;
let booted = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function patch(next: LeetCodeState) {
  state = next;
  emit();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useLeetCode(): LeetCodeState;
export function useLeetCode<T>(select: (s: LeetCodeState) => T): T;
export function useLeetCode<T>(select?: (s: LeetCodeState) => T) {
  return useSyncExternalStore(subscribe, () => (select ? select(state) : state));
}
export const leetcodeState = () => state;

const readUsername = async (): Promise<string | null> => {
  const raw = (await AsyncStorage.getItem(USERNAME_KEY).catch(() => null))?.trim();
  return raw ? normalizeUsername(raw) : null;
};
const writeUsername = (username: string | null) =>
  username ? AsyncStorage.setItem(USERNAME_KEY, username).catch(() => {}) : AsyncStorage.removeItem(USERNAME_KEY).catch(() => {});

const snapshotAt = (s: LeetCodeState) => (s.snapshot ? s.snapshot.fetchedAt * 1000 : 0);
const throttled = (s: LeetCodeState, now: number) => {
  const last = Math.max(snapshotAt(s), s.lastAttemptAt ?? 0);
  return last > 0 && now - last < REFRESH_MS;
};

/**
 * Called once from boot after the Store opens. Reads the saved username and its snapshot, then refreshes in the
 * background when the snapshot is old (or there is none). Never throws: a failure is a state, not a broken launch.
 */
export async function initLeetCode(st: Store): Promise<void> {
  store = st;
  if (booted) return;
  booted = true;
  try {
    const username = await readUsername();
    if (!username) {
      patch({ ...emptyLeetCodeState(), ready: true });
      return;
    }
    const snapshot = await st.getLeetCode(username);
    patch(loadedState(username, snapshot));
    if (!snapshot || !throttled(state, Date.now())) void refreshLeetCode(false);
  } catch {
    patch({ ...emptyLeetCodeState(), ready: true });
  }
}

/**
 * Fetches the connected profile and replaces the stored snapshot. `force` skips the 10-minute throttle (Sync now,
 * pull to refresh). A failure keeps the last good snapshot and records the error; it never writes a zero.
 */
export async function refreshLeetCode(force = false): Promise<LeetCodeFetchResult | null> {
  const current = state;
  if (!store || !current.username || current.status === "syncing") return null;
  if (!force && throttled(current, Date.now())) return null;
  const username = current.username;
  patch(syncStarted(current));
  const result = await fetchLeetCode(username);
  // A disconnect or a username change while the request was in flight wins.
  if (state.username !== username) return result;
  if (result.ok) {
    await store.putLeetCode(result.snapshot).catch(() => {});
    patch(syncSucceeded(state, result.snapshot, Date.now()));
  } else {
    patch(syncFailed(state, result.error, Date.now()));
  }
  return result;
}

/**
 * Validates the username against LeetCode before saving it: a typo never becomes a saved source. On success the
 * snapshot is stored under LeetCode's canonical spelling. Changing the username removes the previous user's stored
 * snapshot, so a phone holds only the connected profile.
 */
export async function connectLeetCode(raw: string): Promise<LeetCodeFetchResult> {
  const username = normalizeUsername(raw);
  if (!username) return { ok: false, error: "invalid_username" };
  if (!store) return { ok: false, error: "offline" };
  const previous = state;
  patch(syncStarted(previous));
  const result = await fetchLeetCode(username);
  if (!result.ok) {
    patch(connectFailedState(previous));
    return result;
  }
  const old = previous.username;
  try {
    await store.putLeetCode(result.snapshot);
  } catch {
    patch(connectFailedState(previous));
    return { ok: false, error: "storage" };
  }
  if (old && old !== result.snapshot.username) await store.deleteLeetCode(old).catch(() => {});
  await writeUsername(result.snapshot.username);
  patch(connectedState(previous, result.snapshot, Date.now()));
  return result;
}

/** Removes the connected user's stored snapshot and the saved username. Throws if the snapshot cannot be deleted. */
export async function disconnectLeetCode(): Promise<void> {
  const username = state.username;
  if (store && username) await store.deleteLeetCode(username);
  await writeUsername(null);
  patch(disconnectedState());
}

/** Delete everything: every stored LeetCode snapshot, not just the connected one. */
export async function resetLeetCode(): Promise<void> {
  if (store) await store.clearLeetCode().catch(() => {});
  await writeUsername(null);
  patch(disconnectedState());
}

/** Coming back to the foreground refreshes a connected profile, throttled (src/state/app.ts watchForeground). */
export function leetcodeForeground(): void {
  void refreshLeetCode(false);
}

export type { LeetCodeErrorCode };
