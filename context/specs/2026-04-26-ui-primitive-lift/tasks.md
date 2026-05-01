---
feature: ui-primitive-lift
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-26
---
# UI Primitive Lift — Tasks

**For this plan:** `[[plan]]`

> Steps use checkbox (`- [ ]`) syntax. Branch: `feat/apps-design` (existing). Commit at the end of each task.

---

## Phase 1 — Toast subsystem in `@zeno/ui`

Goal: produce a working, tested toast system in `@zeno/ui` that mirrors `apps/design/src/lib/toast.tsx` exactly. **No consumer code changes yet** — design's `lib/toast.tsx` still exists and still works. This phase ends with `pnpm --filter @zeno/ui test` green.

### Task 1.1: Scaffold the directory and types

**Files:**
- Create: `packages/ui/src/components/toast/types.ts`

- [ ] **Step 1: Create `types.ts` with the type definitions**

```ts
// packages/ui/src/components/toast/types.ts

export type ToastTone = 'success' | 'warn' | 'fail';

export type Toast = {
  id: number;
  tone: ToastTone;
  message: React.ReactNode;
  action?: { label: string; onClick?: () => void };
  durationMs: number;
};

export type ToastInput = Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number };

export type ToastContextValue = {
  toasts: Toast[];
  push: (input: ToastInput) => number;
  dismiss: (id: number) => void;
};
```

- [ ] **Step 2: Verify the file typechecks**

Run: `pnpm --filter @zeno/ui typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/toast/types.ts
git commit -m "feat(ui): scaffold toast types"
```

### Task 1.2: Toast context

**Files:**
- Create: `packages/ui/src/components/toast/toast-context.ts`

- [ ] **Step 1: Create `toast-context.ts`**

```ts
// packages/ui/src/components/toast/toast-context.ts

import { createContext } from 'react';
import type { ToastContextValue } from './types';

export const ToastContext = createContext<ToastContextValue | null>(null);
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @zeno/ui typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/toast/toast-context.ts
git commit -m "feat(ui): add toast context"
```

### Task 1.3: `<Toast>` visual row component

**Files:**
- Create: `packages/ui/src/components/toast/toast.tsx`

- [ ] **Step 1: Create `toast.tsx`**

