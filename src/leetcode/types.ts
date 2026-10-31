// LeetCode's public profile data as Pulse keeps it. LeetCode is a second, independent source: nothing here feeds a
// health score. `calendar` is LeetCode's own submission bucket (one count per UTC day): it counts every submission,
// accepted or not, because that is all the public API exposes; every problem count and the recent list dedupe by
// slug (src/leetcode/view.ts).

/** What a LeetCode request can fail with. Copy lives in src/leetcode/copy.ts and `leetcode:error.*`. */
export type LeetCodeErrorCode =
  | "invalid_username"
  | "not_found"
  | "private"
  | "rate_limited"
  | "blocked"
  | "server_error"
  | "timeout"
  | "offline"
  | "malformed"
  | "storage";

export type LeetCodeProfile = {
  /** The canonical spelling LeetCode returns (`destx0`), not what was typed. */
  username: string;
  name: string | null;
  avatarUrl: string | null;
  /** The profile's global ranking; null when LeetCode does not publish one. */
  ranking: number | null;
};

export type LeetCodeSolved = {
  total: number;
  easy: number;
  medium: number;
  hard: number;
};

/** One accepted submission as LeetCode lists it. The same problem can appear more than once. */
export type LeetCodeRecent = {
  id: string;
  title: string;
  slug: string;
  /** Unix seconds. */
  timestamp: number;
};

/**
 * One fetched profile, stored per username. `fetchedAt` is the successful fetch's unix seconds; screens derive
 * "today", the recent problems and the 12-month view from it in the profile's own time zone.
 */
export type LeetCodeSnapshot = {
  username: string;
  fetchedAt: number;
  profile: Omit<LeetCodeProfile, "username">;
  solved: LeetCodeSolved;
  streak: number;
  activeDays: number;
  /** LeetCode's unix-second day bucket → submissions that day (accepted or not). Not distinct problems. */
  calendar: Record<string, number>;
  /** Newest first, as the API returned them; may repeat a problem (dedupe in the view). */
  recent: LeetCodeRecent[];
};

/** A day of the 12-month activity view: LeetCode submissions, not problems. */
export type LeetCodeActivityDay = { day: string; submissions: number };

export type LeetCodeView = {
  profile: LeetCodeProfile;
  solved: LeetCodeSolved;
  streak: number;
  activeDays: number;
  /** The last 365 local days, oldest first. Submissions, not problems. */
  activity: LeetCodeActivityDay[];
  /** Distinct problems, newest first, at most 12. */
  recent: LeetCodeRecent[];
  /** Today's distinct problems; `truncated` when LeetCode's 20-submission window may have cut today short. */
  today: { distinct: number; truncated: boolean };
};
