---
feature: dashboard-visual-rebuild
plan: "[[plan-dashboard-visual-rebuild]]"
spec: "[[spec-dashboard-visual-rebuild]]"
created: 2026-04-26
---
# Dashboard Visual Rebuild — Tasks

**For this plan:** `[[plan-dashboard-visual-rebuild]]`

> Steps use checkbox (`- [ ]`) syntax. Branch: `feat/dashboard-visual-rebuild`. Commit at the end of each task. Visual reference for every component is the corresponding component / route in `apps/design`.

> **Cross-reference workflow per task:** open `apps/design/src/...` for the component you're about to rebuild, read its full source, port the JSX + classNames + sub-component breakdown into `apps/dashboard`. Don't import from design — read and reimplement. Where dashboard's data shape differs from design's fixture, map at the component boundary.

---

## Phase 1 — Layout (sidebar + topstrip + `_authed.tsx`)

Goal: every authed page renders with the new chrome. Existing `sidebar.tsx` + `layout.tsx` deleted; `sidebar.test.tsx` rewritten.

### Task 1.1: Build `<DashboardSidebar>`

**Files:**
- Create: `apps/dashboard/src/components/layout/dashboard-sidebar.tsx`
- Reference: `apps/design/src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Read the reference**

Run: `cat apps/design/src/components/dashboard/sidebar.tsx`

Expected: ~250 lines with `<Brand>`, `<Nav>`, `<StatusPanel>`, `<User>` sub-components, `NAV` array, `<NavIcon>` switch.

- [ ] **Step 2: Create the new file with the dashboard's nav set (no connectors entry)**

Write `apps/dashboard/src/components/layout/dashboard-sidebar.tsx`:

```tsx
import { Link, useLocation } from '@tanstack/react-router';
import { Crest, Dot } from '@zeno/ui';
import type { JSX } from 'react';
import { useHealth } from '@/lib/use-health';

type NavId = 'home' | 'crons' | 'sessions' | 'logs' | 'settings';

const NAV: { id: NavId; label: string; shortcut: string; to: string; badge?: number }[] = [
  { id: 'home', label: 'home', shortcut: '⌘H', to: '/' },
  { id: 'crons', label: 'crons', shortcut: '⌘C', to: '/crons' },
  { id: 'sessions', label: 'sessions', shortcut: '⌘S', to: '/sessions' },
  { id: 'logs', label: 'logs', shortcut: '', to: '/logs' },
  { id: 'settings', label: 'settings', shortcut: '⌘,', to: '/settings' },
];

export function DashboardSidebar(): JSX.Element {
  const location = useLocation();
  const activeId = navIdForPath(location.pathname);
  return (
    <aside className="bg-sidebar border-r border-border-subtle px-[14px] pt-[18px] pb-[14px] flex flex-col gap-6 sticky top-0 h-screen w-[252px] shrink-0">
      <Brand />
      <Nav active={activeId} />
      <StatusPanel />
      <User />
    </aside>
  );
}

function navIdForPath(path: string): NavId {
  if (path === '/') return 'home';
  if (path.startsWith('/crons')) return 'crons';
  if (path.startsWith('/sessions')) return 'sessions';
  if (path.startsWith('/logs')) return 'logs';
  if (path.startsWith('/settings')) return 'settings';
  return 'home';
}

// Then port <Brand>, <Nav>, <NavItem>, <NavIcon>, <StatusPanel>, <User>
// from apps/design/src/components/dashboard/sidebar.tsx — adapting:
// - <StatusPanel>: replace hardcoded values with `useHealth()` data
// - <User>: hardcode 'AL' avatar + 'alex' name (was already sanitized in spec 0030)
// - omit any 'connectors' nav entry
```

(Continue porting `<Brand>`, `<Nav>`, `<NavItem>`, `<NavIcon>`, `<StatusPanel>`, `<User>` from the design source. Verbatim where possible; replace mock status panel values with `useHealth()`.)

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/layout/dashboard-sidebar.tsx
git commit -m "feat(dashboard): add DashboardSidebar (Phase 1)"
```

### Task 1.2: Build `<DashboardTopstrip>`

**Files:**
- Create: `apps/dashboard/src/components/layout/dashboard-topstrip.tsx`
- Reference: `apps/design/src/components/dashboard/topstrip.tsx`

- [ ] **Step 1: Read the reference**

Run: `cat apps/design/src/components/dashboard/topstrip.tsx`

- [ ] **Step 2: Port to dashboard**

Write `apps/dashboard/src/components/layout/dashboard-topstrip.tsx`:

