// The screen results kept in memory (src/screens/useScreen.ts), in their own module so a source switch can drop them
// without importing the hook and the app state it reads. One entry per screen key; `version` is the data version it was
// read at, `at` when it was read, `lng` the language its text was written in.
export type Entry = { data: unknown; version: number; at: number; lng: string };

export const cache = new Map<string, Entry>();
export const loading = new Map<string, { p: Promise<void>; version: number }>();
export const cacheListeners = new Set<() => void>();
// ponytail: a plain size cap, oldest first; a byte budget if results ever grow large.
export const MAX_ENTRIES = 100;

export const subscribeCache = (l: () => void) => {
  cacheListeners.add(l);
  return () => cacheListeners.delete(l);
};

/** Drops every result and load in flight: the sample database and the person's own must never show each other's data. */
export function clearScreenCache(): void {
  cache.clear();
  loading.clear();
  for (const l of cacheListeners) l();
}
