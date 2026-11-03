# Decisions audit: verification and status, 2026-11-03

The decision audit (thread "Audit Codebase Decisions and Docs") listed 10 bad, 9 mixed and 11 sound decisions. This
document records what was checked against the code, what changed in the same pass, and what remains. It is not a second
audit; its numbers are the first audit's.

## Verified

| Finding | Check | Status |
|---|---|---|
| Two scoring engines run per day | `src/pipeline/stage2.ts` still calls `scoreEngineSleep` + `scoreSleep`, `scoreHealthspan` + `scoreEnginePulseAge`, and `scoreStress` for training. `src/core/scoring` and `src/core/algorithms` are still the old stack. | **Open.** The migration is a scoring change, not a safe refactor in this pass. |
| No test imports `src/data/db.ts` | `grep` found no test importing it; all 2,130 tests ran on `MemoryStore`. | **Fixed:** `src/data/db.contract.test.ts` runs the real SQL through `node:sqlite` (6 assertions: order, JSON, journal, log ranges, `needsScoring`, `clearAll` keeps coach chats). |
| Migrations fail silently | `for (const sql of MIGRATIONS) await db.execAsync(sql).catch(() => {})`. | **Fixed:** `pragma user_version`, duplicate-column tolerance only, throw otherwise, `verifySchema` for the columns the app reads. |
| Sample data deletes journal/logs | `exploreSample()` called `store.clearAll()`; `clearAll` deletes `journal_entries`, `journal_tags`, `logged_entries`. The confirmation only mentions the import. | **Fixed:** the demo lives in `pulse-demo.db`; switching source opens one database or the other, and the person's own is untouched. |
| "Delete everything" leaves coach state | `reset()` did not call `deleteAllChats()`/`removeProvider()`, and `clearAll` keeps `coach_chats`. | **Fixed:** `reset()` clears both databases, calls `resetCoachState` on each (chats, setup, SecureStore key), removes the preference keys, and takes the run lock. |
| No full export/restore | `src/actions/export.ts` has daily scores and journal only; the gym, logs, coach and settings have no export. | **Open.** Needs a product decision on the format and a restore path. |
| One global `dataChanged()` | Confirmed; every write bumped one version, `ShellData` re-read 400 days for the streak, `memoStore` cleared every read. | **Fixed:** scopes (`scores`/`logs`/`journal`/`gym`/`display`), a per-day score cache keyed by the scores version, a shell that follows only scores, and `dataChanged` only when a run scored. |
| 23 screens ignore a query error | 23 files use `useScreen` without reading `error`; a failed read left the skeleton forever. | **Fixed for the main screens** (Home, Sleep, More, Settings, Goals, Weekly Plan, Sleep Goal, Nap, Food, Behaviours, Your Data, Gym home/history/records/picker/routine/session/measurements/exercise) with a shared `QueryError` and Retry. The remaining helpers (heart-rate tile, HRV card, ECG page, coach, import) fall back to their normal empty state. |
| Docs no longer describe the app | README "scoring v19"; `CONTRIBUTING` says the app never writes Health Connect; `SECURITY` treats any write as a vulnerability; `plan.md` describes Google OAuth/drizzle/Maestro; `screen-rules.md` cites `src/google`; `engine-plan.md` says v24/v4. | **Fixed:** versions and the write policy corrected, `plan.md`/`screen-rules.md` marked historical, `docs/README.md` added with status and last-checked. |
| Reference paths do not exist here | `~/personal/halo`, `~/personal/pulse`, `~/personal/noop` are absent on this machine. | **Documented** in `docs/README.md`: external, not part of the checkout; the code and tests are the source of truth when they are absent. |

## Also fixed from the snappiness audit

- Per-day score cache, one shared `loadDays` per version, range-limited body overlay (Home 41 → 24 ms, Health 80–203 →
  35 ms in Node; the score parse after a log is gone).
- Home's two score ranges unified; Healthspan and Fitness share one 182-day read; the stress line reuses Home's rows.
- `FRESH_MS` 60 s → 5 min with a per-screen override.
- One `TypeScaleProvider` and class-string caches for `Text`; scaled styles memoised.
- Launch sync deferred; background/update/LeetCode and BLE starts deferred; `needsScoring` skips a no-op pipeline and a
  no-op `dataChanged`.
- The opening's full beat plays once; later launches fade in 180 ms.

## Still open, with the reason

1. **Finish the engine migration** (old halo scorers beside the engine). This changes scores; it needs its own change,
   golden-value tests and a `SCORING_VERSION` bump. Removing a scorer that still feeds another (sleep → engine fields,
   healthspan → fitness estimate, stress → training) is not mechanical.
2. **Full export/restore** for journal, logs, gym, coach and settings. The current export covers scores and journal.
   A restore has to validate and merge, so it is a feature, not a fix.
3. **The remaining query-error fallbacks** (heart-rate tile, HRV card, ECG, coach, import) and a UI test path. No
   RNTL/Maestro; the owner checks on a phone.
4. **i18n gaps** (`gym` and `leetcode` namespaces are English-only) and the 30 Health Connect permissions. Both are
   product/locale work, not code defects.
5. **Refresh-rate cap / low-end mode**. The config plugin asks for the panel's highest mode. A cap needs a device tier or
   a setting; it is a native change that needs an APK to verify.
