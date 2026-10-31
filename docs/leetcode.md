# LeetCode

LeetCode is Pulse's second, independent source. It reads a public profile by username and shows practice progress
beside health, but it is **not a health input**: no Recovery, Strain, Sleep, Pulse Age, stress, Energy Bank, journal
impact or report reads it.

## Data and identity

| Stored | Source (LeetCode GraphQL) | Notes |
|---|---|---|
| Profile | `matchedUser.username`, `profile.realName`, `userAvatar`, `ranking` | The username is LeetCode's canonical spelling, not what was typed |
| Solved | `submitStatsGlobal.acSubmissionNum` | Total and Easy / Medium / Hard; LeetCode counts problems, not submissions |
| Streak, active days | `userCalendar.streak`, `totalActiveDays` | The profile's current streak and lifetime active days |
| Activity | `userCalendar.submissionCalendar` | Submissions per UTC day, accepted or not; it has no problem identity, so it can repeat a problem |
| Recent | `recentAcSubmissionList(username, limit: 20)` | Accepted submissions, newest first; may repeat a problem |

The endpoint is `https://leetcode.com/graphql`, a `POST` with the username in the GraphQL variables. Pulse sends no
password, cookie, token or website request. Snapshots live in the Store's `leetcode_profiles` table, one JSON row per
username, so every screen draws from the phone without a network call.

## The counting rule

LeetCode's recent list returns accepted **submissions**, and one problem can have several. Every problem count and the
recent list therefore dedupe by `titleSlug` (`src/leetcode/view.ts`):

- the solved totals come from LeetCode's own problem counts;
- recent problems keep the newest accepted submission per slug, at most 12;
- today's count is the distinct slugs whose accepted timestamp is on the profile's **local day**;
- the activity view stays LeetCode's submission count per day. Its card is labelled "Submissions per day" and says
  that a problem accepted twice counts twice there (and that a wrong attempt counts too). It is never called
  "problems solved".

`recentAcSubmissionList` caps at 20 submissions. If all 20 are from today, `today` is marked truncated and the screens
print `20+` rather than pretending to know the rest of a very heavy day.

## Honest states

| State | What the screens say |
|---|---|
| Not connected | Connect CTA; Settings › LeetCode has the username field |
| Unknown username | "No LeetCode profile with that username." Nothing is saved |
| Private/no stats | The profile does not share its stats; nothing is saved |
| 429 | Rate limited; the last good snapshot stays |
| 403 | Blocked; the last good snapshot stays |
| 5xx | LeetCode is having trouble; the last good snapshot stays |
| Timeout / offline | Could not reach LeetCode; the last good snapshot stays |
| Malformed response | Pulse could not read the data; the last good snapshot stays |
| Local save fails | Could not save the profile on this phone; a failed connect is not kept |

A failed refresh sets `error` on the connection but never clears `snapshot`. Home turns that error into "Sync failed"
instead of a stale or zero count. A failed connect never becomes a saved source.

## Sync

- Boot reads the saved username and its snapshot, renders it, then refreshes if the snapshot is older than 10 minutes.
- A return to the foreground refreshes through the same 10-minute throttle.
- The LeetCode screen has pull-to-refresh and a Refresh button; Settings › LeetCode has Sync now. Both force a fetch.
- Disconnect deletes only that username's snapshot and the saved username. Delete everything clears all LeetCode rows
  as well.
- A source switch (demo ↔ Health Connect) does not touch LeetCode: the two sources are independent.

## Privacy

Only public profile data is read. No password, OAuth, cookie, token or website scrape is ever asked for or stored.
Snapshots and the connected username stay on the phone. The username is a device preference (AsyncStorage
`pulse.leetcode.username`); the data is in SQLite.