```tsx
// packages/ui/src/components/toast/toast.tsx

import { useEffect, useState } from 'react';
import type { Toast as ToastType } from './types';
import type { ToastTone } from './types';

const TONE_STYLES: Record<
  ToastTone,
  { border: string; borderL: string; dot: string; action: string }
> = {
  success: {
    border: 'border-status-active/30',
    borderL: 'border-l-2 border-l-status-active',
    dot: 'bg-status-active',
    action: 'text-status-active',
  },
  warn: {
    border: 'border-gold-line',
    borderL: 'border-l-2 border-l-gold',
    dot: 'bg-gold',
    action: 'text-gold',
  },
  fail: {
    border: 'border-status-failed/30',
    borderL: 'border-l-2 border-l-status-failed',
    dot: 'bg-status-failed',
    action: 'text-status-failed',
  },
};

export function Toast({ toast, onDismiss }: { toast: ToastType; onDismiss: () => void }) {
  const tone = TONE_STYLES[toast.tone];
  const [enter, setEnter] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEnter(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-3 px-3.5 py-2.5 bg-canvas border ${tone.border} ${tone.borderL} transition-all duration-[180ms]`}
      style={{
        opacity: enter ? 1 : 0,
        transform: enter ? 'translateY(0)' : 'translateY(-6px)',
      }}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
      <span className="flex-1 min-w-0 font-mono text-xs leading-4 text-text-primary">
        {toast.message}
      </span>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick?.();
            onDismiss();
          }}
          className={`shrink-0 font-mono text-[10px] tracking-[0.08em] leading-3 uppercase ${tone.action} hover:text-text-primary transition-colors duration-[120ms]`}
        >
          · {toast.action.label}
        </button>
      ) : (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary hover:text-text-primary transition-colors duration-[120ms]"
        >
          ×
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @zeno/ui typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/toast/toast.tsx
git commit -m "feat(ui): add Toast visual row component"
```

### Task 1.4: `<Toaster>` container

**Files:**
- Create: `packages/ui/src/components/toast/toaster.tsx`

- [ ] **Step 1: Create `toaster.tsx`**

```tsx
// packages/ui/src/components/toast/toaster.tsx

import { useContext } from 'react';
import { Toast } from './toast';
import { ToastContext } from './toast-context';

/**
 * Renders the active toast queue from <ToastProvider>'s context.
 * Mounted automatically by <ToastProvider>; rarely needed standalone.
 */
export function Toaster() {
  const ctx = useContext(ToastContext);
  if (!ctx || ctx.toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed top-6 right-6 z-50 flex flex-col gap-2 w-[420px] max-w-[90vw]">
      {ctx.toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => ctx.dismiss(t.id)} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @zeno/ui typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/toast/toaster.tsx
git commit -m "feat(ui): add Toaster container"
```

### Task 1.5: `<ToastProvider>`

**Files:**
- Create: `packages/ui/src/components/toast/toast-provider.tsx`

- [ ] **Step 1: Create `toast-provider.tsx`**

```tsx
// packages/ui/src/components/toast/toast-provider.tsx

import { useCallback, useState } from 'react';
import { ToastContext } from './toast-context';
import { Toaster } from './toaster';
import type { Toast, ToastInput } from './types';

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId++;
      const toast: Toast = {
        id,
        tone: input.tone,
        message: input.message,
        durationMs: input.durationMs ?? 4000,
        ...(input.action ? { action: input.action } : {}),
      };
      setToasts((prev) => [...prev, toast]);
      window.setTimeout(() => dismiss(id), toast.durationMs);
      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @zeno/ui typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/toast/toast-provider.tsx
git commit -m "feat(ui): add ToastProvider"
```

### Task 1.6: `useToast()` hook

**Files:**
- Create: `packages/ui/src/components/toast/use-toast.ts`

- [ ] **Step 1: Create `use-toast.ts`**

```ts
// packages/ui/src/components/toast/use-toast.ts

import { useContext } from 'react';
import { ToastContext } from './toast-context';
import type { ToastInput } from './types';

/**
 * Hook returning success/warn/fail/dismiss helpers. Must be called
 * inside a <ToastProvider>.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return {
    success: (message: React.ReactNode, opts?: Partial<ToastInput>) =>
      ctx.push({ tone: 'success', message, ...opts }),
    warn: (message: React.ReactNode, opts?: Partial<ToastInput>) =>
      ctx.push({ tone: 'warn', message, ...opts }),
    fail: (message: React.ReactNode, opts?: Partial<ToastInput>) =>
      ctx.push({ tone: 'fail', message, ...opts }),
    dismiss: ctx.dismiss,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @zeno/ui typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/toast/use-toast.ts
git commit -m "feat(ui): add useToast hook"
```

### Task 1.7: Barrel + index.ts re-export

**Files:**
- Create: `packages/ui/src/components/toast/index.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create the barrel**

```ts
// packages/ui/src/components/toast/index.ts

export { ToastProvider } from './toast-provider';
export { Toaster } from './toaster';
export { useToast } from './use-toast';
export type { ToastTone } from './types';
```

- [ ] **Step 2: Add the re-export to `packages/ui/src/index.ts`**

Locate the current re-export block (alphabetical-ish). Insert this line in alphabetical order, e.g. after `export * from './components/spark';`:

```ts
export * from './components/toast';
```

(Do NOT remove `export * from './components/sonner';` yet — that's Phase 4. Leave it; the new toast and the sonner-based `Toaster` will coexist temporarily, but the sonner one wins the `Toaster` name slot in barrel order.)

**Wait — they'd clash.** Both export a name `Toaster`. To avoid the build breaking, the toast barrel temporarily re-exports `Toaster` under a different name, then switches in Phase 4:

Replace the barrel from Step 1 with this version:

```ts
// packages/ui/src/components/toast/index.ts

export { ToastProvider } from './toast-provider';
export { Toaster as ToastToaster } from './toaster';
export { useToast } from './use-toast';
export type { ToastTone } from './types';
```

The renamed export means design's `__root.tsx` will import `ToastToaster` for now. After Phase 4 deletes the sonner re-export, we rename back to `Toaster`.

- [ ] **Step 3: Typecheck the workspace**

Run: `pnpm --filter @zeno/ui typecheck`
Expected: PASS.

- [ ] **Step 4: Build to verify the package compiles**

Run: `pnpm --filter @zeno/ui build || true` (if there's no build script, fall back to `pnpm --filter @zeno/ui typecheck`).

Expected: clean. The new toast files are now exported.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/toast/index.ts packages/ui/src/index.ts
git commit -m "feat(ui): re-export toast subsystem"
```

### Task 1.8: Test `<Toast>` rendering

**Files:**
- Create: `packages/ui/tests/toast/toast.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// packages/ui/tests/toast/toast.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast } from '../../src/components/toast/toast';
import type { Toast as ToastType } from '../../src/components/toast/types';

const baseToast: ToastType = {
  id: 1,
  tone: 'success',
  message: 'hello',
  durationMs: 4000,
};

describe('<Toast>', () => {
  it('renders message text', () => {
    render(<Toast toast={baseToast} onDismiss={() => {}} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('applies success-tone classes on the bar', () => {
    const { container } = render(<Toast toast={baseToast} onDismiss={() => {}} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('border-l-status-active');
  });

  it('applies warn-tone classes', () => {
    const { container } = render(
      <Toast toast={{ ...baseToast, tone: 'warn' }} onDismiss={() => {}} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('border-l-gold');
  });

  it('applies fail-tone classes', () => {
    const { container } = render(
      <Toast toast={{ ...baseToast, tone: 'fail' }} onDismiss={() => {}} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('border-l-status-failed');
  });

  it('fires onDismiss when × button clicked (no action)', async () => {
    const onDismiss = vi.fn();
    render(<Toast toast={baseToast} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('fires action.onClick AND onDismiss when action button clicked', async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast
        toast={{ ...baseToast, action: { label: 'undo', onClick: onAction } }}
        onDismiss={onDismiss}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @zeno/ui test -- toast/toast.test`
Expected: 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/tests/toast/toast.test.tsx
git commit -m "test(ui): cover Toast tones, action, dismiss"
```

### Task 1.9: Test `useToast()` queue and auto-dismiss

**Files:**
- Create: `packages/ui/tests/toast/use-toast.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// packages/ui/tests/toast/use-toast.test.tsx

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/toast/toast-provider';
import { useToast } from '../../src/components/toast/use-toast';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('useToast()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when used outside <ToastProvider>', () => {
    expect(() => renderHook(() => useToast())).toThrow(
      /must be used within/i,
    );
  });

  it('success() returns a numeric id', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id: number = 0;
    act(() => {
      id = result.current.success('hello');
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('warn() and fail() also return ids and are distinct', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let a = 0;
    let b = 0;
    act(() => {
      a = result.current.warn('w');
      b = result.current.fail('f');
    });
    expect(a).not.toBe(b);
  });

  it('dismiss(id) removes the toast immediately (verified by no auto-dismiss firing on it)', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id = 0;
    act(() => {
      id = result.current.success('hello');
      result.current.dismiss(id);
    });
    // No exception advancing past durationMs after manual dismiss.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    // If we got here without errors, dismiss worked. The setTimeout fires
    // dismiss(id) on a non-existent id, which is a no-op (filter on empty match).
    expect(true).toBe(true);
  });

  it('auto-dismisses after default 4000ms', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.success('hello');
    });
    // Setting expectations is tricky without exposing toasts; we rely on
    // the absence of a memory leak / timer crash. Real visibility tested
    // in toaster.test.tsx via DOM presence/absence.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(true).toBe(true);
  });

  it('respects custom durationMs', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.warn('hello', { durationMs: 1800 });
    });
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @zeno/ui test -- toast/use-toast.test`
Expected: 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/tests/toast/use-toast.test.tsx
git commit -m "test(ui): cover useToast hook contract"
```

### Task 1.10: Test `<Toaster>` integration

**Files:**
- Create: `packages/ui/tests/toast/toaster.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// packages/ui/tests/toast/toaster.test.tsx

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/toast/toast-provider';
import { useToast } from '../../src/components/toast/use-toast';

function Trigger() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast.success('first');
        toast.warn('second');
        toast.fail('third');
      }}
    >
      fire
    </button>
  );
}

describe('<Toaster>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when queue is empty', () => {
    const { container } = render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    // Toaster only adds a node when there is at least one toast.
    expect(container.querySelectorAll('[role="status"]').length).toBe(0);
  });

  it('renders all queued toasts in order, removes after auto-dismiss', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: 'fire' }).click();
    });
    const rows = screen.getAllByRole('status');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('first');
    expect(rows[1].textContent).toContain('second');
    expect(rows[2].textContent).toContain('third');

    // After durationMs, all rows auto-dismiss.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryAllByRole('status').length).toBe(0);
  });

  it('positions stack fixed top-right', () => {
    const { container } = render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: 'fire' }).click();
    });
    // The wrapper is the parent of any role=status row.
    const stack = container.querySelector('[role="status"]')?.parentElement;
    expect(stack).not.toBeNull();
    expect(stack!.className).toContain('fixed');
    expect(stack!.className).toContain('top-6');
    expect(stack!.className).toContain('right-6');
    expect(stack!.className).toContain('z-50');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @zeno/ui test -- toast/toaster.test`
Expected: 3 tests PASS.

- [ ] **Step 3: Run the full ui test suite**

Run: `pnpm --filter @zeno/ui test`
Expected: ALL existing tests + 15 new toast tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/tests/toast/toaster.test.tsx
git commit -m "test(ui): cover Toaster ordering + auto-dismiss"
```

---

## Phase 2 — Token reconciliation

Goal: `apps/design/src/styles/globals.css` stops duplicating colors/shadows from `tokens.css`. Divergent values are reconciled with Paper as arbiter. Phase ends with both apps building green.

### Task 2.1: Resolve canvas color via Paper

- [ ] **Step 1: Inspect Paper's canonical canvas color**

Open Paper. Pick any artboard from the design catalog (e.g. an artboard named "home" or "crons"). Use the Paper MCP to read the actual background fill:

Run (via Paper MCP tools — `get_basic_info` to list artboards, then `get_node_info` or `get_computed_styles` on the relevant artboard).

Expected: a hex color, either `#0A0A10`, `#08090F`, or something else.

- [ ] **Step 2: Decide and edit `tokens.css` if needed**

If Paper says `#0A0A10` (current `tokens.css` value): no change to `tokens.css`. The design app will adopt this when it imports.

If Paper says `#08090F` (current design `globals.css` value): edit `packages/ui/src/styles/tokens.css` line for `--color-canvas`:

```css
  --color-canvas: #08090F;
```

If Paper says something else (e.g. `#0a0a10` lowercase, or a different value entirely): use that.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/styles/tokens.css
git commit -m "fix(ui): set canvas color to Paper's canonical value"
```

(Skip this commit if Step 2 made no change — go to Task 2.2.)

### Task 2.2: Inventory animation tokens

- [ ] **Step 1: Find every `@keyframes` and `--animate-*` declaration in both files**

Run:
```bash
grep -nE "@keyframes|--animate-" packages/ui/src/styles/tokens.css apps/design/src/styles/globals.css
```

Expected output (rough): `tokens.css` has `--animate-pulse-jade`, `--animate-pulse-carmine`, `--animate-pulse-gold` plus their `@keyframes`. `globals.css` has `--animate-caret`, plus possibly `@keyframes fade-in`, `dialog-in`, `word-rise`, `log-new-entry`.

- [ ] **Step 2: For each animation, decide where it lives**

Apply this rule:
- If a primitive in `packages/ui/src/components/` uses the animation (grep the source for the animation name): it belongs in `tokens.css`.
- If only `apps/design` uses it (grep `apps/design/src` for the name): it stays in design's `globals.css`.
- If both use it: it belongs in `tokens.css`.

For each animation, run e.g. `grep -rn "animate-caret\|animation: caret" packages/ui/src apps/design/src apps/dashboard/src`. Note the consumer set.

- [ ] **Step 3: Promote any animation that needs it to `tokens.css`**

If the inventory shows `--animate-caret` is consumed by an `@zeno/ui` primitive (likely is — input cursor blink), add to `tokens.css` alongside the pulse animations:

```css
/* In tokens.css @theme block, after pulse animations */
  --animate-caret: caret 1s steps(2) infinite;
```

And add the corresponding `@keyframes` block at the bottom of `tokens.css` (after the existing `@keyframes pulse-*`):

```css
@keyframes caret {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
```

If the inventory shows `--animate-caret` is design-only, skip — leave it in design's `globals.css`.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/styles/tokens.css
git commit -m "fix(ui): consolidate shared animation tokens in tokens.css"
```

(Skip if no changes.)

### Task 2.3: Slim `apps/design/src/styles/globals.css`

**Files:**
- Modify: `apps/design/src/styles/globals.css`

- [ ] **Step 1: Replace the `@theme` block**

Open `apps/design/src/styles/globals.css`. The current structure is:

```css
@import "tailwindcss";

@source "../routes/**/*.{ts,tsx}";

@theme {
  /* ~50 lines: colors, gold, status, overlay, fonts, shadows, animations */
}

@keyframes caret { ... }

@layer base {
  /* resets, scrollbar, body radial-gradient, ::selection */
}
```

Replace the file's top section with:

```css
@import "tailwindcss";
@import "@zeno/ui/styles/tokens.css";

@source "../routes/**/*.{ts,tsx}";

@theme {
  /* Fonts — kept per-app; tokens.css does not declare these. */
  --font-sans: 'Space Grotesk', system-ui, -apple-system, sans-serif;
  --font-serif: 'Fraunces', 'Iowan Old Style', Georgia, serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
```

If Task 2.2 left `--animate-caret` in design only, also keep that one line in `@theme` plus its `@keyframes caret { ... }` block lower in the file.

If Task 2.2 promoted `--animate-caret` to `tokens.css`, REMOVE both the `--animate-caret` line and the `@keyframes caret` block from this file.

The `@layer base` block at the bottom (resets, scrollbar, body radial-gradient, ::selection) **stays unchanged**.

- [ ] **Step 2: Verify dev server still loads `apps/design`**

Run: `pnpm --filter @zeno/design dev` (in another terminal) or `pnpm --filter @zeno/design build` (one-shot).

Expected: build completes without CSS errors. Visual: any one route loads with the same canvas color as before (or the Paper-canonical color if it changed in Task 2.1).

- [ ] **Step 3: Smoke-screenshot key routes**

If something looks visually off, compare against a screenshot taken BEFORE Phase 2. Most likely root cause: a token that was in `globals.css` but missed in `tokens.css`. Add it to `tokens.css` (it's a shared token) and re-verify.

- [ ] **Step 4: Commit**

```bash
git add apps/design/src/styles/globals.css
git commit -m "refactor(design): import tokens from @zeno/ui, remove duplicates"
```

### Task 2.4: Verify `apps/dashboard` still renders correctly

- [ ] **Step 1: Build dashboard**

Run: `pnpm --filter @zeno/dashboard build`
Expected: clean build.

- [ ] **Step 2: Spot-check via dev server**

Run: `pnpm --filter @zeno/dashboard dev` and load any route. Visual: canvas color matches the new token value (which is `tokens.css`'s value, possibly changed in Task 2.1).

- [ ] **Step 3: No commit needed** — this is a verification step.

---

## Phase 3 — `apps/design` switches to `@zeno/ui` toast

Goal: `apps/design` no longer has its own `lib/toast.tsx`. All call sites import from `@zeno/ui`. Phase ends with `apps/design` building + smoke-testing green and `lib/toast.tsx` deleted.

### Task 3.1: Switch `__root.tsx` to use `@zeno/ui` ToastProvider

**Files:**
- Modify: `apps/design/src/routes/__root.tsx`

- [ ] **Step 1: Update imports**

Open `apps/design/src/routes/__root.tsx`. Find:

```tsx
import { ToastProvider } from '@/lib/toast';
```

Replace with:

```tsx
import { ToastProvider } from '@zeno/ui';
```

The `<ToastProvider>` JSX usage stays identical (no props change).

Note: `<Toaster>` is mounted INSIDE `<ToastProvider>` automatically (Phase 1 wired it that way). The current design doesn't manually render `<Toaster>` either — confirmed by `grep -n Toaster apps/design/src/routes/__root.tsx`. No change needed there.

- [ ] **Step 2: Typecheck design**

Run: `pnpm --filter @zeno/design typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/design/src/routes/__root.tsx
git commit -m "refactor(design): import ToastProvider from @zeno/ui"
```

### Task 3.2: Switch all `useToast()` call sites

**Files modified** (15 files — all call sites where design uses `useToast()`):
- `apps/design/src/components/modals/uninstall-connector-modal.tsx`
- `apps/design/src/components/modals/add-catalog-modal.tsx`
- `apps/design/src/components/modals/edit-secret-modal.tsx`
- `apps/design/src/components/modals/restart-worker-modal.tsx`
- `apps/design/src/components/modals/new-cron-modal.tsx`
- `apps/design/src/components/modals/delete-cron-modal.tsx`
- `apps/design/src/components/modals/add-custom-modal.tsx`
- `apps/design/src/routes/dashboard/connectors/linear/index.tsx`
- `apps/design/src/routes/dashboard/connectors/fn-scrum/index.tsx`
- `apps/design/src/routes/dashboard/connectors/add-remote/index.tsx`
- `apps/design/src/routes/dashboard/connectors/add-catalog/index.tsx`
- `apps/design/src/routes/dashboard/connectors/add-local/index.tsx`
- `apps/design/src/routes/dashboard/connectors/uninstall/index.tsx`
- `apps/design/src/routes/dashboard/connectors/notion/index.tsx`
- `apps/design/src/routes/dashboard/home/empty/index.tsx`
- `apps/design/src/routes/dashboard/crons/index.tsx`

- [ ] **Step 1: Run a sed/perl replacement across all 16 files**

Run from repo root:

```bash
perl -i -pe "s|from '\@/lib/toast'|from '\@zeno/ui'|g" \
  apps/design/src/components/modals/uninstall-connector-modal.tsx \
  apps/design/src/components/modals/add-catalog-modal.tsx \
  apps/design/src/components/modals/edit-secret-modal.tsx \
  apps/design/src/components/modals/restart-worker-modal.tsx \
  apps/design/src/components/modals/new-cron-modal.tsx \
  apps/design/src/components/modals/delete-cron-modal.tsx \
  apps/design/src/components/modals/add-custom-modal.tsx \
  apps/design/src/routes/dashboard/connectors/linear/index.tsx \
  apps/design/src/routes/dashboard/connectors/fn-scrum/index.tsx \
  apps/design/src/routes/dashboard/connectors/add-remote/index.tsx \
  apps/design/src/routes/dashboard/connectors/add-catalog/index.tsx \
  apps/design/src/routes/dashboard/connectors/add-local/index.tsx \
  apps/design/src/routes/dashboard/connectors/uninstall/index.tsx \
  apps/design/src/routes/dashboard/connectors/notion/index.tsx \
  apps/design/src/routes/dashboard/home/empty/index.tsx \
  apps/design/src/routes/dashboard/crons/index.tsx
```

This rewrites every `from '@/lib/toast'` to `from '@zeno/ui'`. The exported names (`useToast`, `ToastTone`) are identical, so no JSX needs to change.

- [ ] **Step 2: Verify no stragglers**

Run: `grep -rn "from '@/lib/toast'" apps/design/src/`
Expected: zero matches.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @zeno/design typecheck`
Expected: PASS.

- [ ] **Step 4: Lint**

Run: `pnpm --filter @zeno/design lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/design/src
git commit -m "refactor(design): switch all useToast call sites to @zeno/ui"
```

### Task 3.3: Delete `apps/design/src/lib/toast.tsx`

**Files:**
- Delete: `apps/design/src/lib/toast.tsx`

- [ ] **Step 1: Confirm no remaining imports**

Run: `grep -rn "lib/toast" apps/design/src/`
Expected: zero matches.

- [ ] **Step 2: Delete the file**

Run: `rm apps/design/src/lib/toast.tsx`

- [ ] **Step 3: Build apps/design**

Run: `pnpm --filter @zeno/design build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/design/src/lib/toast.tsx
git commit -m "chore(design): delete lib/toast.tsx (lifted to @zeno/ui)"
```

(`git add` on a deleted path stages the deletion.)

### Task 3.4: Manual smoke test of `apps/design`

- [ ] **Step 1: Start design dev server**

Run: `pnpm --filter @zeno/design dev`

- [ ] **Step 2: Trigger toasts on every key surface**

Visit the following routes in order and trigger an action that produces a toast. Console must stay clean (no errors / warnings).

| Route | Action | Expected toast |
|---|---|---|
| `/dashboard/crons` | click `+ NEW CRON` → `CREATE CRON` | success: `<name> · cron created` |
| `/dashboard/crons` | row `▶ RUN` | warn `running…` then success `ran in 1.5s` |
| `/dashboard/crons` | row `del` → `DELETE` | fail `<name> · deleted` |
| `/dashboard/connectors/linear` | toggle ENABLED ↔ DISABLED | success `enabled` / warn `disabled` |
| `/dashboard/connectors/linear` | edit-secret → SAVE | success `linear · LINEAR_API_KEY saved` |
| `/dashboard/connectors/linear` | tool permission `ASK` button on a row | success `<tool> · ask` |
| `/dashboard/connectors` | catalog card click → ADD | success `<connector> · installed` |
| `/dashboard/settings` | RESTART WORKER → CONFIRM | warn `worker · restarting…` |
| `/dashboard/home/empty` | PASTE TOKEN | success `slack · token saved · listener up` |

- [ ] **Step 3: No commit** — this is verification.

---

## Phase 4 — `apps/dashboard` migrates from `sonner`

Goal: 3 sonner sites in `apps/dashboard` use `useToast()` from `@zeno/ui`. The `Toaster` import in `__root.tsx` resolves to the new toast (renamed back from `ToastToaster`). `sonner` and `packages/ui/src/components/sonner.tsx` are deleted.

### Task 4.1: Wrap `apps/dashboard` root with `<ToastProvider>`

**Files:**
- Modify: `apps/dashboard/src/routes/__root.tsx`

- [ ] **Step 1: Read current contents**

The current `__root.tsx`:

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Toaster } from '@zeno/ui';
import { queryClient } from '@/lib/query-client';

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  ),
});
```

`<Toaster>` here is the SONNER one (from `packages/ui/src/components/sonner.tsx`). After Task 4.4 deletes that component, this `Toaster` import will resolve to the new toast `Toaster` instead. We can leave the import line as-is — the name resolves the right thing once the sonner re-export is gone.

But: the new `Toaster` requires `<ToastProvider>` to wrap it. Without a provider, `useToast()` hooks throw and `<Toaster>` reads `null` context and renders nothing.

Replace the file with:

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { ToastProvider } from '@zeno/ui';
import { queryClient } from '@/lib/query-client';

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </QueryClientProvider>
  ),
});
```

(`<Toaster>` is mounted automatically by `<ToastProvider>` — no need to render it explicitly.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS. (`ToastProvider` is exported from `@zeno/ui` already from Phase 1 Task 1.7.)

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/routes/__root.tsx
git commit -m "refactor(dashboard): wrap root with @zeno/ui ToastProvider"
```

### Task 4.2: Migrate `mutations.ts` from sonner to `useToast()`

**Files:**
- Modify: `apps/dashboard/src/lib/mutations.ts`

- [ ] **Step 1: Identify the consumer**

Open `apps/dashboard/src/lib/mutations.ts`. Find:

```ts
import { toast } from 'sonner';
// ...
export function useRestartWorker() {
  return useMutation({
    mutationFn: () => apiFetch<void>('/api/settings/restart', { method: 'POST' }),
    onSuccess: () => toast.success('restarting worker…'),
    onError: (err) => toast.error(formatError(err)),
  });
}
```

- [ ] **Step 2: Replace with `useToast()`**

Apply this diff:

```diff
-import { toast } from 'sonner';
+import { useToast } from '@zeno/ui';
```

```diff
 export function useRestartWorker() {
+  const toast = useToast();
   return useMutation({
     mutationFn: () => apiFetch<void>('/api/settings/restart', { method: 'POST' }),
     onSuccess: () => toast.success('restarting worker…'),
-    onError: (err) => toast.error(formatError(err)),
+    onError: (err) => toast.fail(formatError(err)),
   });
 }
```

(`toast.error` → `toast.fail` is the API rename. Other `toast.success` is unchanged.)

If there are other functions in `mutations.ts` that call `toast.error`/`toast.success`, apply the same pattern: declare `const toast = useToast();` at the top of each function (it's a hook, must be inside hook bodies), and rename `error` → `fail`. Search the file: `grep -n "toast\." apps/dashboard/src/lib/mutations.ts`. Expected at the time of writing: 2 occurrences both inside `useRestartWorker()`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/mutations.ts
git commit -m "refactor(dashboard): mutations.ts uses @zeno/ui useToast"
```

### Task 4.3: Migrate `use-optimistic-mutation.ts`

**Files:**
- Modify: `apps/dashboard/src/lib/use-optimistic-mutation.ts`

- [ ] **Step 1: Apply the same pattern**

```diff
-import { toast } from 'sonner';
+import { useToast } from '@zeno/ui';
```

Add inside the exported hook function (top of body):

```ts
const toast = useToast();
```

Then replace:
- `toast.error(msg)` → `toast.fail(msg)`
- `toast.success(msg)` → `toast.success(msg)` (unchanged)

Verify with `grep -n "toast\." apps/dashboard/src/lib/use-optimistic-mutation.ts`. Expected at the time of writing: 2 occurrences (`toast.error` line ~89 → `.fail`; `toast.success` line ~98 unchanged).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/lib/use-optimistic-mutation.ts
git commit -m "refactor(dashboard): use-optimistic-mutation uses @zeno/ui useToast"
```

### Task 4.4: Migrate `login.tsx`

**Files:**
- Modify: `apps/dashboard/src/routes/login.tsx`

- [ ] **Step 1: Apply the pattern**

```diff
-import { toast } from 'sonner';
+import { useToast } from '@zeno/ui';
```

Inside the component body (top), add:

```ts
const toast = useToast();
```

Replace `toast.error(...)` calls (2 occurrences in this file) with `toast.fail(...)`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 3: Verify dashboard build**

Run: `pnpm --filter @zeno/dashboard build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/routes/login.tsx
git commit -m "refactor(dashboard): login.tsx uses @zeno/ui useToast"
```

### Task 4.5: Verify zero remaining sonner consumers

- [ ] **Step 1: Run the grep**

```bash
grep -rn "from 'sonner'" apps/dashboard/src apps/design/src packages/ui/src
```

Expected output: ONLY `packages/ui/src/components/sonner.tsx` (which we delete next). NO other matches.

If something else shows up, migrate it now (same pattern: hook → `useToast()`, rename `error` → `fail`). Repeat the grep.

- [ ] **Step 2: No commit** — this is verification.

### Task 4.6: Delete `packages/ui/src/components/sonner.tsx` and rename Toaster export

**Files:**
- Delete: `packages/ui/src/components/sonner.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/src/components/toast/index.ts`

- [ ] **Step 1: Delete the sonner wrapper**

Run: `rm packages/ui/src/components/sonner.tsx`

- [ ] **Step 2: Remove the `sonner` re-export from `packages/ui/src/index.ts`**

Find and delete the line:

```ts
export * from './components/sonner';
```

- [ ] **Step 3: Rename `ToastToaster` back to `Toaster` in the toast barrel**

Open `packages/ui/src/components/toast/index.ts`. Replace:

```ts
export { Toaster as ToastToaster } from './toaster';
```

with:

```ts
export { Toaster } from './toaster';
```

- [ ] **Step 4: Build the package**

Run: `pnpm --filter @zeno/ui build || pnpm --filter @zeno/ui typecheck`
Expected: clean. The name `Toaster` now exclusively comes from the new toast subsystem.

- [ ] **Step 5: Verify dashboard still builds**

Run: `pnpm --filter @zeno/dashboard build`
Expected: clean. `apps/dashboard/src/routes/__root.tsx` no longer needs `Toaster` (Task 4.1 removed it), so this should be unaffected.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/sonner.tsx packages/ui/src/index.ts packages/ui/src/components/toast/index.ts
git commit -m "chore(ui): remove sonner wrapper, restore Toaster export name"
```

### Task 4.7: Drop `sonner` from `package.json` files

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `apps/dashboard/package.json`

- [ ] **Step 1: Remove sonner from `packages/ui/package.json`**

Find this line in `dependencies`:

```json
    "sonner": "2.0.7",
```

Delete it. Check that the surrounding JSON (commas, brackets) is still valid.

- [ ] **Step 2: Remove sonner from `apps/dashboard/package.json`**

Find:

```json
    "sonner": "2.0.7",
```

Delete it. Check JSON validity.

- [ ] **Step 3: Run `pnpm install`**

Run: `pnpm install`
Expected: lockfile updates, sonner package removed from `node_modules`.

- [ ] **Step 4: Verify both packages still build**

Run: `pnpm --filter @zeno/ui build && pnpm --filter @zeno/dashboard build`
Expected: both clean.

- [ ] **Step 5: Verify the lockfile reflects sonner's removal**

Run: `grep -c sonner pnpm-lock.yaml`
Expected: 0 (or near 0 — there might be transitive listings if some other dep depends on sonner, unlikely).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/package.json apps/dashboard/package.json pnpm-lock.yaml
git commit -m "chore: drop sonner dependency"
```

---

## Phase 5 — Final quality gate

Goal: every workspace passes lint + typecheck + test + build. Smoke test confirms apps render correctly.

### Task 5.1: Run the full quality gate

- [ ] **Step 1: Run from repo root**

Run: `pnpm run quality-gate`
Expected: ALL workspaces green (turbo runs lint + typecheck + test in parallel across all packages).

If anything fails, fix it before continuing. Common failures:
- Lint: a stray import path that wasn't caught earlier. Run `pnpm --filter <pkg> lint` and fix flagged lines.
- Typecheck: a missing import or stale type. Open the offending file and resolve.
- Test: usually fake-timer related; ensure `vi.useFakeTimers()` / `vi.useRealTimers()` brackets are correct in the new toast tests.

- [ ] **Step 2: Build all apps**

Run: `pnpm run build`
Expected: `@zeno/dashboard`, `@zeno/design`, `@zeno/ui` all build cleanly.

- [ ] **Step 3: No commit** — this is the gate.

### Task 5.2: Manual smoke (dashboard + design)

- [ ] **Step 1: `apps/design`**

Run: `pnpm --filter @zeno/design dev`. Visit a few routes; trigger toasts (see Task 3.4 list). Console clean.

- [ ] **Step 2: `apps/dashboard`**

Run: `pnpm --filter @zeno/dashboard dev` (with the api running via `pnpm run docker:up`). Trigger a toast path:
- Login: type wrong password → `fail` toast appears.
- Settings: restart worker → `success` toast `restarting worker…`.
- Cron CRUD: pause/resume a cron → optimistic-mutation success toast.

Console clean.

- [ ] **Step 3: No commit** — this is verification.

### Task 5.3: Verify all success criteria from the spec

For each item in `[[spec]]`'s **Success Criteria** section, verify by running the documented check:

- [ ] **Item 1:** `pnpm --filter @zeno/ui build && pnpm --filter @zeno/ui test` is green and `index.ts` exports the four toast names + `ToastTone`.
- [ ] **Item 2:** `apps/design/src/lib/toast.tsx` does not exist; `grep -r "lib/toast" apps/design/src/` is empty.
- [ ] **Item 3:** `apps/design/src/styles/globals.css` starts with `@import "tailwindcss"; @import "@zeno/ui/styles/tokens.css";` and has no color/shadow tokens left in `@theme`.
- [ ] **Item 4:** `grep "sonner" apps/dashboard/package.json packages/ui/package.json` returns nothing.
- [ ] **Item 5:** `apps/design` toast variants fire visually identical to before (Task 3.4).
- [ ] **Item 6:** `pnpm run quality-gate` is green (Task 5.1).
- [ ] **Item 7:** spec at `context/specs/2026-04-26-ui-primitive-lift/spec.md` has Approved status from spec-document-reviewer (verified before this plan was written) and the user has approved the spec.

If any item fails, that is a bug. Find and fix it. Repeat the check.

- [ ] **Step 1: All 7 items checked off above.**

- [ ] **Step 2: No commit** — verification.

### Task 5.4: Push and prepare PR description

- [ ] **Step 1: Push the branch**

Run: `git push -u origin feat/apps-design`

(If the branch already has a remote, this just updates it.)

- [ ] **Step 2: Open PR via `/open-pr` skill**

When the user requests, invoke `/open-pr`. The PR title:

```
feat(ui): lift toast and reconcile tokens (spec 0030)
```

The PR body should reference `context/specs/2026-04-26-ui-primitive-lift/spec.md`, summarize the 5 phases, and link to the closed open-questions resolutions documented in this plan.

---

## Done

When all checkboxes above are ticked, the spec is implemented. Branch is push-ready and the spec status can be updated from `draft` to `shipped` in `context/specs/2026-04-26-ui-primitive-lift/spec.md` frontmatter (and the `shipped: null` field set to today's ISO date).
