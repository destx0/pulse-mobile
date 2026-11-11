# Docs index

Status and last check for every document in this folder. When a doc and the code disagree, the code wins; fix the doc
in the same change. Versions here are the code's: `SCORING_VERSION` lives in `src/pipeline/types.ts`, `IMPORT_VERSION`
in `src/health/sync.ts` (30 and 8 at this writing).

## Current

| Doc | What it is | Last checked |
|---|---|---|
| `../AGENTS.md` | Rules for people and coding agents: commands, layout, data policy, git, testing. | 2026-11-03 |
| `../README.md` | What the app is, install, the pipeline diagram. | 2026-11-03 |
| `../CONTRIBUTING.md` | How to send a change; the short version of the rules. | 2026-11-03 |
| `../SECURITY.md` | What counts as a vulnerability, including the Health Connect write policy. | 2026-11-03 |
| `rewrite-plan.md` | The move from the server app to Health Connect + halo's engine, in phases. | 2026-11-03 |
| `engine-plan.md` | The Pulse engine's phases and the remaining work (the old halo scorers still run beside it). | 2026-11-03 |
| `learning.md` | Why Expo/React Native choices were made, with the measurements behind them. Add a section for each choice. | 2026-11-03 |
| `onboarding.md` | The first run, from consent to the first score. | 2026-10 |
| `i18n.md`, `i18n-plan.md` | Keys, namespaces, plural rules, the checks. | 2026-10 |
| `design/spec.md` | The Pulse PWA's design spec: the visual reference. Its stack names (Google, Recharts, shadcn) describe the web app, not this one; the app is React Native, Skia and NativeWind. | 2026-10 |
| `gym.md`, `gym-plan.md`, `gym-ux-review.md` | The gym log's model, plan and review. | 2026-11 |
| `habits.md` | The habit tracker: Loop's score, the screens, and the Android widgets. | 2026-11 |
| `releases.md` | Version, signing, pugg, the update check. | 2026-11 |
| `runbooks/` | Operational runbooks (the release review). | 2026-10 |
| `audits/2026-11-03-snappiness-audit.md` | Why the app feels slow on a low-end phone, with measurements and the fix order. | 2026-11-03 |
| `audits/2026-11-03-decisions-audit.md` | The decision audit's findings (engine migration, database tests, data-loss paths, docs). | 2026-11-03 |
| `audits/2026-10-10-theme-token-audit.md` | Token coverage in the UI. | 2026-10 |

## Historical

These describe earlier states and are kept for context. Do not follow them as current instructions:
`plan.md` (the first plan: Google OAuth, drizzle, Maestro), `screen-rules.md` (the first port: `src/google`,
`seededCtx`), `handoff.md`, `handoff-next.md`, `reddit-*`, `screens-check.md`, `screenshots.md`, `kit-check.md`,
`i18n-worker-notes.md`.

## External references

The engine is written against three repositories that are **not part of this checkout**:

- `~/personal/halo` — the fork of the same Pulse app; the reference for `src/health`, `src/data`, `src/pipeline`,
  `src/queries` and `src/core/scoring`/`algorithms`.
- `~/personal/pulse` — the web app; its `docs/research/bevel/` is the Pulse engine's reference study.
- `~/personal/noop` — WHOOP's naming and behaviour, where the study and WHOOP disagree.
- [iSoron/uhabits](https://github.com/iSoron/uhabits) — Loop Habit Tracker, the reference for the habit tracker's score,
  periods, streaks and widgets (see `habits.md`).

Code comments cite them by path. On a machine without them (CI, a fresh clone), the citations cannot be checked; the
code and the tests are the source of truth. If you add a formula from a reference, put the numbers it needs in the code
or a test, not only in the citation.
