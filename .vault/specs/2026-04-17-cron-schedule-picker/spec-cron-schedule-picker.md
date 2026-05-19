---
status: shipped
feature: cron-schedule-picker
created: 2026-04-17
shipped: 2026-04-17
---
# Cron Schedule Picker — Spec

**Status:** Shipped
**Scope:** Replace the raw `<Input>` for the `schedule` field in the new-cron form with a preset-driven picker (`SchedulePicker`) that covers the common cron shapes via friendly fields (hour, minute, day-of-week, day-of-month), falls back to a raw input for arbitrary expressions, and renders a live humanized preview ("runs every weekday at 9:00 AM") via the `cronstrue` library.

## Context

Creating a cron today means typing a 5-field cron expression (`0 9 * * 1-5`) into a plain input. The format is unforgiving — one misplaced space or wrong field value silently yields a schedule that fires at unexpected times, and you can't tell until the first tick (or never, if the tick is "Feb 30"). Even for operators who know cron syntax, the input offers zero confirmation that what they typed means what they meant.

Spec 0013 shipped the create form. Spec 0018 replaced raw loading/empty text with proper primitives. Spec 0019 made mutations feel instant. This spec finishes the create flow by making scheduling obvious.

## Problem Statement

The schedule input is the last rough edge in the new-cron form. It demands either cron literacy or trial-and-error. On a single-operator personal agent, the common cases are narrow:

- every N minutes (5, 10, 15, 30)
- every hour (at minute N)
- daily at a specific time
- weekdays at a specific time
- weekly on a specific day
- monthly on a specific day

Those six cases cover ~90% of what Zeno gets scheduled. A preset picker with the relevant fields per preset serves them directly. The raw cron input stays for the 10% edge cases (e.g. `*/15 9-18 * * 1-5` "every 15 min during business hours").

A live humanized preview closes the confidence gap: whatever the operator assembles, they see "runs every weekday at 9:00 AM" beneath the controls.

## Non-Goals

1. **Timezone selection.** Zeno runs in the operator's local timezone (container TZ is set at boot). No per-cron TZ override — out of scope.
2. **Second-precision schedules.** Cron is 5-field (minute precision). No seconds.
3. **Natural-language → cron parsing.** Options B/C from the exploration. Requires a dep like chrono-node or an LLM call; fragile; `cronstrue` handles the reverse direction reliably, and presets cover the common input paths.
4. **Full visual builder** (5 pickers for every field). Overkill for 6 common shapes.
5. **Editing an existing schedule.** There's no edit-cron flow today. If one is added later, the picker's `fromCron()` reverse mapping (detect preset from a string) ships with this spec but is initially unused in production.
6. **Server-side schedule parsing changes.** The API still accepts the same cron string and validates it server-side. The picker's output shape is identical to what users type today.
7. **Paper artboard with every preset state.** One row in `04. Feature components` for the default preset. State variants can land later if needed.

## Constraints

- **One new runtime dep.** `cronstrue@^3` for the humanized preview. ~3kb gzipped, no transitive bloat.
- **`SchedulePicker` is a feature component**, not a primitive. Lives under `apps/dashboard/src/components/crons/schedule-picker.tsx`. If a second app needs cron scheduling later, promote to `@zeno/ui` then.
- **Controlled component.** `value: string` + `onChange: (cron: string) => void`. Drop-in replacement for the current `<Input>`.
- **Tokens + Inter/Instrument Serif only.** Matches the design system.
- **Lowercase copy.** Preset labels in PT-BR, matching toasts ("a cada hora", "todo dia", "nos dias úteis", etc.).
- **No `any`, no `// biome-ignore`.**
- **No validation UI.** The server still validates on submit; errors surface via the existing error toast path. If the preview renders "…" or a cronstrue error, that's enough feedback client-side.

## Design

### State shape (internal)

```typescript
type PresetKind =
  | 'everyMinutes'
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'custom';

interface PickerState {
  preset: PresetKind;
  everyNMinutes: 5 | 10 | 15 | 30;  // everyMinutes
  hourlyAtMinute: number;           // 0..59, hourly
  hour: number;                     // 0..23, daily/weekdays/weekly/monthly
  minute: number;                   // 0..59, daily/weekdays/weekly/monthly
  dow: 0 | 1 | 2 | 3 | 4 | 5 | 6;   // weekly (Sunday = 0)
  dayOfMonth: number;               // 1..31, monthly
  raw: string;                      // custom
}
```

### `toCron(state): string`

Pure function producing a 5-field cron expression from the picker state.

| Preset | Output |
|---|---|
| `everyMinutes` | `*/N * * * *` |
| `hourly` | `M * * * *` |
| `daily` | `M H * * *` |
| `weekdays` | `M H * * 1-5` |
| `weekly` | `M H * * D` |
| `monthly` | `M H D * *` |
| `custom` | `state.raw` (trimmed) |

### `fromCron(expr): PickerState`

Pure function producing a `PickerState` from a cron string. Detects the preset:

1. `/^\*\/(\d+) \* \* \* \*$/` → `everyMinutes` if N ∈ {5, 10, 15, 30}, else `custom`.
2. `/^(\d+) \* \* \* \*$/` → `hourly`.
3. `/^(\d+) (\d+) \* \* \*$/` → `daily`.
4. `/^(\d+) (\d+) \* \* 1-5$/` → `weekdays`.
5. `/^(\d+) (\d+) \* \* (\d)$/` → `weekly`.
6. `/^(\d+) (\d+) (\d+) \* \*$/` → `monthly`.
7. Anything else → `custom` with `raw = expr`.

Not wired to the UI in this spec (no edit flow), but included for future-proofing and tested.

### UI layout

