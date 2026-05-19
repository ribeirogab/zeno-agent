---
feature: dashboard-ux-cleanup
plan: "[[plan-dashboard-ux-cleanup]]"
spec: "[[spec-dashboard-ux-cleanup]]"
created: 2026-04-16
---
# Dashboard UX Cleanup — Tasks

**For this plan:** `[[plan-dashboard-ux-cleanup]]`

> **Conventions for every task:**
> - Absolute paths from project root.
> - Temp files under `tmp/` per `context/rules/generated-files-location.md`.
> - **Never use `any`. Never write `// biome-ignore`.** Refactor instead.
> - Each task ends with `git add <files> + git commit -m "..."`. English conventional commits, no AI attribution.
> - Tasks are independent; a fresh subagent can execute any one given only `tasks.md` + the spec + branch state.
> - **Prerequisites:** Specs 0015 (kebab-case) and 0016 (`@zeno/ui` package) must be merged. Spec 0017 (Paper design system) must be at least through Phase 3 (Primitives) so the `DESIGN.md` Primitives table exists.

---

## Phase 1 — Paper frames for new primitives

### Task 1.1: Draw 4 new primitive frames + extend registry

**Files:**
- Modify: `packages/ui/DESIGN.md`
- Paper: 4 new frames under the existing "02. Primitives" section

- [ ] **Step 1: Create branch**

```bash
git checkout -b feat/dashboard-ux-cleanup
```

- [ ] **Step 2: Load Paper guide (once per session)**

Call `mcp__plugin_paper-desktop_paper__get_guide({ topic: "paper-mcp-instructions" })`.

- [ ] **Step 3: Draw `AlertDialog` frame**

Name: `AlertDialog`. Size: 800 × 400. Content: one AlertDialog rendered at typical size (~480 × 220) — layout mirrors `Dialog` but with destructive emphasis:

- Overlay + container (same as Dialog — `bg-panel`, radius 12, p-8)
- Header: title ("remover este cron?", Instrument Serif 2xl), description ("\"morning-pr\" será removido. essa ação não pode ser desfeita.", text-secondary)
- Footer: `[Cancel (ghost)]`  `[Action (accent — coral "remover")]` right-aligned with 12px gap

Annotate with a callout: "use variant=accent on the destructive action".

- [ ] **Step 4: Draw `Skeleton` frame**

Name: `Skeleton`. Size: 600 × 400. Four examples on the canvas (labeled):

- Text line — `h-4 w-32`
- Row — `h-12 w-full`
- Stat tile — `h-24 w-72`
- Large block — `h-48 w-full`

Each rendered as a pulsing `bg-panel` rectangle (the primitive itself uses `animate-pulse`). Annotate once with "CSS-only pulse, aria-busy=true".

- [ ] **Step 5: Draw `EmptyState` frame**

Name: `EmptyState`. Size: 600 × 320. Content:

- Centered column, 400 wide
- Title: "nenhum cron ainda" (Inter SemiBold 15, text-primary)
- Description: "crie seu primeiro agendamento para automatizar o Zeno." (Inter Regular 13, text-tertiary, max-w-xs centered)
- Action slot below: Button variant=accent label "novo cron"

- [ ] **Step 6: Draw `ErrorState` frame**

Name: `ErrorState`. Size: 600 × 280. Content:

- Centered column
- Title: "algo deu errado" (Inter SemiBold 15, status-failed)
- Description: "não foi possível carregar os dados. tenta de novo?" (Inter Regular 13, text-tertiary)
- Retry: Button variant=ghost size=sm "tentar de novo"

- [ ] **Step 7: Update `packages/ui/DESIGN.md`**

In the **Primitives** table, add four rows:

```markdown
| AlertDialog | `packages/ui/src/components/alert-dialog.tsx` | https://app.paper.design/file/<FILE_ID>/<ALERT_DIALOG_FRAME_ID> |
| Skeleton | `packages/ui/src/components/skeleton.tsx` | https://app.paper.design/file/<FILE_ID>/<SKELETON_FRAME_ID> |
| EmptyState | `packages/ui/src/components/empty-state.tsx` | https://app.paper.design/file/<FILE_ID>/<EMPTY_FRAME_ID> |
| ErrorState | `packages/ui/src/components/error-state.tsx` | https://app.paper.design/file/<FILE_ID>/<ERROR_FRAME_ID> |
```

- [ ] **Step 8: `finish_working_on_nodes` + commit**

