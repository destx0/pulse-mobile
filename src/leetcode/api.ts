// LeetCode's public GraphQL endpoint. Public profile data only: no password, cookie, token or website scrape.
// `fetchLeetCode` never logs a response body and turns every failure into a LeetCodeErrorCode, so a 429, a block,
// a timeout or a shape change leaves the last good snapshot in place (src/state/leetcode.ts).
import type { LeetCodeErrorCode, LeetCodeRecent, LeetCodeSnapshot } from "./types";

export const LEETCODE_ENDPOINT = "https://leetcode.com/graphql";
/** LeetCode caps `recentAcSubmissionList` at 20 however large a limit is asked for. */
export const RECENT_LIMIT = 20;
const TIMEOUT_MS = 12_000;
/** A LeetCode username: letters, digits, underscore or hyphen. */
const USERNAME = /^[A-Za-z0-9_-]{1,30}$/;

/** The minimal response surface the parser uses; tests give it a plain object. */
export type LeetCodeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
export type LeetCodeFetcher = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal; credentials: "omit" },
) => Promise<LeetCodeResponse>;

export type LeetCodeFetchResult = { ok: true; snapshot: LeetCodeSnapshot } | { ok: false; error: LeetCodeErrorCode };

/** Trimmed input; null when it cannot be a LeetCode username. A pasted profile URL is not accepted silently. */
export function normalizeUsername(raw: string): string | null {
  const name = raw.trim().replace(/^@/, "");
  return USERNAME.test(name) ? name : null;
}

const QUERY = `query PulseLeetCode($username: String!) {
  matchedUser(username: $username) {
    username
    profile { realName userAvatar ranking }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    userCalendar { streak totalActiveDays submissionCalendar }
  }
  recentAcSubmissionList(username: $username, limit: ${RECENT_LIMIT}) { id title titleSlug timestamp }
}`;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const number = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const integer = (v: unknown): number | null => {
  const n = number(v);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
};
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A count-slot from acSubmissionNum; the API sends `count` as a number. */
function countOf(rows: unknown[], difficulty: string): number | null {
  const row = rows.find((r) => isRecord(r) && r.difficulty === difficulty);
  return isRecord(row) ? integer(row.count) : null;
}

class Timeout extends Error {}
const isAbort = (e: unknown) => e instanceof Timeout || (e instanceof Error && e.name === "AbortError");

/**
 * Fetches one public profile. `now` (unix seconds) is injectable for tests.
 * On failure nothing is written; the caller keeps the last good snapshot.
 */
export async function fetchLeetCode(
  username: string,
  opts: { fetch?: LeetCodeFetcher; now?: number; timeoutMs?: number; endpoint?: string } = {},
): Promise<LeetCodeFetchResult> {
  const name = normalizeUsername(username);
  if (!name) return { ok: false, error: "invalid_username" };
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const doFetch = opts.fetch ?? (fetch as unknown as LeetCodeFetcher);
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response: LeetCodeResponse;
  try {
    response = await Promise.race([
      doFetch(opts.endpoint ?? LEETCODE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { username: name } }),
        signal: ctl.signal,
        credentials: "omit",
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctl.abort();
          reject(new Timeout());
        }, opts.timeoutMs ?? TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    return { ok: false, error: isAbort(e) ? "timeout" : "offline" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  if (response.status === 429) return { ok: false, error: "rate_limited" };
  if (response.status === 403) return { ok: false, error: "blocked" };
  if (!response.ok || response.status >= 500) return { ok: false, error: "server_error" };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "malformed" };
  }
  return parseBody(body, now);
}

/** Parses the GraphQL body. Exported for tests; never sees a raw body outside this module. */
export function parseBody(body: unknown, now: number): LeetCodeFetchResult {
  if (!isRecord(body) || !isRecord(body.data)) return { ok: false, error: "malformed" };
  const data = body.data;
  const matched = data.matchedUser;
  // LeetCode answers an unknown username with `matchedUser: null` and an error; a null without one has no stats to show.
  if (matched === null) return { ok: false, error: Array.isArray(body.errors) && body.errors.length > 0 ? "not_found" : "private" };
  if (!isRecord(matched)) return { ok: false, error: "malformed" };

  const username = text(matched.username);
  const stats = matched.submitStatsGlobal;
  const calendar = matched.userCalendar;
  // A profile with no stats is private (or has none to show); never fill the screen with invented zeros.
  if (!username || !isRecord(stats) || !Array.isArray(stats.acSubmissionNum) || !isRecord(calendar)) return { ok: false, error: "private" };
  const rows = stats.acSubmissionNum;
  if (rows.length === 0) return { ok: false, error: "private" };
  const easy = countOf(rows, "Easy");
  const medium = countOf(rows, "Medium");
  const hard = countOf(rows, "Hard");
  if (easy === null || medium === null || hard === null) return { ok: false, error: "malformed" };
  const total = countOf(rows, "All") ?? easy + medium + hard;

  const streak = integer(calendar.streak);
  const activeDays = integer(calendar.totalActiveDays);
  if (streak === null || activeDays === null) return { ok: false, error: "malformed" };

  const parsedCalendar = parseCalendar(calendar.submissionCalendar);
  if (!parsedCalendar) return { ok: false, error: "malformed" };

  const recent = parseRecent(data.recentAcSubmissionList);
  if (!recent) return { ok: false, error: "malformed" };

  const profile = isRecord(matched.profile) ? matched.profile : {};
  return {
    ok: true,
    snapshot: {
      username,
      fetchedAt: now,
      profile: {
        name: text(profile.realName),
        avatarUrl: text(profile.userAvatar),
        ranking: integer(profile.ranking),
      },
      solved: { total, easy, medium, hard },
      streak,
      activeDays,
      calendar: parsedCalendar,
      recent,
    },
  };
}

/** `submissionCalendar` is a JSON string of unix seconds → submissions (accepted or not). Null when it is not that. */
function parseCalendar(raw: unknown): Record<string, number> | null {
  if (raw === null || raw === undefined || raw === "") return {};
  if (typeof raw !== "string") return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(json)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(json)) {
    const ts = Number(key);
    const n = integer(value);
    if (!Number.isFinite(ts) || ts <= 0 || n === null) return null;
    out[key] = n;
  }
  return out;
}

/** Recent accepted submissions, newest first. Missing means none; a malformed row fails the whole response. */
function parseRecent(raw: unknown): LeetCodeRecent[] | null {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: LeetCodeRecent[] = [];
  for (const row of raw) {
    if (!isRecord(row)) return null;
    const id = typeof row.id === "string" ? row.id : typeof row.id === "number" ? String(row.id) : null;
    const title = text(row.title);
    const slug = text(row.titleSlug);
    const timestamp = typeof row.timestamp === "string" ? Number(row.timestamp) : number(row.timestamp);
    if (!id || !title || !slug || timestamp === null || timestamp <= 0) return null;
    out.push({ id, title, slug, timestamp: Math.floor(timestamp) });
  }
  return out.sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** Recent accepted submissions, newest first. Missing means none; a malformed row fails the whole response. */