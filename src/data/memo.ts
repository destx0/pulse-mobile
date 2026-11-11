// A read-through memo over a Store for the screens' queries. halo's loadDays reads every metric and logged entry on
// each call, and one screen calls it several times (its own range, the trend views, the extras), so the same whole-table
// reads would run again and again. Within one data version (src/state/app.ts dataChanged) each of these reads runs
// once; the next version starts empty. Writes pass straight through: a query that writes (the default journal tags)
// uses methods that are not memoised.
//
// Scores get a second, day-keyed cache keyed by the *scores* version: a write that cannot change a score (a water log,
// a gym set, a journal answer) bumps the screen version but not the scores one, so the 12 KB-a-day score rows are parsed
// once per scoring run, not once per log. A range inside a range already read is served from the parsed days.
import type { ScoreRow, Store } from "./store";

/** The reads worth keeping: whole tables or day ranges, the same for every query of one version. */
const MEMO = new Set<keyof Store>([
  "allMetrics",
  "allSessions",
  "allExercises",
  "allJournal",
  "loggedEntries",
  "dailyValues",
  "getReports",
  "getSeries",
  "hrBounds",
  "wornDays",
  "habits",
  "habitEntries",
]);

type Interval = { from: string; to: string };

/**
 * `store` with the MEMO reads cached per `version`, and score rows cached per `scoresVersion` and day. Arrays come back
 * as shallow copies, so a caller's sort stays its own. `scoresVersion` defaults to `version` (one cache, the old way).
 */
export function memoStore(store: Store, version: () => number, scoresVersion: () => number = version): Store {
  let at = -1;
  const cache = new Map<string, Promise<unknown>>();

  // Score rows by day, for one scores version. `loaded` holds the day ranges the map fully covers, so a later read of
  // a range inside one of them never touches SQLite or JSON again.
  let scoresAt = -1;
  let days = new Map<string, ScoreRow>();
  let loaded: Interval[] = [];
  const scoreCache = new Map<string, Promise<ScoreRow[]>>();

  const resetScores = () => {
    scoresAt = scoresVersion();
    days = new Map();
    loaded = [];
    scoreCache.clear();
  };
  const covered = (range: Interval) => loaded.some((i) => range.from >= i.from && range.to <= i.to);
  const rowsIn = (range: Interval) =>
    [...days.values()].filter((d) => d.day >= range.from && d.day <= range.to).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  /** Adds `range` to the covered intervals, merging the ones it overlaps (and only those: a gap stays a gap). */
  const remember = (range: Interval) => {
    let { from, to } = range;
    const next: Interval[] = [];
    for (const i of loaded) {
      if (i.to < from || i.from > to) next.push(i);
      else {
        if (i.from < from) from = i.from;
        if (i.to > to) to = i.to;
      }
    }
    next.push({ from, to });
    loaded = next;
  };
  const scoresIn = (range: Interval): Promise<ScoreRow[]> => {
    if (scoresAt !== scoresVersion()) resetScores();
    if (covered(range)) return Promise.resolve(rowsIn(range));
    const key = JSON.stringify(range);
    let hit = scoreCache.get(key);
    if (!hit) {
      hit = store.scoresIn(range).then((rows) => {
        for (const r of rows) days.set(r.day, r);
        remember(range);
        return rowsIn(range);
      });
      hit.catch(() => scoreCache.delete(key));
      scoreCache.set(key, hit);
    }
    return hit.then((rows) => rows.slice());
  };

  return new Proxy(store, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== "function") return v;
      if (prop === "scoresIn") return scoresIn;
      if (!MEMO.has(prop as keyof Store)) return v.bind(target);
      return (...args: unknown[]) => {
        if (at !== version()) {
          at = version();
          cache.clear();
        }
        const key = `${String(prop)}:${JSON.stringify(args)}`;
        let hit = cache.get(key);
        if (!hit) {
          hit = (v as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          hit.catch(() => cache.delete(key));
          cache.set(key, hit);
        }
        return hit.then((r) => (Array.isArray(r) ? [...r] : r));
      };
    },
  });
}
