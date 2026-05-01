---
feature: cron-schedule-picker
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-17
---
# Cron Schedule Picker — Tasks

- [ ] **Phase 1 — module + tests.** Create `cron-schedule.ts` with `PresetKind`, `PickerState`, `DEFAULT_STATE`, `toCron`, `fromCron`, `DOW_LABELS`. Write `cron-schedule.test.ts` covering toCron/fromCron round-trip per preset + custom fallback. Commit.
- [ ] **Phase 2 — component + integration.** Install `cronstrue`. Build `SchedulePicker` (uses `toCron`/`fromCron` from Phase 1 + `cronstrue` for preview). Replace the schedule field in `cron-form.tsx`. `pnpm run quality-gate`. Commit.
- [ ] **Phase 3 — Paper + docs.** Add a row to the `04. Feature components` artboard. Add a row to `packages/ui/DESIGN.md`. Commit.
- [ ] **Phase 4 — Playwright smoke.** Docker build + up. Open `/crons/new`, change preset, submit, assert cron appears. Screenshot. Docker down. Commit if anything tracked.
- [ ] **Ship.** Flip spec to shipped; update MOC; update PR #4.