```tsx
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';

type Crumb = { label: string; to?: string; current?: boolean };

export function DashboardTopstrip({ crumbs }: { crumbs: Crumb[] }): JSX.Element {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3.5 px-6 py-2.5 bg-canvas/[0.92] backdrop-blur-md border-b border-border-subtle font-mono text-[11px] text-text-tertiary tracking-[0.06em]">
      <div className="flex gap-2 items-center text-text-secondary">
        <Link to="/" className="hover:text-text-primary transition-colors duration-[120ms]">
          zeno
        </Link>
        {crumbs.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: crumbs are static per render
          <span key={i} className="flex items-center gap-2">
            <span className="text-text-tertiary">/</span>
            {c.current ? (
              <span className="text-gold font-medium tracking-[0.06em]">{c.label}</span>
            ) : c.to ? (
              <Link to={c.to} className="hover:text-text-primary transition-colors duration-[120ms]">
                {c.label}
              </Link>
            ) : (
              <span>{c.label}</span>
            )}
          </span>
        ))}
      </div>
      <span className="flex-1" />
      <span className="px-1.5 py-0.5 border border-border-subtle text-text-secondary text-[10px]">
        ⌘K
      </span>
      <span>command palette</span>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/layout/dashboard-topstrip.tsx
git commit -m "feat(dashboard): add DashboardTopstrip (Phase 1)"
```

### Task 1.3: Wire sidebar + topstrip in `_authed.tsx`

**Files:**
- Modify: `apps/dashboard/src/routes/_authed.tsx`
- Delete: `apps/dashboard/src/components/layout/sidebar.tsx`
- Delete: `apps/dashboard/src/components/layout/layout.tsx`

- [ ] **Step 1: Replace `_authed.tsx` body**

```tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import type { JSX } from 'react';
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar';
import { ApiError, apiFetch } from '@/lib/api-client';

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    try {
      await apiFetch<void>('/api/auth/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect({ to: '/login' });
      }
      throw err;
    }
  },
  component: AuthedLayout,
});

function AuthedLayout(): JSX.Element {
  return (
    <div className="flex min-h-screen bg-canvas">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

(`<DashboardTopstrip>` is mounted **per-page** — each page passes its own `crumbs`. `_authed.tsx` only mounts the sidebar.)

- [ ] **Step 2: Delete the old files**

```bash
rm apps/dashboard/src/components/layout/sidebar.tsx
rm apps/dashboard/src/components/layout/layout.tsx
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @zeno/dashboard typecheck && pnpm --filter @zeno/dashboard build`
Expected: clean. Routes still resolve.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/routes/_authed.tsx apps/dashboard/src/components/layout/sidebar.tsx apps/dashboard/src/components/layout/layout.tsx
git commit -m "feat(dashboard): mount DashboardSidebar in _authed; delete old sidebar/layout"
```

### Task 1.4: Rewrite `sidebar.test.tsx`

**Files:**
- Modify: `apps/dashboard/tests/components/sidebar.test.tsx`

- [ ] **Step 1: Replace the test entirely**

The current test has wrong import casing and wrong label assertions. Replace with:

```tsx
import { render, screen } from '@testing-library/react';
import { createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import { DashboardSidebar } from '../../src/components/layout/dashboard-sidebar';

// Minimal router for <Link> resolution
const rootRoute = { /* TODO: build minimal route tree for the test */ };

vi.mock('../../src/lib/use-health', () => ({
  useHealth: () => ({ data: { backend: 'claude-code', slack: 'connected', runner: 'ticking', uptime: 173000 } }),
}));

describe('<DashboardSidebar>', () => {
  it('renders all 5 nav items in lowercase', () => {
    render(<DashboardSidebar />);
    expect(screen.getByText('home')).toBeDefined();
    expect(screen.getByText('crons')).toBeDefined();
    expect(screen.getByText('sessions')).toBeDefined();
    expect(screen.getByText('logs')).toBeDefined();
    expect(screen.getByText('settings')).toBeDefined();
  });

  it('omits a "connectors" nav item', () => {
    render(<DashboardSidebar />);
    expect(screen.queryByText('connectors')).toBeNull();
  });

  it('renders the user as "alex"', () => {
    render(<DashboardSidebar />);
    expect(screen.getByText('alex')).toBeDefined();
  });
});
```

(If the test needs a proper router context for `<Link>` rendering, set up a minimal `createMemoryHistory` + `createRouter` with a stub route tree. The existing test stubs the router; mirror that pattern.)

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @zeno/dashboard test -- sidebar.test`
Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/tests/components/sidebar.test.tsx
git commit -m "test(dashboard): rewrite sidebar test against DashboardSidebar"
```

### Task 1.5: Phase 1 quality gate + visual verify

- [ ] **Step 1: Quality gate**

