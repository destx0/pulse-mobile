// User-facing copy for LeetCode failures. The screen, Settings and Home share these, so a 429 never turns into a
// fabricated zero and a typo always reads as a missing profile rather than a crash.
import { i18n } from "@/i18n/config";
import type { LeetCodeErrorCode } from "./types";

const KEY = {
  invalid_username: "leetcode:error.invalidUsername",
  not_found: "leetcode:error.notFound",
  private: "leetcode:error.private",
  rate_limited: "leetcode:error.rateLimited",
  blocked: "leetcode:error.blocked",
  server_error: "leetcode:error.server",
  timeout: "leetcode:error.timeout",
  offline: "leetcode:error.offline",
  malformed: "leetcode:error.malformed",
  storage: "leetcode:error.storage",
} as const satisfies Record<LeetCodeErrorCode, string>;

/** A short sentence for a failed connect or refresh. */
export const leetcodeErrorCopy = (code: LeetCodeErrorCode): string => i18n.t(KEY[code]);

/** A short label for Home's compact stat ("Sync failed"). */
export const leetcodeFailureShort = (): string => i18n.t("leetcode:home.failed");
