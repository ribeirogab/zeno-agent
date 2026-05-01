---
feature: cron-schedule-picker
spec: "[[spec]]"
created: 2026-04-17
---
# Cron Schedule Picker — Plan

**Goal:** Ship a preset-driven picker for the schedule field; keep raw cron as escape hatch; render a live humanized preview.

**Architecture:** Pure `cron-schedule.ts` module (toCron/fromCron + preset metadata) + React `SchedulePicker` component using that module for all state↔cron conversion. Humanized preview via `cronstrue`.

## Approach

Four commits:

1. **Module + tests** — `cron-schedule.ts` pure functions + unit tests. No React yet.
2. **Component + form integration** — `SchedulePicker` component; wire into `cron-form.tsx`; `cronstrue` dep.
3. **Paper + docs** — add a row to Feature components artboard + DESIGN.md.
4. **Playwright smoke** — create a cron via the picker; assert the expected cron string submitted.

## File Structure

### NEW

| File | Responsibility |
|---|---|
| `apps/dashboard/src/lib/cron-schedule.ts` | Pure. `toCron(state)`, `fromCron(expr)`, preset metadata, DOW labels. |
| `apps/dashboard/src/components/crons/schedule-picker.tsx` | UI. Controlled `{ value, onChange }`. |
| `apps/dashboard/tests/lib/cron-schedule.test.ts` | Pure function tests. |

### EDIT

| File | Change |
|---|---|
| `apps/dashboard/src/components/crons/cron-form.tsx` | Replace `Schedule *` field with `<SchedulePicker />`. |
| `apps/dashboard/package.json` | Add `cronstrue@^3`. |
| `packages/ui/DESIGN.md` | Add SchedulePicker under Feature components. |

## Phase Ordering

Strict: module → component → paper → smoke. Each commits green.

## Risks / Open Decisions

- See spec.md. Plan-time: keep `SchedulePicker` state internal (single `useState`); expose only `value`/`onChange`.
- Keep cronstrue import explicit (`import cronstrue from 'cronstrue/i18n'` if pt_BR is needed; else base module).