```bash
pnpm --filter @zeno/dashboard lint && \
pnpm --filter @zeno/dashboard typecheck && \
pnpm --filter @zeno/dashboard test && \
pnpm --filter @zeno/dashboard build
```

All green.

- [ ] **Step 2: Visual smoke**

Start design dev server (port 5174):
```bash
pnpm --filter @zeno/design dev
```

Start dashboard (with api running):
```bash
pnpm run docker:up   # if not already up
# dashboard is served by apps/api at http://localhost:3000
```

Open both in browser side-by-side. Compare sidebar of any design route (e.g. `/dashboard/home`) vs any dashboard route (e.g. `/`). Eyeball-diff: brand row, nav items + active state, status panel pills (`useHealth` should populate them), user row (AL / alex).

Console clean in both.

- [ ] **Step 3: No commit** — verification step.

---

## Phase 2 — Home (`/`)

Goal: `/` renders home with header + 4 stat tiles + activity stream + "what's next" panel. Empty state when zero crons.

### Task 2.1: Build `<StatTile>`

**Files:**
- Replace: `apps/dashboard/src/components/home/stat-tile.tsx`
- Reference: `apps/design/src/routes/dashboard/home/index.tsx` (the `<StatTile>` sub-component within)

- [ ] **Step 1: Read both — design's StatTile + the existing dashboard one**

```bash
grep -A 30 "function StatTile" apps/design/src/routes/dashboard/home/index.tsx
cat apps/dashboard/src/components/home/stat-tile.tsx
```

- [ ] **Step 2: Rewrite the dashboard's `stat-tile.tsx`**

Port the JSX + classNames from design. Props on the new component:

```tsx
import { Spark } from '@zeno/ui';
import type { JSX } from 'react';

export interface StatTileProps {
  label: string;          // "active crons"
  value: string | number; // "3"
  delta?: string;         // "+0 since yesterday"
  spark?: number[];       // optional sparkline data
  gold?: boolean;         // big-value gold treatment (e.g. success rate)
}

export function StatTile({ label, value, delta, spark, gold }: StatTileProps): JSX.Element {
  return (
    <div className="bg-panel px-5 pt-5 pb-[18px] flex flex-col gap-2.5">
      <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-text-tertiary">
        {label}
      </span>
      <span className={`font-serif text-[44px] tracking-[-0.02em] leading-none ${gold ? 'text-gold' : 'text-text-primary'}`}>
        {value}
      </span>
      {spark ? <Spark data={spark} /> : null}
      {delta ? (
        <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
          {delta}
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/components/home/stat-tile.tsx
git commit -m "feat(dashboard): rebuild StatTile to match design (Phase 2)"
```

### Task 2.2: Build `<ActivityRow>`

**Files:**
- Replace: `apps/dashboard/src/components/home/activity-row.tsx`
- Reference: `apps/design/src/routes/dashboard/home/index.tsx`

- [ ] **Step 1: Port the activity row** — dot tone (active/info/idle) + ts + kind + summary.

```tsx
import { Dot, type DotTone } from '@zeno/ui';
import type { JSX } from 'react';

export interface ActivityRowData {
  ts: string;       // "23:42:00"
  kind: string;     // "cron · run"
  summary: string;  // "morning-pr-summary completed in 4.2s"
  tone: DotTone;
}

export function ActivityRow({ row }: { row: ActivityRowData }): JSX.Element {
  return (
    <div className="flex items-center gap-4 px-5 py-2.5">
      <Dot tone={row.tone} />
      <span className="font-mono text-xs leading-4 text-text-tertiary w-[70px] shrink-0">
        {row.ts}
      </span>
      <span className="font-mono text-[11px] leading-[14px] text-gold w-[120px] shrink-0 truncate">
        {row.kind}
      </span>
      <span className="flex-1 min-w-0 font-mono text-xs leading-4 text-text-primary truncate">
        {row.summary}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/components/home/activity-row.tsx
git commit -m "feat(dashboard): rebuild ActivityRow to match design (Phase 2)"
```

### Task 2.3: Build `<NextCronItem>`

**Files:**
- Replace: `apps/dashboard/src/components/home/next-cron-item.tsx`

- [ ] **Step 1: Port the next-cron-item — countdown badge + name + meta + soon indicator**

```tsx
import { Losango } from '@zeno/ui';
import type { JSX } from 'react';

export interface NextCronItemProps {
  when: string;     // "in 23m"
  name: string;     // "evening-standup"
  meta: string;     // "today · 21:00 · #zeno"
  soon?: boolean;
}

export function NextCronItem({ when, name, meta, soon }: NextCronItemProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className={`shrink-0 font-mono text-[13px] tracking-[0.04em] leading-4 px-2 py-1 ${soon ? 'bg-gold-soft text-gold border border-gold-line' : 'bg-panel-2 text-text-secondary border border-border-subtle'}`}>
        {when}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-[1px]">
        <span className="font-mono text-[13px] font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
          {name}
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary truncate">
          {meta}
        </span>
      </div>
      {soon ? <Losango size={10} /> : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/components/home/next-cron-item.tsx
git commit -m "feat(dashboard): rebuild NextCronItem to match design (Phase 2)"
```

