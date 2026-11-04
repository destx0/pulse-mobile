# UI hill-climb — project profile

Bindings for the `ui-hill-climb` skill (global, `~/.agents/skills/ui-hill-climb/`). The skill carries the method;
this file carries what a fresh reviewer would otherwise have to guess. Keep it current.

## Target

- Routes: `app/**` (tab roots `app/(tabs)/index.tsx`, `health.tsx`, `journal.tsx`, `more.tsx`; everything else
  pushes over the tabs, e.g. `app/sleep.tsx`, `app/activity/[id].tsx`).
- Screens: `src/screens/<area>/*.tsx`; the Gym tab is the worked example (`app/(tabs)/gym.tsx` →
  `src/screens/gym/GymHome.tsx` and its parts).
- Copy: `src/i18n/locales/<lang>/<area>.json`, eight locales (`de en es fr it pl pt-BR ru`). German is the long one.
- Kit the screens compose: `src/ui` (shells, `Text`, `Card`, `Button`, `Icon`, charts). Never a bespoke layout where
  `PageShell` + `SectionShell` already exist.

## Rules to read first

`AGENTS.md` (layout, scales, UI and copy rules), `docs/design/spec.md` (spec decisions and deviations),
`docs/screen-rules.md` (visual rules; its data half is historical), and any prior review of the area
(`docs/*-ux-review.md`, `docs/audits/*`).

The look is the pulse PWA's, ported line for line. The copy is final: never reword it to make a layout fit.

## Verify

```sh
pnpm typecheck && pnpm lint && pnpm test
```

Run it after every round. The bundle check (`npx expo export`) is not part of a hill-climb — nothing should change
that Metro resolves.

Guards covering shared files: `src/ui/palette.test.ts`, `src/ui/radius.test.ts`, `src/ui/fontClasses.test.ts`,
`src/ui/shadow.test.ts`, `scripts/renderSafety.test.ts`, plus `pnpm test` in full.

## Evidence

- Host / device: `local / emulator-5554` (`pulse_pixel`). Use `device_list` → `device_open`, then the returned
  `agent-device` command. Metro must be up (`pnpm start`).
- Launch: `agent-device open in.portlabs.pulse --relaunch`, then the deep link `pulse://<route>` (`pulse://gym`).
- Capture: default, empty, loading, error, one long or overflowing row; light and dark (Settings › App › Appearance
  pins the scheme); default and large text; once at 360 dp if the target has a fixed layout.
- Screenshot dir: `.opencode/hill-climb/<round>/<state>-<scheme>.png` — **inside the workspace**, because a subagent
  cannot see `/tmp` and will score blind without saying so. Never commit them.
- Keep the previous round's captures. Every round is read against them, side by side.
- Reference: the owner's target screenshot or the competitor (e.g. Strong) when one is given. It is a reference, not
  a threshold.

Tier B: the owner's phone screenshots. Tier C: no device — run
`node ~/.agents/skills/ui-hill-climb/scripts/class-audit.mjs src/screens/<area> "app/(tabs)/<route>.tsx"` and mark
the scores provisional.

## Composition

- Every round gets a whole-screen read: current captures beside the previous round's, same states, same scale,
  plus the owner's reference when there is one. Write the read before re-scoring; both reviewers score composition.
- Hard rules for these screens: a column header and its values share one anchor; whitespace belongs between
  columns, not between a header and its values or between a set number and the row; a fixed value group must not
  strand the set number or open a dead gap in the middle; a row reads left to right without a dead zone.
- Clean minimal default: every visible element earns its place. No filler text, restated labels, decorative icons
  or chrome added to fill space. Removing an element is a valid fix; removing a label, unit, state or anchor that
  carries meaning is not.
- A fix that lifts a category but makes the row or screen read worse is reverted. A regression blocks the pass.
- The gym tables are the worked example: a `SET | PREVIOUS | KG | REPS | ✓` row is one left-to-right reading path,
  not five independently aligned blocks. The previous value belongs under its own label; the value group belongs on
  the same spine as the row ticks; the set number must not be stranded.

## Design system

- Colour tokens: `global.css`; in code `src/ui/palette.ts` or `useTheme()`. Raw hex or `rgba()` in a screen is a
  finding.
- Coloured-text variants: `recovery-red-text`, `strain-text`, `optimal-text`, `stress-*-text` — the fill colours
  fail AA on a light card.
- Radius scale: `rounded-xs|sm|md|lg|xl|2xl|3xl|4xl` = 2/4/8/10/12/16/24/28 px; `BAR_CORNERS` (`rounded-xs`) for
  bars and tracks, `GLASS_RADIUS` (22) for floating glass chrome. Source: `src/ui/radius.ts`.
- Type ramp: px sizes as on the web, `text-xs…text-4xl` and `text-[15px]` both house style; `<Text>` scales down to
  92 % below 402 pt. Inline `fontSize` in a style object bypasses `<Text>` and is a finding. Numerals use
  `font-numeric` (Barlow), words `font-sans` (Figtree).
- Spacing: 4 px grid, `p-4` = 16 px.
- Shadows: `src/ui/shadow.ts`; a Tailwind `shadow-*` class does nothing on React Native.
- Data states: `MetricState` with the reason codes in `src/lib/reasons.ts`; every nullable metric is
  `{ value, reason, provisional }` and never a fabricated number. Scales: Strain 0–100 (up to ~129), Recovery 1–100,
  Stress and Sleep Score 0–100, Energy Bank 1–100.
- Copy: i18n keys only (ESLint fails a literal string); the PWA's wording is final.
- Contrast: AA, 4.5:1 body, 3:1 large text and meaningful icons.

## Fix scope

- Allowed: `src/screens/**`, the routes under `app/**`, the area's copy in all eight locales, and the way a screen
  composes kit pieces. Restructuring a row or card with the existing tokens and kit is allowed when the composition
  needs it; a new visual direction or a new component system is not.
- Shared / off-limits by default: `src/ui/**`, `src/queries/**`, `src/data/**`, `src/core/**`, `src/lib/**`,
  `package.json`, `app/(tabs)/_layout.tsx`. A systemic finding may touch one, with the guards above run and named
  in the log.
- Never: a new colour, radius, type size, spacing step or shadow. That is a proposal for the report.
- Never regress honesty: no hidden reason, no invented value.

## Log

`docs/audits/<YYYY-MM-DD>-<target>-hill-climb.md`
