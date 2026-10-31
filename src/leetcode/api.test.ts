// The public LeetCode response parser: every failure becomes an honest code, never a crash and never a zero.
import { describe, expect, it } from "vitest";
import { fetchLeetCode, normalizeUsername, parseBody, type LeetCodeFetcher } from "./api";

const NOW = 1_793_400_000;

const CALENDAR = JSON.stringify({
  "1793318400": 2,
  "1793404800": 1,
  "1793491200": 5,
});

const goodBody = () => ({
  data: {
    matchedUser: {
      username: "destx0",
      profile: { realName: "Pulak Ghosh", userAvatar: "https://assets.leetcode.com/avatar.png", ranking: 180739 },
      submitStatsGlobal: {
        acSubmissionNum: [
          { difficulty: "All", count: 546, submissions: 1244 },
          { difficulty: "Easy", count: 223, submissions: 522 },
          { difficulty: "Medium", count: 276, submissions: 649 },
          { difficulty: "Hard", count: 47, submissions: 73 },
        ],
      },
      userCalendar: { streak: 5, totalActiveDays: 81, submissionCalendar: CALENDAR },
    },
    recentAcSubmissionList: [
      { id: "2", title: "Two Sum", titleSlug: "two-sum", timestamp: "1793400000" },
      { id: "1", title: "Two Sum", titleSlug: "two-sum", timestamp: "1793300000" },
      { id: "3", title: "Add Two Numbers", titleSlug: "add-two-numbers", timestamp: "1793200000" },
    ],
  },
});

const response = (body: unknown, status = 200, ok = status < 400) => ({
  ok,
  status,
  json: async () => body,
});

const fetcher = (fn: (url: string, init: { body: string }) => ReturnType<LeetCodeFetcher>) => fn as unknown as LeetCodeFetcher;

describe("normalizeUsername", () => {
  it.each([
    ["destx0", "destx0"],
    ["  destx0  ", "destx0"],
    ["@destx0", "destx0"],
    ["dest-x_0", "dest-x_0"],
  ])("%j → %j", (raw, want) => expect(normalizeUsername(raw)).toBe(want));

  it.each(["", "bad name", "https://leetcode.com/u/destx0/", "dest.x0", "a".repeat(31)])("rejects %j", (raw) => expect(normalizeUsername(raw)).toBeNull());
});

describe("parseBody", () => {
  it("reads the solved breakdown, streak, calendar and recent accepted problems", () => {
    const result = parseBody(goodBody(), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.username).toBe("destx0");
    expect(result.snapshot.fetchedAt).toBe(NOW);
    expect(result.snapshot.solved).toEqual({ total: 546, easy: 223, medium: 276, hard: 47 });
    expect(result.snapshot.streak).toBe(5);
    expect(result.snapshot.activeDays).toBe(81);
    expect(result.snapshot.calendar["1793318400"]).toBe(2);
    // Newest first, even though the API returned one out of order.
    expect(result.snapshot.recent.map((r) => r.id)).toEqual(["2", "1", "3"]);
  });

  it("returns not_found for an unknown username", () => {
    expect(parseBody({ data: { matchedUser: null }, errors: [{ message: "That user does not exist." }] }, NOW)).toEqual({ ok: false, error: "not_found" });
    expect(parseBody({ data: { matchedUser: null } }, NOW)).toEqual({ ok: false, error: "private" });
  });

  it("returns private when the profile has no stats", () => {
    const body = goodBody();
    // @ts-expect-error: a private profile's shape
    delete body.data.matchedUser.submitStatsGlobal;
    expect(parseBody(body, NOW)).toEqual({ ok: false, error: "private" });

    const empty = goodBody();
    empty.data.matchedUser.submitStatsGlobal.acSubmissionNum = [];
    expect(parseBody(empty, NOW)).toEqual({ ok: false, error: "private" });
  });

  it("returns malformed for a broken calendar, recent row or counts", () => {
    const calendar = goodBody();
    calendar.data.matchedUser.userCalendar.submissionCalendar = "{not json";
    expect(parseBody(calendar, NOW)).toEqual({ ok: false, error: "malformed" });

    const recent = goodBody();
    recent.data.recentAcSubmissionList = [{ id: "1", title: "Two Sum", timestamp: "1793300000" } as never];
    expect(parseBody(recent, NOW)).toEqual({ ok: false, error: "malformed" });

    const counts = goodBody();
    counts.data.matchedUser.submitStatsGlobal.acSubmissionNum = counts.data.matchedUser.submitStatsGlobal.acSubmissionNum.filter((r) => r.difficulty !== "Hard");
    expect(parseBody(counts, NOW)).toEqual({ ok: false, error: "malformed" });
  });
});

describe("fetchLeetCode", () => {
  it("posts the username and returns the parsed snapshot", async () => {
    let sent = "";
    const result = await fetchLeetCode("destx0", {
      now: NOW,
      fetch: fetcher(async (_url, init) => {
        sent = init.body;
        return response(goodBody());
      }),
    });
    expect(JSON.parse(sent).variables).toEqual({ username: "destx0" });
    expect(result.ok).toBe(true);
  });

  it.each([
    [429, "rate_limited"],
    [403, "blocked"],
    [500, "server_error"],
    [503, "server_error"],
    [404, "server_error"],
  ])("HTTP %i → %s", async (status, error) => {
    const result = await fetchLeetCode("destx0", { fetch: fetcher(async () => response({}, status)) });
    expect(result).toEqual({ ok: false, error });
  });

  it("does not read the body of a rate-limited response", async () => {
    let read = false;
    const result = await fetchLeetCode("destx0", {
      fetch: fetcher(async () => ({
        ok: false,
        status: 429,
        json: async () => {
          read = true;
          throw new Error("body must not be read");
        },
      })),
    });
    expect(result).toEqual({ ok: false, error: "rate_limited" });
    expect(read).toBe(false);
  });

  it("turns a network rejection into offline and an abort into timeout", async () => {
    expect(await fetchLeetCode("destx0", { fetch: fetcher(async () => { throw new TypeError("Network request failed"); }) })).toEqual({ ok: false, error: "offline" });
    expect(
      await fetchLeetCode("destx0", {
        fetch: fetcher(async () => {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }),
      }),
    ).toEqual({ ok: false, error: "timeout" });
  });

  it("times out a hanging request without reading a body", async () => {
    const result = await fetchLeetCode("destx0", {
      timeoutMs: 10,
      fetch: fetcher(() => new Promise(() => {}) as never),
    });
    expect(result).toEqual({ ok: false, error: "timeout" });
  });

  it("turns malformed JSON into malformed", async () => {
    const result = await fetchLeetCode("destx0", {
      fetch: fetcher(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("bad json");
        },
      })),
    });
    expect(result).toEqual({ ok: false, error: "malformed" });
  });

  it("rejects an invalid username without a request", async () => {
    let called = false;
    const result = await fetchLeetCode("bad name", {
      fetch: fetcher(async () => {
        called = true;
        return response(goodBody());
      }),
    });
    expect(result).toEqual({ ok: false, error: "invalid_username" });
    expect(called).toBe(false);
  });
});