```
[ Preset dropdown: "a cada 15 min ▾" ]

<dynamic fields per preset — one row, wraps on mobile>

runs every 15 minutes            ← cronstrue preview, text-text-tertiary
```

**Per preset:**

- `everyMinutes`: one `<select>` (5/10/15/30 minutes).
- `hourly`: minute `<select>` (0-59, every 5 minutes coarsened: 0, 5, 10, ..., 55).
- `daily` / `weekdays`: hour `<select>` (0-23) + minute `<select>` (0, 15, 30, 45).
- `weekly`: hour + minute + day-of-week `<select>` (dom, seg, ter, qua, qui, sex, sáb).
- `monthly`: hour + minute + day-of-month `<select>` (1-31).
- `custom`: raw `<Input>` (unchanged from today's behavior).

All selects use a small native-styled variant matching the existing `TimeRangeSelect` / `LevelChips` tokens.

### Humanized preview

`cronstrue.toString(cron, { locale: 'pt_BR', use24HourTimeFormat: true })`. Wrap in a `try/catch` — if the cron is unparseable (edge cases in `custom`), render "expressão inválida" in `text-status-failed`.

### Default state on form open

New cron form opens with `preset: 'daily'`, `hour: 9`, `minute: 0`. Produces `0 9 * * *` — "todo dia às 9:00". That covers the most common intent (set a daily briefing).

### Files touched

**NEW:**

| File | Responsibility |
|---|---|
| `apps/dashboard/src/components/crons/schedule-picker.tsx` | The component. |
| `apps/dashboard/src/lib/cron-schedule.ts` | `toCron`, `fromCron`, preset constants. Pure functions, unit-tested. |
| `apps/dashboard/tests/lib/cron-schedule.test.ts` | Round-trip tests (toCron ∘ fromCron = id for each preset); preset detection; custom fallback. |

**EDIT:**

| File | Change |
|---|---|
| `apps/dashboard/src/components/crons/cron-form.tsx` | Replace the `Schedule *` label + `<Input>` block with `<SchedulePicker value={schedule} onChange={setSchedule} />`. Keep the `required` semantics on submit (the picker always produces a non-empty string). |
| `apps/dashboard/package.json` | Add `cronstrue@^3`. |
| `packages/ui/DESIGN.md` | Row in Feature components noting the new component. |

No changes to API, storage, or mutation logic.

## User Stories / Scenarios

1. **Set a daily briefing.** Operator opens new-cron, sees preset "todo dia" pre-selected at 09:00. Preview reads "todo dia às 09:00". Bumps hour to 08. Preview updates. Submits. Done.

2. **Every 15 minutes.** Operator picks "a cada N min" → "15". Preview reads "a cada 15 minutos". Submits.

3. **Weekdays at 18:30.** Picks "dias úteis" + hour 18 + minute 30. Preview "toda segunda, terça, quarta, quinta, e sexta às 18:30".

4. **Sunday night digest.** Picks "semanal" + DOW "dom" + hour 20 + minute 0. Preview "todo domingo às 20:00".

5. **Power user.** Picks "custom", types `*/15 9-18 * * 1-5`, preview shows "a cada 15 minutos, entre 09:00 e 18:00, de segunda a sexta". Submits.

6. **Typo in custom.** Picks "custom", types `invalid`. Preview shows "expressão inválida" in red. Submit is still permitted — server validates and returns an error toast. Spec doesn't add client-side validation.

## Success Criteria

1. `apps/dashboard/src/components/crons/schedule-picker.tsx` exists and accepts `{ value, onChange }`.
2. `apps/dashboard/src/lib/cron-schedule.ts` exports `toCron(state)` and `fromCron(expr)`; both covered by unit tests.
3. `cron-form.tsx` uses `SchedulePicker` — no raw cron input visible for non-custom presets.
4. `cronstrue` dep added to `apps/dashboard/package.json`.
5. New-cron page renders the picker, humanized preview updates live, submit creates a cron with the derived expression — verified via Playwright.
6. `pnpm run quality-gate` green.
7. Paper registry row added for SchedulePicker.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **`cronstrue` locale `pt_BR` has gaps** (stale translations for rare ops) | Acceptable — falls back to English strings for unknown tokens. If jarring, pin to English for v1. |
| **Preset detection in `fromCron` mismatches when a cron could belong to multiple presets** (e.g., `0 9 * * *` is both `daily` and not-any-other — fine, no overlap) | Preset regex order handles it. Unit tests cover every preset. |
| **Operator picks `custom` and types a syntactically valid but semantically absurd cron** (e.g., `0 0 31 2 *` — never fires). `cronstrue` parses it fine. | Out of scope. Future enhancement: flag impossible dates. Zeno's cron library already skips impossible fires; no runtime breakage. |
| **Mobile layout** — dropdowns + fields wrap awkwardly on < sm | Test on the mobile breakpoint during implementation. Use `flex-wrap` on the field row. Spec 0017 already normalized the mobile behavior. |
| **Default `daily` at 09:00 may surprise operators who prefer `weekdays`** | Chose the most generic default; any preset change is one click. Not worth A/B-ing. |

## Open Questions

None blocking. Implementation-time decisions:

- **Minute granularity** for `daily`/`weekdays`/`weekly`/`monthly`: 15-min steps (0/15/30/45) or 1-min steps (0-59)? Default: 15-min steps to keep the dropdown short. "Custom" covers the off-grid case.
- **DOW labels:** PT-BR 3-letter (`dom`, `seg`, ...) vs full (`domingo`, ...). Default: 3-letter (matches the compact dropdown aesthetic).
- **`everyMinutes` N options:** `{5, 10, 15, 30}` covers the common ones. Adding "1" (every minute) invites runaway mistakes; omit — "custom" remains the escape.