```bash
git add packages/ui/DESIGN.md
git commit -m "docs(ui): Paper frames for AlertDialog / Skeleton / EmptyState / ErrorState"
```

---

## Phase 2 — Add primitives to @zeno/ui

### Task 2.1: Install Radix alert-dialog + `AlertDialog` primitive (TDD)

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/src/components/alert-dialog.tsx`
- Modify: `packages/ui/src/index.ts`
- Create: `packages/ui/tests/alert-dialog.test.tsx`

- [ ] **Step 1: Install the dep**

```bash
pnpm add @radix-ui/react-alert-dialog@^1.1.15 --filter @zeno/ui
```

Verify `packages/ui/package.json` now has:

```json
"@radix-ui/react-alert-dialog": "^1.1.15"
```

- [ ] **Step 2: Write the failing test**

`packages/ui/tests/alert-dialog.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '../src/index.js';

function DestructiveModal({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>remover?</AlertDialogTitle>
          <AlertDialogDescription>não pode desfazer.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">cancelar</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="accent" onClick={onConfirm}>
              remover
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe('AlertDialog', () => {
  it('renders only the trigger initially', () => {
    render(<DestructiveModal onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined();
    expect(screen.queryByText('remover?')).toBeNull();
  });

  it('opens on trigger click and shows title + description', async () => {
    const user = userEvent.setup();
    render(<DestructiveModal onConfirm={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('remover?')).toBeDefined();
    expect(screen.getByText('não pode desfazer.')).toBeDefined();
  });

  it('calls onConfirm when the accent action is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DestructiveModal onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'remover' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes without calling onConfirm on cancel', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DestructiveModal onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'cancelar' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
pnpm --filter @zeno/ui run test
```

Expected: module-not-found.

- [ ] **Step 4: Implement `packages/ui/src/components/alert-dialog.tsx`**

```typescript
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import type { ComponentPropsWithoutRef, ElementRef, JSX, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from '../utils';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export const AlertDialogOverlay = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(function AlertDialogOverlay({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-40 bg-black/60 backdrop-blur-sm', className)}
      {...props}
    />
  );
});

export const AlertDialogContent = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & { children: ReactNode }
>(function AlertDialogContent({ className, children, ...props }, ref) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl border border-border-subtle bg-panel p-8 shadow-lg',
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
});

export function AlertDialogHeader({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

export const AlertDialogTitle = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn('font-serif text-2xl leading-tight text-text-primary', className)}
      {...props}
    />
  );
});

export const AlertDialogDescription = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(function AlertDialogDescription({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-text-secondary', className)}
      {...props}
    />
  );
});

export function AlertDialogFooter({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex justify-end gap-3">{children}</div>;
}
```

- [ ] **Step 5: Extend barrel `packages/ui/src/index.ts`**

Append:

```typescript
export * from './components/alert-dialog';
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
pnpm --filter @zeno/ui run test
```

Expected: 4 new `AlertDialog` tests pass + existing smoke still green.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/alert-dialog.tsx packages/ui/src/index.ts packages/ui/tests/alert-dialog.test.tsx packages/ui/package.json pnpm-lock.yaml
git commit -m "feat(ui): AlertDialog primitive via @radix-ui/react-alert-dialog (TDD)"
```

---

### Task 2.2: `Skeleton`, `EmptyState`, `ErrorState` (smoke tests)

**Files:**
- Create: `packages/ui/src/components/skeleton.tsx`
- Create: `packages/ui/src/components/empty-state.tsx`
- Create: `packages/ui/src/components/error-state.tsx`
- Modify: `packages/ui/src/index.ts`
- Create: `packages/ui/tests/states.test.tsx`

- [ ] **Step 1: Write `skeleton.tsx`**

```typescript
import type { JSX } from 'react';
import { cn } from '../utils';

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-panel', className)}
      aria-busy="true"
      aria-live="polite"
    />
  );
}
```

- [ ] **Step 2: Write `empty-state.tsx`**

```typescript
import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="text-sm font-medium text-text-primary">{title}</span>
      {description ? (
        <span className="max-w-xs text-xs leading-5 text-text-tertiary">{description}</span>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 3: Write `error-state.tsx`**

```typescript
import type { JSX } from 'react';
import { Button } from './button';
import { cn } from '../utils';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'algo deu errado',
  description,
  onRetry,
  className,
}: ErrorStateProps): JSX.Element {
  return (
    <div
      className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}
    >
      <span className="text-sm font-medium text-status-failed">{title}</span>
      {description ? (
        <span className="max-w-xs text-xs leading-5 text-text-tertiary">{description}</span>
      ) : null}
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry} className="mt-4">
          tentar de novo
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Extend `packages/ui/src/index.ts`**

```typescript
export * from './components/alert-dialog';
export * from './components/button';
export * from './components/dialog';
export * from './components/empty-state';
export * from './components/error-state';
export * from './components/input';
export * from './components/skeleton';
export * from './components/sonner';
export { cn } from './utils';
```

- [ ] **Step 5: Write smoke tests**

`packages/ui/tests/states.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState, Skeleton } from '../src/index.js';

describe('Skeleton', () => {
  it('renders with aria-busy', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const node = container.firstChild as HTMLElement;
    expect(node.getAttribute('aria-busy')).toBe('true');
    expect(node.className).toContain('animate-pulse');
    expect(node.className).toContain('h-4');
  });
});

describe('EmptyState', () => {
  it('renders title and optional description + action', () => {
    render(
      <EmptyState
        title="nada por aqui"
        description="crie seu primeiro item."
        action={<button type="button">novo</button>}
      />,
    );
    expect(screen.getByText('nada por aqui')).toBeDefined();
    expect(screen.getByText('crie seu primeiro item.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'novo' })).toBeDefined();
  });

  it('omits description and action when not provided', () => {
    render(<EmptyState title="só o título" />);
    expect(screen.getByText('só o título')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('uses default title "algo deu errado"', () => {
    render(<ErrorState />);
    expect(screen.getByText('algo deu errado')).toBeDefined();
  });

  it('calls onRetry when the button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits retry button when onRetry is absent', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @zeno/ui run test
```

Expected: all previous + 7 new tests passing.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/skeleton.tsx packages/ui/src/components/empty-state.tsx packages/ui/src/components/error-state.tsx packages/ui/src/index.ts packages/ui/tests/states.test.tsx
git commit -m "feat(ui): Skeleton / EmptyState / ErrorState primitives with smoke tests"
```

---

## Phase 3 — Refactor cron-actions

### Task 3.1: Replace `window.confirm` with `AlertDialog`

**Files:**
- Modify: `apps/dashboard/src/components/crons/cron-actions.tsx`

- [ ] **Step 1: Rewrite `cron-actions.tsx`**

```typescript
import { useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@zeno/ui';
import {
  useDeleteCron,
  usePauseCron,
  useResumeCron,
  useRunNowCron,
} from '@/lib/mutations';
import type { CronApi } from '@/lib/use-crons';

export function CronActions({ cron }: { cron: CronApi }): JSX.Element {
  const pause = usePauseCron();
  const resume = useResumeCron();
  const runNow = useRunNowCron();
  const deleteCron = useDeleteCron();
  const navigate = useNavigate();

  const onDelete = (): void => {
    deleteCron.mutate(cron.id, {
      onSuccess: () => {
        void navigate({ to: '/crons' });
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="accent"
        size="sm"
        disabled={runNow.isPending || !cron.enabled}
        onClick={() => runNow.mutate(cron.id)}
      >
        ▶ Run now
      </Button>
      {cron.enabled ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pause.isPending}
          onClick={() => pause.mutate(cron.id)}
        >
          Pause
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={resume.isPending}
          onClick={() => resume.mutate(cron.id)}
        >
          Resume
        </Button>
      )}
      {cron.source === 'chat' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={deleteCron.isPending}>
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>remover este cron?</AlertDialogTitle>
              <AlertDialogDescription>
                {`"${cron.name}" será removido. essa ação não pode ser desfeita.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="ghost">cancelar</Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button variant="accent" onClick={onDelete}>
                  remover
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no `window.confirm` remains**

```bash
grep -rn 'window\.\(confirm\|alert\|prompt\)' apps/ packages/
```

Expected: empty output.

- [ ] **Step 3: Quality-gate**

```bash
pnpm run quality-gate
```

Expected: green.

- [ ] **Step 4: Docker smoke — cron delete flow**

```bash
pnpm run docker:build
pnpm run docker:up
sleep 8
```

Use Playwright MCP:
1. Navigate to `/crons/<id>` where source=chat
2. Click `Delete` — dark AlertDialog appears (not browser modal)
3. Screenshot `tmp/.playwright-mcp/alert-dialog-open.png`
4. Click `cancelar` — dialog closes, no mutation
5. Click `Delete` again → `remover` — redirect to `/crons`, toast "cron removido" appears

```bash
pnpm run docker:down
```

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/crons/cron-actions.tsx
git commit -m "refactor(dashboard): replace window.confirm with AlertDialog on cron delete"
```

---

## Phase 4 — Refactor loading / empty / error states

### Task 4.1: Compose feature-level skeletons

**Files:**
- Create: `apps/dashboard/src/components/skeletons/cron-list-skeleton.tsx`
- Create: `apps/dashboard/src/components/skeletons/log-list-skeleton.tsx`
- Create: `apps/dashboard/src/components/skeletons/session-list-skeleton.tsx`
- Create: `apps/dashboard/src/components/skeletons/settings-skeleton.tsx`
- Create: `apps/dashboard/src/components/skeletons/home-skeleton.tsx`

- [ ] **Step 1: `cron-list-skeleton.tsx`**

```typescript
import type { JSX } from 'react';
import { Skeleton } from '@zeno/ui';

export function CronListSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-px">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: order is stable, list never reorders
          key={index}
          className="flex h-12 items-center gap-6 border-b border-panel px-0 py-3"
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
```

**Wait — the standing rule forbids `biome-ignore`.** Rewrite without the suppression using a stable key:

```typescript
import type { JSX } from 'react';
import { Skeleton } from '@zeno/ui';

const ROW_KEYS = ['skeleton-row-0', 'skeleton-row-1', 'skeleton-row-2', 'skeleton-row-3', 'skeleton-row-4'];

export function CronListSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-px">
      {ROW_KEYS.map((key) => (
        <div key={key} className="flex h-12 items-center gap-6 border-b border-panel px-0 py-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
```

(Same pattern applies to every skeleton below — define a `ROW_KEYS` constant, iterate it.)

- [ ] **Step 2: `log-list-skeleton.tsx`**

```typescript
import type { JSX } from 'react';
import { Skeleton } from '@zeno/ui';

const ROW_KEYS = Array.from({ length: 8 }, (_, index) => `log-skeleton-${index}`);

export function LogListSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-px">
      {ROW_KEYS.map((key) => (
        <div key={key} className="flex h-10 items-center gap-4 border-b border-panel py-2">
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `session-list-skeleton.tsx`**

```typescript
import type { JSX } from 'react';
import { Skeleton } from '@zeno/ui';

const ROW_KEYS = Array.from({ length: 5 }, (_, index) => `session-skeleton-${index}`);

export function SessionListSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-px">
      {ROW_KEYS.map((key) => (
        <div key={key} className="flex h-14 items-center gap-6 border-b border-panel py-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `settings-skeleton.tsx`**

```typescript
import type { JSX } from 'react';
import { Skeleton } from '@zeno/ui';

const PANEL_KEYS = ['backend', 'mcp', 'profile', 'shutdown'];

export function SettingsSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      {PANEL_KEYS.map((key) => (
        <section key={key} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-24 w-full" />
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: `home-skeleton.tsx`**

```typescript
import type { JSX } from 'react';
import { Skeleton } from '@zeno/ui';

const STAT_KEYS = ['stat-1', 'stat-2', 'stat-3'];
const ACTIVITY_KEYS = Array.from({ length: 5 }, (_, index) => `activity-${index}`);

export function HomeSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-4">
        {STAT_KEYS.map((key) => (
          <Skeleton key={key} className="h-24 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-px">
        {ACTIVITY_KEYS.map((key) => (
          <div key={key} className="flex h-12 items-center gap-4 border-b border-panel py-3">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/components/skeletons/
git commit -m "feat(dashboard): composed skeletons for cron/log/session/home/settings"
```

---

### Task 4.2: Refactor every route that rendered "carregando…"

**Files:** (see per-step)

For each route, replace the raw `<span>carregando…</span>` (and any sibling error/empty patterns) with the appropriate skeleton/state. Preserve all existing behavior (query hooks, conditional rendering logic); only swap presentational layer.

- [ ] **Step 1: `apps/dashboard/src/routes/_authed/crons.index.tsx`**

Replace the loading/empty sections. Snippet (adapt to the current file structure):

```typescript
import { EmptyState, Button } from '@zeno/ui';
import { CronListSkeleton } from '@/components/skeletons/cron-list-skeleton';
import { Link } from '@tanstack/react-router';

// inside the list section:
{crons.isLoading ? (
  <CronListSkeleton />
) : crons.data && crons.data.length === 0 ? (
  <EmptyState
    title="nenhum cron ainda"
    description="crie seu primeiro agendamento para automatizar o Zeno."
    action={
      <Link to="/crons/new">
        <Button variant="accent" size="sm">novo cron</Button>
      </Link>
    }
  />
) : (
  crons.data?.map((cron) => <CronRow key={cron.id} cron={cron} />)
)}
```

Remove the old `{crons.isLoading && <span ...>carregando…</span>}` line.

- [ ] **Step 2: `apps/dashboard/src/routes/_authed/crons.$id.tsx`**

Replace loading + error blocks:

```typescript
import { ErrorState } from '@zeno/ui';
import { Skeleton } from '@zeno/ui';

if (query.isLoading) {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
if (query.isError || !query.data) {
  return <ErrorState onRetry={() => void query.refetch()} />;
}
```

Drop the old `<span>carregando…</span>` + inline error text.

- [ ] **Step 3: `apps/dashboard/src/routes/_authed/sessions.index.tsx`**

```typescript
import { EmptyState } from '@zeno/ui';
import { SessionListSkeleton } from '@/components/skeletons/session-list-skeleton';

{q.isLoading ? (
  <SessionListSkeleton />
) : q.data && q.data.length === 0 ? (
  <EmptyState title="nenhuma sessão ainda" description="converse com o Zeno pelo Slack para começar." />
) : (
  q.data?.map((s) => <SessionRow key={s.threadId} session={s} />)
)}
```

- [ ] **Step 4: `apps/dashboard/src/routes/_authed/sessions.$threadId.tsx`**

```typescript
import { ErrorState, Skeleton } from '@zeno/ui';

if (q.isLoading) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-80" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
if (q.isError || !q.data) {
  return <ErrorState onRetry={() => void q.refetch()} />;
}
```

- [ ] **Step 5: `apps/dashboard/src/routes/_authed/settings.tsx`**

```typescript
import { SettingsSkeleton } from '@/components/skeletons/settings-skeleton';

if (q.isLoading || !q.data) {
  return <SettingsSkeleton />;
}
```

- [ ] **Step 6: `apps/dashboard/src/routes/_authed/index.tsx` (Home)**

Replace the inline `carregando…` under Activity with a component-level Skeleton, and add ErrorState for activity fetch failure:

```typescript
import { ErrorState } from '@zeno/ui';
import { HomeSkeleton } from '@/components/skeletons/home-skeleton';

// if all three queries are loading → HomeSkeleton
if (stats.isLoading && activity.isLoading) {
  return <HomeSkeleton />;
}

// inside the Activity section:
{activity.isLoading ? (
  <HomeSkeleton />
) : activity.isError ? (
  <ErrorState description="falhou ao carregar atividade recente." onRetry={() => void activity.refetch()} />
) : (
  activity.data?.map((a) => <ActivityRow key={a.id} item={a} />)
)}
```

Adapt the exact structure to current file layout; the goal is no raw `<span>carregando…</span>` left.

- [ ] **Step 7: `apps/dashboard/src/routes/_authed/logs.tsx`**

Replace the three inline branches:

```typescript
import { EmptyState, ErrorState } from '@zeno/ui';
import { LogListSkeleton } from '@/components/skeletons/log-list-skeleton';

// inside <section>:
{!following && historical.isLoading && <LogListSkeleton />}
{!following && historical.isError && (
  <ErrorState onRetry={() => void historical.refetch()} />
)}
{logs.length === 0 && !historical.isLoading && !historical.isError && (
  <EmptyState title="sem resultados nos filtros atuais" />
)}
{logs.map((l) => (
  <LogRow key={l.id} log={l} />
))}
```

Keep the `&& !following` guards where they exist today — the follow mode has its own semantics.

- [ ] **Step 8: `apps/dashboard/src/lib/home-subtitle.ts`**

Change:

```typescript
if (!stats) return 'Carregando…';
```

to:

```typescript
if (!stats) return '';
```

Ensure `apps/dashboard/src/routes/_authed/index.tsx` uses the subtitle in a way that a skeleton already handles the loading state. If the subtitle line is rendered as plain text, guard with:

```typescript
{subtitle ? <p className="text-sm text-text-secondary">{subtitle}</p> : <Skeleton className="h-4 w-40" />}
```

- [ ] **Step 9: Verify no raw "carregando" remains**

```bash
grep -rn '>carregando' apps/dashboard/src/
grep -rn "'Carregando" apps/dashboard/src/
```

Both expected: empty.

- [ ] **Step 10: Quality-gate**

```bash
pnpm run quality-gate
```

Expected: green.

- [ ] **Step 11: Commit**

```bash
git add apps/dashboard/src/
git commit -m "refactor(dashboard): skeletons + empty/error states replace raw carregando spans"
```

---

## Phase 5 — Audit + Docker smoke + PR

### Task 5.1: Audit script + full route walk

**Files:**
- Create: `tmp/audit-porco-ux.sh` (disposable)

- [ ] **Step 1: Write audit script**

`tmp/audit-porco-ux.sh`:

```bash
#!/usr/bin/env bash
set -u

echo "== native browser modals =="
grep -rnE 'window\.(confirm|alert|prompt)\(' apps/ packages/ || echo "(none)"

echo ""
echo "== raw 'carregando' spans =="
grep -rn '>carregando' apps/dashboard/src/ || echo "(none)"

echo ""
echo "== raw 'Carregando' strings =="
grep -rn "'Carregando" apps/dashboard/src/ || echo "(none)"

echo ""
echo "== inline error text (no ErrorState) =="
grep -rnE 'text-status-failed' apps/dashboard/src/routes/ || echo "(none)"
```

- [ ] **Step 2: Run**

```bash
chmod +x tmp/audit-porco-ux.sh
./tmp/audit-porco-ux.sh
```

Expected: first three sections print `(none)`. The fourth section may print `<ErrorState>` call sites — that's fine, it's the replacement, not drift. Skim to confirm no raw inline error text remains.

- [ ] **Step 3: Rebuild + boot**

```bash
pnpm run docker:build
pnpm run docker:up
sleep 8
pnpm run docker:logs 2>&1 | grep -E 'zeno_online|api_listening|commands_poller_started|logs_retention_scheduled'
```

Expected: all four startup lines present.

- [ ] **Step 4: Playwright route walk**

Navigate and screenshot each route to `tmp/.playwright-mcp/ux-cleanup-<route>.png`. For each, verify:

- Initial load shows a skeleton (pulsing panel blocks) for >~100ms, then real content — no raw "carregando…" anywhere.
- Empty dataset (e.g. filter `/logs?q=nonsensical` or a fresh DB with no sessions) shows `EmptyState` — not a blank list and not a plain sentence.
- Error — temporarily break an endpoint (e.g. stop the worker while dashboard is open; force a refetch) and confirm `ErrorState` appears with a retry button that, when clicked, retries.

Routes to walk: `/`, `/crons`, `/crons/<id>`, `/sessions`, `/sessions/<thread-id>`, `/logs`, `/settings`.

- [ ] **Step 5: Cron delete flow (end-to-end)**

On `/crons/<id>` with source=chat:
1. Click Delete → AlertDialog opens
2. Click Esc → dialog closes
3. Click Delete again → `remover` → redirect + toast

Screenshot `tmp/.playwright-mcp/alert-dialog-interaction.png`.

- [ ] **Step 6: Stop**

```bash
pnpm run docker:down
```

- [ ] **Step 7: Clean up audit script**

```bash
rm -f tmp/audit-porco-ux.sh
```

(`tmp/` is gitignored.)

- [ ] **Step 8: Push + open PR**

```bash
git push -u origin feat/dashboard-ux-cleanup
```

Invoke `/open-pr`. Title: `refactor(dashboard): replace native confirm + carregando spans with proper primitives`

Description:
- 4 new primitives in `@zeno/ui`: AlertDialog, Skeleton, EmptyState, ErrorState
- Paper frames + registry rows for all 4 (done in Phase 1)
- `window.confirm` gone; `<span>carregando…</span>` gone
- 8 call sites refactored to use Skeleton/EmptyState/ErrorState
- Quality-gate green; Docker smoke walked every route
- Closes the "dashboard feels like a prototype" UX debt

Do NOT merge — user reviews.

---

## Done

Spec 0018 closed. The dashboard looks intentional: destructive actions get AlertDialog, loading gets Skeletons sized to real content, empty and error states are centralized. `@zeno/ui` has the 4 additional primitives the rest of the product will lean on for future features.