### Task 2.4: Build `<HomeSkeleton>`

**Files:**
- Replace: `apps/dashboard/src/components/skeletons/home-skeleton.tsx`
- Reference: skeleton in `apps/design/src/routes/dashboard/home/index.tsx`

- [ ] **Step 1: Port the home skeleton — header lines + 4 stat tile placeholders + 2-column section placeholders**

(Refer to the `<HomeSkeleton>` in the design source; it has the same shape as the populated home so layout doesn't shift on load.)

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/components/skeletons/home-skeleton.tsx
git commit -m "feat(dashboard): rebuild HomeSkeleton to match design (Phase 2)"
```

### Task 2.5: Rewrite `routes/_authed/index.tsx` with empty branch

**Files:**
- Replace: `apps/dashboard/src/routes/_authed/index.tsx`
- Reference: `apps/design/src/routes/dashboard/home/index.tsx` (populated) + `apps/design/src/routes/dashboard/home/empty/index.tsx` (empty state)

- [ ] **Step 1: Skeleton the new file structure**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';
import { ActivityRow } from '@/components/home/activity-row';
import { NextCronItem } from '@/components/home/next-cron-item';
import { StatTile } from '@/components/home/stat-tile';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { HomeSkeleton } from '@/components/skeletons/home-skeleton';
import { greetingForHour } from '@/lib/greeting';
import { homeSubtitle } from '@/lib/home-subtitle';
import { useActivity } from '@/lib/use-activity';
import { useNextCrons } from '@/lib/use-next-crons';
import { useSparkline } from '@/lib/use-sparkline';
import { useStats } from '@/lib/use-stats';

export const Route = createFileRoute('/_authed/')({
  component: HomeScreen,
});

function HomeScreen(): JSX.Element {
  const stats = useStats();
  const activity = useActivity();
  const nextCrons = useNextCrons();
  const sparkline = useSparkline();

  if (stats.isLoading || activity.isLoading) return <HomeSkeleton />;

  const isFirstRun =
    (stats.data?.activeCrons ?? 0) === 0 && (activity.data ?? []).length === 0;

  if (isFirstRun) return <HomeEmpty />;

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'home', current: true }]} />
      <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-10 min-w-0">
        {/* Port the populated layout from apps/design/src/routes/dashboard/home/index.tsx:
            - Hero header (kicker, big greeting, subtitle, moon/kernel/thread meta)
            - 4 stat tiles row
            - 2-column section: activity stream + what's next */}
      </div>
    </>
  );
}

function HomeEmpty(): JSX.Element {
  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'home', current: true }]} />
      {/* Port empty home from apps/design/src/routes/dashboard/home/empty/index.tsx
          BUT drop step 2 (connector). Keep step 1 (slack token) + step 3 (cron) as
          steps 1 + 2. Step 1 active gold, step 2 inactive. */}
    </>
  );
}
```

- [ ] **Step 2: Fill in the populated home content** — port from design, mapping data shapes. Stats keys: `useStats()` returns `{activeCrons, sessions24h, runsToday, failures24h}`. `useActivity()` returns rows with `{ts, kind, summary, tone}`. `useNextCrons()` returns array.

- [ ] **Step 3: Fill in `<HomeEmpty>`** — 2-step checklist (slack + cron), step 1 active gold linking to docs (or `console.log` placeholder until UI exists), step 2 active gold linking to `/crons` with modal-open intent (we'll resolve link target in Phase 3 — for now, link to `/crons`).

- [ ] **Step 4: Typecheck + smoke**

```bash
pnpm --filter @zeno/dashboard typecheck
pnpm --filter @zeno/dashboard build
```

Open dashboard at `/`. Compare with design's `/dashboard/home`. With api up + crons in db, it should populate. Without crons (or pointing at fresh db), should render empty home.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/routes/_authed/index.tsx
git commit -m "feat(dashboard): rebuild home page with empty branch (Phase 2)"
```

### Task 2.6: Phase 2 quality gate + visual verify

- [ ] **Step 1: Quality gate**

```bash
pnpm --filter @zeno/dashboard lint && \
pnpm --filter @zeno/dashboard typecheck && \
pnpm --filter @zeno/dashboard test && \
pnpm --filter @zeno/dashboard build
```

- [ ] **Step 2: Side-by-side visual verify** — dashboard `/` vs design `/dashboard/home`. Then dashboard `/` (with empty data) vs design `/dashboard/home/empty`.

- [ ] **Step 3: No commit**.

---

## Phase 3 — Crons (`/crons`, `/crons/$id`)

Goal: list with new-cron + delete-cron modals (no URL change), detail with prompt + run history. `crons.new.tsx` deleted.

### Task 3.1: Build `<NewCronModal>`

**Files:**
- Create: `apps/dashboard/src/components/modals/new-cron-modal.tsx`
- Reference: `apps/design/src/components/modals/new-cron-modal.tsx`

- [ ] **Step 1: Read the reference design modal** — note its form fields (name, schedule, source toggle, notify channel, prompt textarea), TEST RUN behavior, footer layout.

- [ ] **Step 2: Port to dashboard, replacing `useToast()` + the modal switchboard pattern with controlled props + Radix `<Dialog>`**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogSubtitle } from '@zeno/ui';
import { useState } from 'react';
import type { CreateCronInput } from '@/lib/mutations';

export interface NewCronModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateCronInput) => Promise<void> | void;
}

export function NewCronModal({ open, onOpenChange, onCreate }: NewCronModalProps) {
  const [name, setName] = useState('morning-pr-summary');
  const [schedule, setSchedule] = useState('0 9 * * 1-5');
  const [source, setSource] = useState<'chat' | 'static'>('chat');
  const [channel, setChannel] = useState('zeno');
  const [prompt, setPrompt] = useState(
    'List all open PRs in acme/* and northwind/*.\nFor each: title, author, age, CI status.\nFormat: concise bullets, in English.',
  );

  const handleCreate = async () => {
    await onCreate({
      name,
      prompt,
      schedule,
      notifyConversationId: null,
      notifyThreadId: null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="700px">
        {/* Port body from design's new-cron-modal.tsx */}
      </DialogContent>
    </Dialog>
  );
}
```

(Continue porting the body — Field components, SourceOption, etc.)

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/components/modals/new-cron-modal.tsx
git commit -m "feat(dashboard): add NewCronModal (Phase 3)"
```

### Task 3.2: Build `<DeleteCronModal>`

**Files:**
- Create: `apps/dashboard/src/components/modals/delete-cron-modal.tsx`
- Reference: `apps/design/src/components/modals/delete-cron-modal.tsx`

- [ ] **Step 1: Port** — destructive AlertDialog with corner brackets (red), summary list of what gets deleted (config / runs history / etc).

```tsx
import { AlertDialog, AlertDialogContent, ... } from '@zeno/ui';

export interface DeleteCronModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cron: { name: string } | null;
  onConfirm: () => void;
}

export function DeleteCronModal({ open, onOpenChange, cron, onConfirm }: DeleteCronModalProps) {
  if (!cron) return null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {/* Port body from apps/design/src/components/modals/delete-cron-modal.tsx
            with corner brackets in red tone */}
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/components/modals/delete-cron-modal.tsx
git commit -m "feat(dashboard): add DeleteCronModal (Phase 3)"
```

### Task 3.3: Build cron list composites

**Files:**
- Replace: `apps/dashboard/src/components/crons/cron-row.tsx`
- Replace: `apps/dashboard/src/components/crons/cron-row-actions.tsx`
- Replace: `apps/dashboard/src/components/crons/cron-actions.tsx`
- Replace: `apps/dashboard/src/components/crons/cron-status-pill.tsx`
- Replace: `apps/dashboard/src/components/skeletons/crons-table-skeleton.tsx` (was `cron-list-skeleton.tsx`)

- [ ] **Step 1: Define the row-type at the top of `cron-row.tsx`** (co-located, no central types):

```tsx
export type CronTableRow = {
  id: string;
  name: string;
  description: string;
  scheduleExpr: string;
  scheduleHuman: string;
  nextRun: string;
  nextRunAbsolute: string;
  source: 'chat' | 'static';
  status: 'active' | 'paused' | 'failed';
};
```

- [ ] **Step 2: Port the visual** — see `apps/design/src/routes/dashboard/crons/index.tsx` `<Row>`, `<RowActions>`, `<StatusPill>`, etc.

- [ ] **Step 3: Build CronsTableSkeleton** matching the row layout exactly so loading doesn't shift.

- [ ] **Step 4: Typecheck + commit each file with its message**

### Task 3.4: Build `<CronForm>` and `<SchedulePicker>`

**Files:**
- Replace: `apps/dashboard/src/components/crons/cron-form.tsx`
- Replace: `apps/dashboard/src/components/crons/schedule-picker.tsx`

These are reusable in `<NewCronModal>` and `<EditCronModal>` (if added later). For now they're consumed by `<NewCronModal>`.

- [ ] **Step 1: Port** — see design's modals + the existing dashboard's cron-form (`cronstrue` + validation). Keep the validation logic; replace the markup.

- [ ] **Step 2: Typecheck + commit**

### Task 3.5: Build `<CronRunHistoryRow>`

**Files:**
- Replace: `apps/dashboard/src/components/crons/cron-run-history-row.tsx`
- Replace: `apps/dashboard/src/components/skeletons/cron-detail-runs-skeleton.tsx` (NEW slot)

- [ ] **Step 1: Port** — see `apps/design/src/routes/dashboard/crons/detail/index.tsx` `<RunRow>` (expandable; click toggles JSON output expand).

- [ ] **Step 2: Typecheck + commit**

### Task 3.6: Rewrite `routes/_authed/crons.index.tsx`

**Files:**
- Replace: `apps/dashboard/src/routes/_authed/crons.index.tsx`
- Reference: `apps/design/src/routes/dashboard/crons/index.tsx`

- [ ] **Step 1: New file with header, button, modal mounts, table or empty branch**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { JSX } from 'react';
import { CronsTable } from '@/components/crons/crons-table';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { DeleteCronModal } from '@/components/modals/delete-cron-modal';
import { NewCronModal } from '@/components/modals/new-cron-modal';
import { CronsTableSkeleton } from '@/components/skeletons/crons-table-skeleton';
import { useCreateCron, useDeleteCron, usePauseCron, useResumeCron, useRunNowCron } from '@/lib/mutations';
import { useCrons, type CronApi } from '@/lib/use-crons';

export const Route = createFileRoute('/_authed/crons/')({
  component: CronsListScreen,
});

function CronsListScreen(): JSX.Element {
  const { data: crons, isLoading } = useCrons();
  const createCron = useCreateCron();
  const deleteCron = useDeleteCron();
  const pauseCron = usePauseCron();
  const resumeCron = useResumeCron();
  const runNow = useRunNowCron();

  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CronApi | null>(null);

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'crons', current: true }]} />
      <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-10 min-w-0">
        {/* Header with + NEW CRON button → setShowNew(true) */}
        {/* Body: skeleton / empty / table */}
        {isLoading || !crons ? (
          <CronsTableSkeleton />
        ) : crons.length === 0 ? (
          <CronsEmpty onNewCron={() => setShowNew(true)} />
        ) : (
          <CronsTable
            crons={crons}
            onPause={(id) => pauseCron.mutate(id)}
            onResume={(id) => resumeCron.mutate(id)}
            onRun={(id) => runNow.mutate(id)}
            onDelete={(cron) => setPendingDelete(cron)}
          />
        )}
      </div>
      <NewCronModal
        open={showNew}
        onOpenChange={setShowNew}
        onCreate={(input) => createCron.mutateAsync(input)}
      />
      <DeleteCronModal
        open={pendingDelete !== null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        cron={pendingDelete}
        onConfirm={() => {
          if (pendingDelete) deleteCron.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}

function CronsEmpty({ onNewCron }: { onNewCron: () => void }): JSX.Element {
  /* Port from apps/design's empty state on /dashboard/crons */
  return <div>{/* ... */}</div>;
}
```

- [ ] **Step 2: Typecheck + smoke** — open `/crons`, click `+ NEW CRON`, modal opens, URL stays `/crons`. Cancel → modal closes, URL unchanged. Submit empty data → optimistic add + toast.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/routes/_authed/crons.index.tsx
git commit -m "feat(dashboard): rebuild /crons with NewCron + DeleteCron modals (Phase 3)"
```

### Task 3.7: Rewrite `routes/_authed/crons.$id.tsx`

**Files:**
- Replace: `apps/dashboard/src/routes/_authed/crons.$id.tsx`
- Reference: `apps/design/src/routes/dashboard/crons/detail/index.tsx`

- [ ] **Step 1: Port detail view** — header (breadcrumb + name + description) + meta bar + action buttons (pause / run now) + prompt block + stats strip + run history.

```tsx
import { useCron } from '@/lib/use-cron';
import { useParams } from '@tanstack/react-router';

function CronDetailScreen() {
  const { id } = useParams({ from: '/_authed/crons/$id' });
  const { data, isLoading } = useCron(id);

  if (isLoading) return <CronDetailSkeleton />;
  if (!data) return <ErrorState title="cron not found" />;

  return (
    <>
      <DashboardTopstrip crumbs={[
        { label: 'crons', to: '/crons' },
        { label: data.cron.name, current: true },
      ]} />
      {/* port header, meta bar, action buttons, prompt block, stats strip, run history */}
    </>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add apps/dashboard/src/routes/_authed/crons.$id.tsx
git commit -m "feat(dashboard): rebuild /crons/$id detail (Phase 3)"
```

### Task 3.8: Delete `crons.new.tsx`

- [ ] **Step 1: Pre-check for any references**

```bash
grep -rn "/crons/new\|crons.new\|crons\.\$new" apps/dashboard/src
```

Expected: only `route-tree.gen.ts` (which auto-regenerates) — no actual links / Navigate calls / redirects from production code. If any production reference is found, replace with a navigation to `/crons` + open the modal (e.g. via search-param state or just `/crons` direct).

- [ ] **Step 2: Delete the file**

```bash
rm apps/dashboard/src/routes/_authed/crons.new.tsx
```

- [ ] **Step 3: Verify typecheck + build**

The dev server's TanStack Router plugin will regenerate `route-tree.gen.ts` without `/crons/new`.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/routes/_authed/crons.new.tsx apps/dashboard/src/route-tree.gen.ts
git commit -m "chore(dashboard): delete /crons/new route (modal handles creation)"
```

### Task 3.9: Phase 3 quality gate + smoke + visual verify

- [ ] **Step 1: Quality gate** (lint + typecheck + test + build)
- [ ] **Step 2: Smoke test cron CRUD end-to-end with api up**: create → run-now → pause → resume → delete. Each step shows correct optimistic update + toast.
- [ ] **Step 3: Visual verify** `/crons` and `/crons/$id` side-by-side with design.

---

## Phase 4 — Sessions (`/sessions`, `/sessions/$threadId`)

Goal: list with search filter; detail with full transcript including tool calls.

### Task 4.1–4.3: Port composites + skeleton

Same pattern as Phase 3:

- [ ] **Task 4.1**: Replace `components/sessions/session-row.tsx` (port from design's session list row)
- [ ] **Task 4.2**: Replace `components/sessions/message-block.tsx` + `components/sessions/tool-call-block.tsx` (port from design's transcript)
- [ ] **Task 4.3**: Replace `components/skeletons/sessions-table-skeleton.tsx` (renamed from `session-list-skeleton.tsx`); create `components/skeletons/session-transcript-skeleton.tsx`

Each task: read design source → port → typecheck → commit.

### Task 4.4: Rewrite `sessions.index.tsx`

**Files:**
- Replace: `apps/dashboard/src/routes/_authed/sessions.index.tsx`
- Reference: `apps/design/src/routes/dashboard/sessions/index.tsx`

- [ ] **Step 1**: Header + search input (filters by channel/msg/sess via `useState`) + table.

```tsx
const [query, setQuery] = useState('');
const filtered = !sessions ? [] :
  query.trim() === '' ? sessions :
  sessions.filter((s) => /* match channel || msg || sess */);
```

- [ ] **Step 2**: Empty branch + no-match branch.
- [ ] **Step 3**: Typecheck + commit.

### Task 4.5: Rewrite `sessions.$threadId.tsx`

**Files:**
- Replace: `apps/dashboard/src/routes/_authed/sessions.$threadId.tsx`
- Reference: `apps/design/src/routes/dashboard/sessions/detail/index.tsx`

- [ ] **Step 1**: Header (channel + thread + meta) + transcript with `<MessageRow>` and `<ToolBlock>` from `<MessageBlock>` / `<ToolCallBlock>`.
- [ ] **Step 2**: Typecheck + commit.

### Task 4.6: Phase 4 quality gate + smoke + visual

---

## Phase 5 — Logs (`/logs`)

Goal: level chips + search + range chips + log list + JSON expand + empty state.

### Task 5.1–5.6: Port composites + skeleton

- [ ] **5.1**: Replace `components/logs/log-row.tsx`
- [ ] **5.2**: Replace `components/logs/level-chips.tsx`
- [ ] **5.3**: Replace `components/logs/log-search-input.tsx`
- [ ] **5.4**: Replace `components/logs/log-json-block.tsx`
- [ ] **5.5**: Replace `components/logs/time-range-select.tsx` + `following-toggle.tsx`
- [ ] **5.6**: Replace `components/skeletons/log-list-skeleton.tsx`

### Task 5.7: Rewrite `routes/_authed/logs.tsx`

**Files:**
- Replace: `apps/dashboard/src/routes/_authed/logs.tsx`
- Reference: `apps/design/src/routes/dashboard/logs/index.tsx`

- [ ] **Step 1**: Filter row (level + search + range) + log list + footer (count, sse status from `useLogsStream`).
- [ ] **Step 2**: Empty branch with EXPAND TO 24H / CLEAR FILTERS CTAs (mutate the local filter state).
- [ ] **Step 3**: Typecheck + commit.

### Task 5.8: Phase 5 quality gate + smoke + visual

---

## Phase 6 — Settings (`/settings`)

Goal: 4 read-only sections + restart-worker modal (replaces restart-dialog, no countdown).

### Task 6.1: Build `<RestartWorkerModal>`

**Files:**
- Create: `apps/dashboard/src/components/modals/restart-worker-modal.tsx`
- Reference: `apps/design/src/components/modals/restart-worker-modal.tsx`

- [ ] **Step 1**: Port the modal (Dialog with corner brackets gold, title, impact list, CANCEL / RESTART WORKER buttons). **No countdown** — clicking RESTART WORKER fires `onConfirm` immediately and closes.

- [ ] **Step 2**: Typecheck + commit.

### Task 6.2: Replace settings sub-components

- [ ] **6.2.1**: `components/settings/backend-card.tsx`
- [ ] **6.2.2**: `components/settings/mcp-server-row.tsx`
- [ ] **6.2.3**: `components/settings/profile-file-row.tsx`
- [ ] **6.2.4**: `components/settings/about-row.tsx`
- [ ] **6.2.5**: `components/skeletons/settings-section-skeleton.tsx` (renamed from `settings-skeleton.tsx`)

Each task: read design, port, typecheck, commit.

### Task 6.3: Rewrite `routes/_authed/settings.tsx`

**Files:**
- Replace: `apps/dashboard/src/routes/_authed/settings.tsx`
- Reference: `apps/design/src/routes/dashboard/settings/index.tsx`

- [ ] **Step 1**: Header (system / settings / helper text) + RESTART WORKER button (opens modal) + 4 sections (backend / mcp / profile files / about).

```tsx
const [showRestart, setShowRestart] = useState(false);
const restartWorker = useRestartWorker();

// in JSX
<RestartWorkerModal
  open={showRestart}
  onOpenChange={setShowRestart}
  onConfirm={() => {
    restartWorker.mutate();
    setShowRestart(false);
  }}
/>
```

- [ ] **Step 2**: Delete `apps/dashboard/src/components/settings/restart-dialog.tsx`.
- [ ] **Step 3**: Typecheck + commit.

### Task 6.4: Phase 6 quality gate + smoke + visual

---

## Phase 7 — Login (`/login`)

Goal: visual alignment with design (likely small adjustments — login already has Imperial Terminal styling).

### Task 7.1: Visual diff + small adjustments

**Files:**
- Modify: `apps/dashboard/src/routes/login.tsx`
- Reference: `apps/design/src/routes/dashboard/login/index.tsx`

- [ ] **Step 1**: Side-by-side comparison. Note any differences (typography, spacing, terminal sequence presence/absence).
- [ ] **Step 2**: Apply minimum-needed changes to match. Decide on the terminal-sequence animation (open question 3 from spec): keep if it doesn't fight design match, drop if it does.
- [ ] **Step 3**: Update `tests/routes/login.test.tsx` if any DOM assertions changed.
- [ ] **Step 4**: Typecheck + commit.

### Task 7.2: Phase 7 quality gate + smoke + visual

---

## Final — End-to-end pass

### Task F.1: Full quality gate

```bash
pnpm --filter @zeno/dashboard lint && \
pnpm --filter @zeno/dashboard typecheck && \
pnpm --filter @zeno/dashboard test && \
pnpm --filter @zeno/dashboard build
```

All green.

### Task F.2: Full visual smoke

Open dashboard at every route. Compare with corresponding design route:

| Dashboard | Design |
|---|---|
| `/` | `/dashboard/home` |
| `/` (with empty data) | `/dashboard/home/empty` |
| `/crons` | `/dashboard/crons` |
| `/crons/$id` | `/dashboard/crons/detail` |
| `/sessions` | `/dashboard/sessions` |
| `/sessions/$threadId` | `/dashboard/sessions/detail` |
| `/logs` | `/dashboard/logs` |
| `/settings` | `/dashboard/settings` |
| `/login` | `/dashboard/login` |

Console clean across the board.

### Task F.3: `apps/design` regression check

Open every design route, scroll, eye-diff with screenshots taken at start of this work. No regressions (design wasn't supposed to change).

### Task F.4: Mark spec shipped

- [ ] **Step 1**: Update `context/specs/2026-04-26-dashboard-visual-rebuild/spec.md` frontmatter:
```yaml
status: shipped
shipped: <today's ISO date>
```
- [ ] **Step 2**: Commit `spec(0031): mark shipped`.

### Task F.5: Open PR via `/open-pr`

Title: `feat(dashboard): rebuild every page to match apps/design (spec 0031)`. Target: `main`.

---

## Done

When every checkbox is ticked, `apps/dashboard` visually matches `apps/design` across every implemented surface, with the existing data layer preserved and new modals replacing the old restart-dialog and crons.new route.
