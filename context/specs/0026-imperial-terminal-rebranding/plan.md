# Imperial Terminal Rebranding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's generic visual identity with the "Imperial Terminal" design — ink-blue surfaces, imperial gold accent, mono-first typography, crest geometry — matching the prototype at `tmp/rebranding/zeno/` pixel-for-pixel.

**Architecture:** 4-phase bottom-up migration. Phase 1 swaps tokens/fonts/kills light mode. Phase 2 adapts and adds `@zeno/ui` primitives. Phase 3 rewrites every dashboard screen. Phase 4 adds 2 API endpoints for sparkline and next-crons data. All work on branch `feat/imperial-terminal-rebranding`.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Tailwind CSS v4, Radix UI, CVA, Hono, better-sqlite3, pnpm workspaces.

**Prototype reference:** `tmp/rebranding/zeno/` — all CSS in `colors_and_type.css` + `zeno.css`, all JSX in per-screen files.

---

## Phase 1 — Tokens, Fonts, Kill Light Mode

### Task 1: Create branch and replace design tokens

**Files:**
- Modify: `packages/ui/src/styles/tokens.css`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/imperial-terminal-rebranding
```

- [ ] **Step 2: Replace tokens.css entirely**

Replace the full contents of `packages/ui/src/styles/tokens.css` with:

```css
/*
 * Zeno design tokens — "Imperial Terminal"
 *
 * Ink-blue surfaces, imperial gold accent, mono-first typography.
 * Dark is the ONLY mode. No light palette.
 *
 * Tailwind v4 @theme block maps CSS variables into utilities
 * (bg-canvas, text-gold, border-border-subtle, etc.).
 */

@source "../components/**/*.{ts,tsx}";

@theme {
  /* Surfaces */
  --color-canvas: #0A0A10;
  --color-panel: #0f1119;
  --color-panel-2: #151824;
  --color-sidebar: #050610;

  /* Borders */
  --color-border-subtle: #1e2131;
  --color-border-strong: #2a2e44;
  --color-hairline: rgba(255, 230, 170, 0.06);

  /* Text */
  --color-text-primary: #e8eaf5;
  --color-text-secondary: #8a8fab;
  --color-text-tertiary: #4b4f66;
  --color-text-ink: #0a0b12;

  /* Imperial gold — THE accent */
  --color-gold: #d9b362;
  --color-gold-bright: #f0cc7a;
  --color-gold-deep: #8a6d2e;
  --color-gold-soft: rgba(217, 179, 98, 0.10);
  --color-gold-ring: rgba(217, 179, 98, 0.28);
  --color-gold-line: rgba(217, 179, 98, 0.18);

  /* Status */
  --color-status-active: #6bd3a3;
  --color-status-paused: #d9b362;
  --color-status-failed: #e8617a;
  --color-status-info: #7aa6e8;

  /* Overlay */
  --color-overlay: rgba(5, 6, 16, 0.80);

  /* Shadows */
  --shadow-panel: 0 1px 0 rgba(255, 255, 255, 0.02) inset, 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-float: 0 24px 48px -16px rgba(0, 0, 0, 0.8), 0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-gold-glow: 0 0 0 1px rgba(217, 179, 98, 0.18), 0 0 24px -6px rgba(217, 179, 98, 0.3);
}
```

- [ ] **Step 3: Run typecheck to verify no breakage**

```bash
pnpm run typecheck
```

Expected: pass (tokens are CSS variables, not TS).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/styles/tokens.css
git commit -m "feat(ui): replace design tokens with Imperial Terminal palette"
```

---

### Task 2: Replace fonts and update globals.css

**Files:**
- Modify: `apps/dashboard/index.html`
- Modify: `apps/dashboard/src/styles/globals.css`

- [ ] **Step 1: Replace Google Fonts link in index.html**

In `apps/dashboard/index.html`, replace the existing `<link>` tags for fonts (both preconnect and the css2 import) and remove the theme detection script. The full `<head>` and `<body>` should become:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Zeno</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Rewrite globals.css**

Replace the full contents of `apps/dashboard/src/styles/globals.css` with:

```css
@import "tailwindcss";
@import "@zeno/ui/styles/tokens.css";

@theme {
  --font-sans: 'Space Grotesk', system-ui, -apple-system, sans-serif;
  --font-serif: 'Fraunces', 'Iowan Old Style', Georgia, serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

html, body, #root {
  height: 100%;
  background-color: var(--color-canvas);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  background:
    radial-gradient(ellipse 1200px 700px at 80% -20%, rgba(217, 179, 98, 0.04), transparent 60%),
    radial-gradient(ellipse 900px 600px at -10% 110%, rgba(122, 166, 232, 0.025), transparent 60%),
    var(--color-canvas);
}

::selection {
  background: var(--color-gold);
  color: var(--color-text-ink);
}

:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-canvas), 0 0 0 4px var(--color-gold-ring);
  border-radius: 2px;
}

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--color-canvas); }
::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 999px;
  border: 2px solid var(--color-canvas);
}
::-webkit-scrollbar-thumb:hover { background: var(--color-gold-deep); }
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/index.html apps/dashboard/src/styles/globals.css
git commit -m "feat(dashboard): replace fonts and globals with Imperial Terminal styles"
```

---

### Task 3: Kill light mode

**Files:**
- Delete: `apps/dashboard/src/lib/use-theme.ts`
- Modify: `apps/dashboard/src/components/layout/sidebar.tsx` (remove useTheme import and toggle button — full rewrite happens in Task 10, but we need it to compile now)

- [ ] **Step 1: Delete use-theme.ts**

```bash
rm apps/dashboard/src/lib/use-theme.ts
```

- [ ] **Step 2: Remove useTheme from sidebar.tsx**

In `apps/dashboard/src/components/layout/sidebar.tsx`:

Remove the import line:
```typescript
import { useTheme } from '@/lib/use-theme';
```

Remove the `useTheme` call inside `Sidebar`:
```typescript
  const { theme, toggle: toggleTheme } = useTheme();
```

Remove the `SunIcon` and `MoonIcon` function components entirely.

Replace the theme toggle button in the user footer section (the `<button>` with `onClick={toggleTheme}`) with nothing — just remove the button element. The footer should end after the `<span>` with "Operator".

- [ ] **Step 3: Run typecheck**

```bash
pnpm run typecheck
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(dashboard): kill light mode — remove theme hook, toggle, and CSS"
```

---

### Task 4: Rename accent → gold across codebase

**Files:**
- Modify: Multiple files in `apps/dashboard/src/` that reference `text-accent`, `bg-accent`, or `variant="accent"`

- [ ] **Step 1: Find all accent references**

```bash
grep -rn 'accent' apps/dashboard/src/ --include='*.tsx' --include='*.ts' --include='*.css'
```

- [ ] **Step 2: Replace each reference**

For Tailwind classes: `text-accent` → `text-gold`, `bg-accent` → `bg-gold`.

For Button variant: `variant="accent"` → `variant="primary"` (since primary is now gold-based).

Key files to update:
- `apps/dashboard/src/routes/login.tsx` — `text-accent` on Z logo → remove (login gets full rewrite in Task 11)
- `apps/dashboard/src/routes/_authed/index.tsx` — `text-accent` on greeting → `text-gold`
- `apps/dashboard/src/routes/_authed/crons.index.tsx` — `variant="accent"` → `variant="primary"`
- `apps/dashboard/src/components/layout/layout.tsx` — `text-accent` on Z logo → `text-gold`
- `apps/dashboard/src/components/layout/sidebar.tsx` — `text-accent` on Z logo → `text-gold`
- `apps/dashboard/src/components/sessions/message-block.tsx` — `text-accent` → `text-gold`
- `apps/dashboard/src/components/crons/cron-actions.tsx` — `variant="accent"` → `variant="primary"`
- `apps/dashboard/src/components/settings/restart-dialog.tsx` — `variant="accent"` → `variant="primary"`
- `apps/dashboard/src/lib/greeting.ts` — update comment from "coral accent" to "gold accent"

- [ ] **Step 3: Run typecheck + lint**

```bash
pnpm run quality-gate
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(dashboard): rename accent references to gold across codebase"
```

---

## Phase 2 — Primitives (`@zeno/ui`)

### Task 5: Add new primitive components

**Files:**
- Create: `packages/ui/src/components/crest.tsx`
- Create: `packages/ui/src/components/dot.tsx`
- Create: `packages/ui/src/components/pill.tsx`
- Create: `packages/ui/src/components/chip.tsx`
- Create: `packages/ui/src/components/spark.tsx`
- Create: `packages/ui/src/components/losango.tsx`
- Create: `packages/ui/src/components/kicker.tsx`
- Create: `packages/ui/src/components/corner-brackets.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create crest.tsx**

Port from `tmp/rebranding/zeno/primitives.jsx` ZCrest. TypeScript React component with props `size` (default 28) and `ornate` (default false).

```tsx
import type { JSX } from 'react';

export interface CrestProps {
  size?: number;
  ornate?: boolean;
}

export function Crest({ size = 28, ornate = false }: CrestProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <path d="M60 6 L114 60 L60 114 L6 60 Z" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M60 14 L106 60 L60 106 L14 60 Z" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" fill="none" />
      {ornate && (
        <path d="M60 22 L98 60 L60 98 L22 60 Z" stroke="currentColor" strokeWidth="0.75" strokeOpacity="0.2" fill="none" />
      )}
      <g fill="currentColor">
        <rect x="36" y="42" width="48" height="8" />
        <polygon points="76,50 84,50 44,70 36,70" />
        <rect x="36" y="70" width="48" height="8" />
      </g>
      <circle cx="60" cy="6" r="2" fill="currentColor" />
      <circle cx="60" cy="114" r="2" fill="currentColor" />
      <circle cx="6" cy="60" r="1.5" fill="currentColor" fillOpacity="0.5" />
      <circle cx="114" cy="60" r="1.5" fill="currentColor" fillOpacity="0.5" />
    </svg>
  );
}
```

- [ ] **Step 2: Create dot.tsx**

Port from ZDot. 6px status indicator with optional pulse animation.

```tsx
import type { JSX } from 'react';
import { cn } from '../utils';

export type DotTone = 'active' | 'paused' | 'failed' | 'info' | 'idle';

export interface DotProps {
  tone?: DotTone;
  pulse?: boolean;
  className?: string;
}

const toneColor: Record<DotTone, string> = {
  active: 'bg-status-active',
  paused: 'bg-status-paused',
  failed: 'bg-status-failed',
  info: 'bg-status-info',
  idle: 'bg-text-tertiary',
};

const pulseClass: Record<DotTone, string> = {
  active: 'animate-pulse-jade',
  paused: 'animate-pulse-gold',
  failed: 'animate-pulse-carmine',
  info: 'animate-pulse-jade',
  idle: '',
};

export function Dot({ tone = 'active', pulse = false, className }: DotProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
        toneColor[tone],
        pulse && pulseClass[tone],
        className,
      )}
    />
  );
}
```

Note: the pulse keyframe animations need to be added to `tokens.css`. Add these at the end of the `@theme` block:

```css
  /* Pulse animations */
  --animate-pulse-jade: pulse-jade 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  --animate-pulse-carmine: pulse-carmine 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  --animate-pulse-gold: pulse-gold 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
```

And add keyframes after the `@theme` block:

```css
@keyframes pulse-jade {
  0%, 100% { box-shadow: 0 0 0 0 rgba(107, 211, 163, 0.45); }
  50% { box-shadow: 0 0 0 5px rgba(107, 211, 163, 0); }
}
@keyframes pulse-carmine {
  0%, 100% { box-shadow: 0 0 0 0 rgba(232, 97, 122, 0.5); }
  50% { box-shadow: 0 0 0 5px rgba(232, 97, 122, 0); }
}
@keyframes pulse-gold {
  0%, 100% { box-shadow: 0 0 0 0 rgba(217, 179, 98, 0.45); }
  50% { box-shadow: 0 0 0 5px rgba(217, 179, 98, 0); }
}
```

- [ ] **Step 3: Create pill.tsx**

Port from ZPill and ZOutlinePill.

```tsx
import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';
import { Dot, type DotTone } from './dot';

export interface PillProps {
  tone?: DotTone;
  children: ReactNode;
  className?: string;
}

const toneStyles: Record<DotTone, string> = {
  active: 'text-status-active border-status-active/30 bg-status-active/[0.06]',
  paused: 'text-status-paused border-gold-line bg-gold-soft',
  failed: 'text-status-failed border-status-failed/30 bg-status-failed/[0.06]',
  info: 'text-status-info border-status-info/30 bg-status-info/[0.06]',
  idle: 'text-text-tertiary border-border-subtle bg-panel-2',
};

export function Pill({ tone = 'active', children, className }: PillProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]',
        toneStyles[tone],
        className,
      )}
    >
      <Dot tone={tone} pulse={tone === 'failed'} />
      {children}
    </span>
  );
}

export interface OutlinePillProps {
  children: ReactNode;
  className?: string;
}

export function OutlinePill({ children, className }: OutlinePillProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center border border-border-subtle px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary',
        className,
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Create chip.tsx**

```tsx
import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';

export interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export function Chip({ active = false, onClick, children, className }: ChipProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-all duration-[120ms]',
        active
          ? 'border-gold bg-gold-soft text-gold'
          : 'border-border-subtle bg-transparent text-text-secondary hover:border-text-tertiary hover:text-text-primary',
        className,
      )}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 5: Create spark.tsx**

```tsx
import type { JSX } from 'react';

export interface SparkProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Spark({ data, width = 60, height = 18, color = 'var(--color-gold)' }: SparkProps): JSX.Element {
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(' ');

  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.7" />
    </svg>
  );
}
```

- [ ] **Step 6: Create losango.tsx**

```tsx
import type { JSX } from 'react';

export interface LosangoProps {
  size?: number;
  color?: string;
}

export function Losango({ size = 5, color = 'currentColor' }: LosangoProps): JSX.Element {
  const d = size * 2;
  return (
    <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} aria-hidden="true">
      <path
        d={`M${size} 0 L${d} ${size} L${size} ${d} L0 ${size} Z`}
        stroke={color}
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}
```

- [ ] **Step 7: Create kicker.tsx**

```tsx
import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';

export interface KickerProps {
  mute?: boolean;
  children: ReactNode;
  className?: string;
}

export function Kicker({ mute = false, children, className }: KickerProps): JSX.Element {
  return (
    <span
      className={cn(
        'font-mono text-[11px] font-medium uppercase tracking-[0.18em]',
        mute ? 'text-text-tertiary' : 'text-gold',
        className,
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 8: Create corner-brackets.tsx**

```tsx
import type { JSX } from 'react';

export function CornerBrackets(): JSX.Element {
  const base = 'absolute h-3 w-3 pointer-events-none border-gold';
  return (
    <>
      <span className={`${base} -left-px -top-px border-l border-t`} />
      <span className={`${base} -right-px -top-px border-r border-t`} />
      <span className={`${base} -bottom-px -left-px border-b border-l`} />
      <span className={`${base} -bottom-px -right-px border-b border-r`} />
    </>
  );
}
```

- [ ] **Step 9: Update index.ts exports**

Replace `packages/ui/src/index.ts`:

```typescript
export * from './components/alert-dialog';
export * from './components/button';
export * from './components/chip';
export * from './components/corner-brackets';
export * from './components/crest';
export * from './components/dialog';
export * from './components/dot';
export * from './components/empty-state';
export * from './components/error-state';
export * from './components/input';
export * from './components/kicker';
export * from './components/losango';
export * from './components/pill';
export * from './components/skeleton';
export * from './components/sonner';
export * from './components/spark';
export { cn } from './utils';
```

Note: `drawer.tsx` is removed from exports. Delete the file:

```bash
rm packages/ui/src/components/drawer.tsx
```

- [ ] **Step 10: Run typecheck**

```bash
pnpm run typecheck
```

Expected: may fail on `mobile-drawer.tsx` importing `Drawer`. Fix by deleting `mobile-drawer.tsx` and removing its import from `layout.tsx`:

```bash
rm apps/dashboard/src/components/layout/mobile-drawer.tsx
```

Then in `layout.tsx`, remove the `MobileDrawer` import and its usage, and remove the mobile header + menuOpen state. Simplify to:

```tsx
import { type JSX, type ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="grid min-h-screen grid-cols-[252px_1fr]">
      <Sidebar />
      <main className="relative z-[1] overflow-auto">{children}</main>
    </div>
  );
}
```

Re-run typecheck:

```bash
pnpm run typecheck
```

Expected: pass.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(ui): add Imperial Terminal primitives — Crest, Dot, Pill, Chip, Spark, Losango, Kicker, CornerBrackets"
```

---

### Task 6: Adapt existing primitives

**Files:**
- Modify: `packages/ui/src/components/button.tsx`
- Modify: `packages/ui/src/components/input.tsx`
- Modify: `packages/ui/src/components/dialog.tsx`
- Modify: `packages/ui/src/components/alert-dialog.tsx`
- Modify: `packages/ui/src/components/skeleton.tsx`
- Modify: `packages/ui/src/components/empty-state.tsx`
- Modify: `packages/ui/src/components/sonner.tsx`

- [ ] **Step 1: Rewrite button.tsx**

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

const buttonVariants = cva(
  'inline-flex items-center gap-2 whitespace-nowrap font-mono text-xs font-medium uppercase tracking-[0.06em] transition-all duration-[120ms] disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'border border-border-strong bg-transparent text-text-primary hover:border-text-tertiary',
        primary: 'border border-gold bg-gold text-text-ink font-semibold hover:bg-gold-bright hover:border-gold-bright',
        ghost: 'border border-transparent bg-transparent text-text-secondary hover:text-gold hover:border-gold-line hover:bg-gold-soft',
        outline: 'border border-gold-line text-gold hover:border-gold hover:bg-gold-soft',
        danger: 'border border-status-failed/30 text-status-failed hover:bg-status-failed/[0.08] hover:border-status-failed',
      },
      size: {
        sm: 'px-2.5 py-1 text-[10px] tracking-[0.1em]',
        md: 'px-3.5 py-2',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...rest} />
  );
});
```

- [ ] **Step 2: Rewrite input.tsx**

```tsx
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full bg-panel-2 border border-border-subtle px-3 py-2.5 font-mono text-[13px] text-text-primary transition-all duration-[120ms] placeholder:text-text-tertiary focus:border-gold focus:outline-none focus:ring-3 focus:ring-gold-ring',
        className,
      )}
      {...rest}
    />
  );
});
```

- [ ] **Step 3: Rewrite dialog.tsx**

Update `DialogOverlay` to use overlay token, `DialogContent` to use the new styling with corner brackets, `DialogHeader` to include flex between layout, `DialogTitle` to use Fraunces 22px, add `DialogSubtitle`, and `DialogFooter` to use sidebar bg:

```tsx
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentPropsWithoutRef, ElementRef, JSX, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from '../utils';
import { CornerBrackets } from './corner-brackets';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-40 grid place-items-center bg-overlay', className)}
      {...props}
    />
  );
});

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { children: ReactNode }
>(function DialogContent({ className, children, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[560px] max-w-[calc(100vw-48px)] max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 overflow-auto border border-border-subtle bg-panel shadow-float relative',
          className,
        )}
        {...props}
      >
        <CornerBrackets />
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-7 pb-3.5 pt-5.5">
      {children}
    </div>
  );
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('font-serif text-[22px] font-normal tracking-[-0.015em] text-text-primary', className)}
      {...props}
    />
  );
});

export function DialogSubtitle({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <span className={cn('mt-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-gold', className)}>
      {children}
    </span>
  );
}

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-text-secondary', className)}
      {...props}
    />
  );
});

export function DialogBody({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex flex-col gap-4.5 px-7 py-5.5">{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex justify-end gap-2.5 border-t border-border-subtle bg-sidebar px-7 py-4">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Update alert-dialog.tsx similarly**

Same pattern as dialog but with `w-[480px]` max-width on content. Update overlay, content (with CornerBrackets), header, title, footer styling to match. Mirror the dialog changes.

- [ ] **Step 5: Update skeleton.tsx**

```tsx
import type { JSX } from 'react';
import { cn } from '../utils';

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return (
    <div
      className={cn('animate-pulse bg-panel-2', className)}
      aria-busy="true"
      aria-live="polite"
    />
  );
}
```

- [ ] **Step 6: Update empty-state.tsx**

```tsx
import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';
import { Crest } from './crest';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center gap-3.5 border border-border-subtle bg-panel px-8 py-14 text-center', className)}>
      <span className="text-gold/25">
        <Crest size={40} />
      </span>
      <h3 className="font-serif text-[22px] font-normal tracking-[-0.01em] text-text-primary">{title}</h3>
      {description && (
        <p className="max-w-[420px] text-[13px] text-text-secondary">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 7: Update sonner.tsx**

```tsx
import type { JSX } from 'react';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster(): JSX.Element {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        duration: 2400,
        style: {
          background: 'var(--color-panel)',
          border: '1px solid var(--color-border-subtle)',
          borderLeft: '2px solid var(--color-gold)',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          boxShadow: 'var(--shadow-float)',
          borderRadius: '0',
        },
      }}
    />
  );
}
```

- [ ] **Step 8: Run quality-gate**

```bash
pnpm run quality-gate
```

Expected: pass (may have lint warnings about unused imports in consuming components — those get fixed in Phase 3).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): adapt Button, Input, Dialog, AlertDialog, Skeleton, EmptyState, Toaster to Imperial Terminal"
```

---

### Task 7: Create icons component

**Files:**
- Create: `apps/dashboard/src/components/icons.tsx`

- [ ] **Step 1: Create icons.tsx**

Port all icons from `tmp/rebranding/zeno/icons.jsx` as TypeScript React components. Each icon takes `size` prop (default 14):

```tsx
import type { JSX, SVGProps } from 'react';

interface IcoProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Ico({ size = 14, children, ...rest }: IcoProps & { children: JSX.Element | JSX.Element[] }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IcoHome(props: IcoProps): JSX.Element {
  return <Ico {...props}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></Ico>;
}

export function IcoCron(props: IcoProps): JSX.Element {
  return <Ico {...props}><circle cx="12" cy="13" r="7" /><path d="M12 9v4l2.5 2" /><path d="M9 2h6" /></Ico>;
}

export function IcoSessions(props: IcoProps): JSX.Element {
  return <Ico {...props}><path d="M4 6h16v10H9l-5 4z" /></Ico>;
}

export function IcoLogs(props: IcoProps): JSX.Element {
  return <Ico {...props}><path d="M4 5h16M4 10h16M4 15h10M4 20h16" /></Ico>;
}

export function IcoSettings(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .4 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.4 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .4-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.4-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.4H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.4 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Ico>
  );
}

export function IcoSearch(props: IcoProps): JSX.Element {
  return <Ico {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Ico>;
}

export function IcoPlus(props: IcoProps): JSX.Element {
  return <Ico {...props}><path d="M12 5v14M5 12h14" /></Ico>;
}

export function IcoPlay(props: IcoProps): JSX.Element {
  return <Ico {...props}><polygon points="6 4 20 12 6 20 6 4" /></Ico>;
}

export function IcoPause(props: IcoProps): JSX.Element {
  return <Ico {...props}><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></Ico>;
}

export function IcoTrash(props: IcoProps): JSX.Element {
  return <Ico {...props}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" /></Ico>;
}

export function IcoX(props: IcoProps): JSX.Element {
  return <Ico {...props}><path d="M6 6l12 12M18 6L6 18" /></Ico>;
}

export function IcoChevRight(props: IcoProps): JSX.Element {
  return <Ico {...props}><path d="m9 6 6 6-6 6" /></Ico>;
}

export function IcoChevDown(props: IcoProps): JSX.Element {
  return <Ico {...props}><path d="m6 9 6 6 6-6" /></Ico>;
}

export function IcoRefresh(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </Ico>
  );
}

export function IcoAlert(props: IcoProps): JSX.Element {
  return <Ico {...props}><path d="M12 2 2 20h20z" /><path d="M12 9v5M12 17v.5" /></Ico>;
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/icons.tsx
git commit -m "feat(dashboard): add Imperial Terminal icon set"
```

---

## Phase 3 — Dashboard Screens

> **Note for workers:** Each task in this phase rewrites a route or layout component to match the prototype. The canonical reference for each component is the corresponding JSX file in `tmp/rebranding/zeno/`. Read that file and translate it to TypeScript React with Tailwind classes, using the `@zeno/ui` primitives created in Phase 2. Preserve all existing data-fetching hooks and API integration — only the visual layer changes.

### Task 8: Rewrite layout.tsx

**Files:**
- Modify: `apps/dashboard/src/components/layout/layout.tsx`

- [ ] **Step 1: Rewrite layout.tsx**

Reference: `tmp/rebranding/zeno/zeno.css` `.zen-app` class. Grid layout with 252px sidebar + 1fr main. Add the grid overlay pseudo-element via a dedicated div:

```tsx
import { type JSX, type ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="relative grid min-h-screen grid-cols-[252px_1fr]">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: [
            'linear-gradient(to right, rgba(217,179,98,0.022) 1px, transparent 1px)',
            'linear-gradient(to bottom, rgba(217,179,98,0.022) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at 50% 0%, black 20%, transparent 80%)',
        }}
      />
      <Sidebar />
      <main className="relative z-[1] overflow-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/layout/layout.tsx
git commit -m "feat(dashboard): rewrite layout with Imperial Terminal grid + grid overlay"
```

---

### Task 9: Rewrite sidebar

**Files:**
- Modify: `apps/dashboard/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Rewrite sidebar.tsx**

Reference: `tmp/rebranding/zeno/sidebar.jsx`. Full rewrite with brand section, nav group, runtime panel, user footer. Use `Crest`, `Dot` from `@zeno/ui` and icons from `@/components/icons`. Keep `useHealth()` hook for runtime status. Use `Link` from TanStack Router for navigation with `useLocation()` for active state.

The component must include:
- Brand: Crest 22px + "zeno" mono 15px + version hex mono 9px
- Nav group "CONSOLE" label, 5 items (home/crons/sessions/logs/settings) with icons, keyboard hints, active gold state with left bar, badge on logs
- Runtime panel at bottom with status rows
- User footer with avatar, name, "exit" button linking to `/login`

Translate the prototype's `sidebar.jsx` structure to TypeScript with Tailwind classes matching `zeno.css` `.zen-sidebar`, `.zen-brand`, `.zen-nav`, `.zen-status-panel`, `.zen-user` sections.

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/layout/sidebar.tsx
git commit -m "feat(dashboard): rewrite sidebar with Imperial Terminal design"
```

---

### Task 10: Rewrite login page

**Files:**
- Modify: `apps/dashboard/src/routes/login.tsx`

- [ ] **Step 1: Rewrite login.tsx**

Reference: `tmp/rebranding/zeno/login.jsx`. Full rewrite with:
- Fullscreen centered layout with radial gradients and grid pattern
- Aura losango (640px rotated diamond)
- Login card with CornerBrackets, Crest ornate 56px
- "Identify yourself." Fraunces 34px, "Only the king speaks with the king."
- Password input with gold label
- "enter throne room ↵" primary button
- Terminal strip with animated cursor and submit sequence
- Footer metadata (ip, last seen, version)

Keep existing auth logic (POST to `/api/auth/login`, error handling, redirect).

- [ ] **Step 2: Test in browser**

Navigate to `http://localhost:5173/login` (or wherever the dev server runs) and verify the login page matches the prototype screenshot.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/routes/login.tsx
git commit -m "feat(dashboard): rewrite login with Imperial Terminal ceremony"
```

---

### Task 11: Rewrite home page + components

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/index.tsx`
- Modify: `apps/dashboard/src/components/home/stat-tile.tsx`
- Modify: `apps/dashboard/src/components/home/activity-row.tsx`
- Create: `apps/dashboard/src/components/home/next-cron-item.tsx`
- Modify: `apps/dashboard/src/lib/greeting.ts`

- [ ] **Step 1: Update greeting.ts**

Match prototype greetings — return PT-BR greetings based on time of day:

```typescript
export interface Greeting {
  verb: string;
  name: string;
}

export function getGreeting(name: string): Greeting {
  const hour = new Date().getHours();
  let verb: string;
  if (hour >= 5 && hour < 12) verb = 'Bom dia,';
  else if (hour >= 12 && hour < 18) verb = 'Boa tarde,';
  else verb = 'Boa noite,';
  return { verb, name };
}
```

- [ ] **Step 2: Rewrite stat-tile.tsx**

Reference: `home.jsx` StatTile. Add Spark support, variant styling (gold/fail), delta text:

```tsx
import type { JSX, ReactNode } from 'react';
import { Spark } from '@zeno/ui';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  delta?: string;
  variant?: 'gold' | 'fail';
  spark?: number[];
  sparkColor?: string;
}

export function StatTile({ label, value, delta, variant, spark, sparkColor }: StatTileProps): JSX.Element {
  return (
    <div className="relative flex flex-col gap-2 overflow-hidden bg-panel px-5 py-5 transition-colors duration-[120ms] hover:bg-panel-2">
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
        {label}
      </span>
      <span
        className={`font-serif text-[44px] font-normal leading-none tracking-[-0.02em] ${
          variant === 'gold' ? 'text-gold' : variant === 'fail' ? 'text-status-failed' : 'text-text-primary'
        }`}
        style={{ fontFeatureSettings: "'tnum' on, 'lnum' on" }}
      >
        {value}
      </span>
      {delta && (
        <span className="font-mono text-[10px] tracking-[0.06em] text-text-tertiary">{delta}</span>
      )}
      {spark && (
        <span className="absolute bottom-3.5 right-3.5 opacity-45">
          <Spark data={spark} color={sparkColor} />
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite activity-row.tsx**

Reference: `home.jsx` activity rows. Dot + timestamp + event + summary layout.

- [ ] **Step 4: Create next-cron-item.tsx**

Reference: `home.jsx` "what's next" panel items. Countdown in Fraunces italic gold + name + meta + Losango.

- [ ] **Step 5: Rewrite home route index.tsx**

Reference: `tmp/rebranding/zeno/home.jsx`. Full rewrite with hero greeting (Fraunces 56px with word-rise animation), hero ornament, 4-col stats grid with sparklines, two-column split (activity feed left + "what's next" right).

Use existing `useStats()`, `useActivity()`, `useHealth()` hooks. Add `useSparkline()` and `useNextCrons()` hooks (to be created in Phase 4 — for now, pass static mock data to Spark components so the UI renders correctly).

- [ ] **Step 6: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(dashboard): rewrite home page with Imperial Terminal design"
```

---

### Task 12: Rewrite crons pages + components

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/crons.index.tsx`
- Modify: `apps/dashboard/src/routes/_authed/crons.$id.tsx`
- Modify: `apps/dashboard/src/routes/_authed/crons.new.tsx`
- Modify: `apps/dashboard/src/components/crons/cron-row.tsx`
- Modify: `apps/dashboard/src/components/crons/cron-actions.tsx`
- Modify: `apps/dashboard/src/components/crons/cron-form.tsx`
- Modify: `apps/dashboard/src/components/crons/cron-status-pill.tsx`
- Modify: `apps/dashboard/src/components/crons/cron-run-history-row.tsx`
- Modify: `apps/dashboard/src/components/crons/schedule-picker.tsx`

- [ ] **Step 1: Rewrite crons list page**

Reference: `tmp/rebranding/zeno/crons.jsx`. Table with thead bg sidebar, rows with hover gold bar, inline actions appearing on hover. Use `Pill`, `OutlinePill`, `Dot`, `Kicker`, `Button` from `@zeno/ui`.

- [ ] **Step 2: Rewrite cron detail page**

Reference: `tmp/rebranding/zeno/cron-detail.jsx`. Breadcrumb, prompt block with floating PROMPT label, mini stats grid, expandable run history with JSON syntax highlighting.

- [ ] **Step 3: Rewrite cron new page (modal)**

Reference: `tmp/rebranding/zeno/modals.jsx` NewCronModal. Use `Dialog` with corner brackets, `DialogSubtitle`, schedule presets as `Chip` components.

- [ ] **Step 4: Rewrite supporting components**

Update `cron-row.tsx`, `cron-actions.tsx`, `cron-form.tsx`, `cron-status-pill.tsx` (replace with `Pill`), `cron-run-history-row.tsx`, `schedule-picker.tsx` to match prototype styles.

- [ ] **Step 5: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(dashboard): rewrite crons pages with Imperial Terminal design"
```

---

### Task 13: Rewrite sessions pages + components

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/sessions.index.tsx`
- Modify: `apps/dashboard/src/routes/_authed/sessions.$threadId.tsx`
- Modify: `apps/dashboard/src/components/sessions/session-row.tsx`
- Modify: `apps/dashboard/src/components/sessions/message-block.tsx`
- Create: `apps/dashboard/src/components/sessions/tool-call-block.tsx`

- [ ] **Step 1: Rewrite sessions list page**

Reference: `tmp/rebranding/zeno/sessions.jsx` SessionsScreen. Table with search bar, thread+session id, msg count in gold, backend with Dot.

- [ ] **Step 2: Rewrite session detail page**

Reference: `tmp/rebranding/zeno/sessions.jsx` SessionDetailScreen. Breadcrumb, meta row, transcript with role gutters (user=azure, zeno=gold), tool call blocks, live indicator.

- [ ] **Step 3: Create tool-call-block.tsx**

Reference: `sessions.jsx` `.zen-toolcall`. Losango icon + "TOOL · BASH" header + command input + output.

- [ ] **Step 4: Update message-block.tsx and session-row.tsx**

Match prototype styling for message bubbles and session list rows.

- [ ] **Step 5: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(dashboard): rewrite sessions pages with Imperial Terminal design"
```

---

### Task 14: Rewrite logs page + components

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/logs.tsx`
- Modify: `apps/dashboard/src/components/logs/log-row.tsx`
- Modify: `apps/dashboard/src/components/logs/log-json-block.tsx`
- Modify: `apps/dashboard/src/components/logs/log-search-input.tsx`
- Modify: `apps/dashboard/src/components/logs/level-chips.tsx`
- Modify: `apps/dashboard/src/components/logs/time-range-select.tsx`
- Modify: `apps/dashboard/src/components/logs/following-toggle.tsx`

- [ ] **Step 1: Rewrite logs page**

Reference: `tmp/rebranding/zeno/logs.jsx`. Full rewrite with filter row (Chips for levels + search + time range), log list with per-level coloring, expandable JSON with syntax highlighting, following toggle with pulse dot, new log animation.

- [ ] **Step 2: Rewrite supporting components**

Update all log components to match prototype:
- `level-chips.tsx` → use `Chip` from `@zeno/ui`
- `log-search-input.tsx` → match `.zen-search` styling
- `time-range-select.tsx` → use `Chip` for time range options
- `following-toggle.tsx` → match `.zen-follow-btn` with pulse Dot
- `log-row.tsx` → Dot + timestamp + level coloring + event gold + correlation id + click to expand
- `log-json-block.tsx` → syntax highlighting (keys gold, strings azure, numbers violet, booleans jade) matching `colorJSON` function from prototype

- [ ] **Step 3: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(dashboard): rewrite logs page with Imperial Terminal design"
```

---

### Task 15: Rewrite settings page + components

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/settings.tsx`
- Modify: `apps/dashboard/src/components/settings/service-status.tsx`
- Modify: `apps/dashboard/src/components/settings/mcp-server-row.tsx`
- Modify: `apps/dashboard/src/components/settings/profile-file-row.tsx`
- Modify: `apps/dashboard/src/components/settings/restart-dialog.tsx`

- [ ] **Step 1: Rewrite settings page**

Reference: `tmp/rebranding/zeno/settings.jsx`. Sections: backend (with gold bar left + ACTIVE pill), MCP servers list, profile files list, about key-value list. Restart button as danger variant.

- [ ] **Step 2: Rewrite restart-dialog**

Reference: `tmp/rebranding/zeno/modals.jsx` ConfirmRestartModal. AlertDialog with danger subtitle, countdown animation, bullet points about consequences.

- [ ] **Step 3: Update supporting components**

Match prototype styling for each settings component.

- [ ] **Step 4: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(dashboard): rewrite settings page with Imperial Terminal design"
```

---

### Task 16: Update skeletons

**Files:**
- Modify: all files in `apps/dashboard/src/components/skeletons/`

- [ ] **Step 1: Update all skeleton files**

Adjust each skeleton to use `bg-panel-2` instead of `bg-panel`, and match the new layout dimensions from the rewritten pages (e.g., stat tile skeletons should be 4-col grid, activity skeletons should match new row layout).

- [ ] **Step 2: Run quality-gate**

```bash
pnpm run quality-gate
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(dashboard): update skeletons for Imperial Terminal design"
```

---

## Phase 4 — API Gaps

### Task 17: Add sparkline endpoint

**Files:**
- Modify: `packages/storage/src/repos/cron-runs.ts`
- Modify: `packages/storage/src/repos/sessions.ts`
- Modify: `apps/api/src/routes/stats.ts`
- Create: `apps/dashboard/src/lib/use-sparkline.ts`

- [ ] **Step 1: Add sparkline method to CronRunRepo**

In `packages/storage/src/repos/cron-runs.ts`, add:

```typescript
sparkline(metric: 'runs' | 'failures', hours = 24): Array<{ hour: string; count: number }> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const condition = metric === 'failures' ? "AND status = 'failed'" : '';
  const rows = this.db
    .prepare(
      `SELECT strftime('%Y-%m-%dT%H:00:00Z', started_at) AS hour, COUNT(*) AS count
       FROM cron_runs
       WHERE started_at >= ? ${condition}
       GROUP BY hour
       ORDER BY hour ASC`,
    )
    .all(since) as Array<{ hour: string; count: number }>;

  const buckets = new Map(rows.map((r) => [r.hour, r.count]));
  const result: Array<{ hour: string; count: number }> = [];
  const now = new Date();
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600_000);
    const key = `${d.toISOString().slice(0, 13)}:00:00Z`;
    result.push({ hour: key, count: buckets.get(key) ?? 0 });
  }
  return result;
}
```

- [ ] **Step 2: Add sparkline method to SessionRepo**

In `packages/storage/src/repos/sessions.ts`, add:

```typescript
sparkline(hours = 24): Array<{ hour: string; count: number }> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = this.db
    .prepare(
      `SELECT strftime('%Y-%m-%dT%H:00:00Z', last_used_at) AS hour, COUNT(*) AS count
       FROM sessions
       WHERE last_used_at >= ?
       GROUP BY hour
       ORDER BY hour ASC`,
    )
    .all(since) as Array<{ hour: string; count: number }>;

  const buckets = new Map(rows.map((r) => [r.hour, r.count]));
  const result: Array<{ hour: string; count: number }> = [];
  const now = new Date();
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600_000);
    const key = `${d.toISOString().slice(0, 13)}:00:00Z`;
    result.push({ hour: key, count: buckets.get(key) ?? 0 });
  }
  return result;
}
```

- [ ] **Step 3: Add sparkline route**

In `apps/api/src/routes/stats.ts`, add a `GET /sparkline` handler:

```typescript
app.get('/sparkline', async (c) => {
  const metric = c.req.query('metric') ?? 'runs';
  const hours = Number(c.req.query('hours') ?? '24');

  if (metric === 'sessions') {
    const buckets = deps.sessions.sparkline(hours);
    return c.json({ buckets });
  }

  const buckets = deps.cronRuns.sparkline(
    metric as 'runs' | 'failures',
    hours,
  );
  return c.json({ buckets });
});
```

- [ ] **Step 4: Create useSparkline hook**

Create `apps/dashboard/src/lib/use-sparkline.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';

interface SparklineResponse {
  buckets: Array<{ hour: string; count: number }>;
}

export function useSparkline(metric: 'runs' | 'sessions' | 'failures') {
  return useQuery({
    queryKey: ['sparkline', metric],
    queryFn: () => apiClient<SparklineResponse>(`/api/stats/sparkline?metric=${metric}`),
    refetchInterval: 60_000,
    select: (data) => data.buckets.map((b) => b.count),
  });
}
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): add sparkline endpoint for hourly metric buckets"
```

---

### Task 18: Add next-crons endpoint

**Files:**
- Modify: `packages/storage/src/repos/crons.ts`
- Modify: `apps/api/src/routes/crons.ts`
- Create: `apps/dashboard/src/lib/use-next-crons.ts`

- [ ] **Step 1: Add next method to CronRepo**

In `packages/storage/src/repos/crons.ts`, add:

```typescript
next(limit = 3): Array<Cron> {
  return this.db
    .prepare(
      `SELECT * FROM crons
       WHERE enabled = 1 AND next_run_at IS NOT NULL
       ORDER BY next_run_at ASC
       LIMIT ?`,
    )
    .all(limit) as Array<Cron>;
}
```

- [ ] **Step 2: Add next route**

In `apps/api/src/routes/crons.ts`, add a `GET /next` handler (before the `GET /:id` route to avoid conflict):

```typescript
app.get('/next', async (c) => {
  const limit = Number(c.req.query('limit') ?? '3');
  const crons = deps.crons.next(limit);
  return c.json(crons.map((cr) => ({
    id: cr.id,
    name: cr.name,
    schedule: cr.schedule,
    nextRunAt: cr.nextRunAt,
    notifyConversationId: cr.notifyConversationId,
  })));
});
```

- [ ] **Step 3: Create useNextCrons hook**

Create `apps/dashboard/src/lib/use-next-crons.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';

interface NextCron {
  id: string;
  name: string;
  schedule: string;
  nextRunAt: string;
  notifyConversationId?: string;
}

export function useNextCrons(limit = 3) {
  return useQuery({
    queryKey: ['next-crons', limit],
    queryFn: () => apiClient<NextCron[]>(`/api/crons/next?limit=${limit}`),
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 4: Wire hooks into home page**

Update `apps/dashboard/src/routes/_authed/index.tsx` to replace any mock sparkline data with the real `useSparkline()` hook, and wire `useNextCrons()` into the "what's next" panel.

- [ ] **Step 5: Run quality-gate**

```bash
pnpm run quality-gate
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): add next-crons endpoint and wire sparkline + next-crons to home page"
```

---

### Task 19: Final verification

- [ ] **Step 1: Run full quality gate**

```bash
pnpm run quality-gate
```

- [ ] **Step 2: Start the dashboard dev server and verify all screens**

Build and verify each screen matches the prototype:
1. Login — aura, crest, terminal strip, submit animation
2. Home — greeting, stats with sparklines, activity, what's next
3. Crons — table, hover actions, status pills
4. Cron detail — breadcrumb, prompt block, run history
5. Sessions — table, search
6. Session detail — transcript, tool calls, live indicator
7. Logs — filters, live tail, JSON expand, syntax highlighting
8. Settings — backend, MCP, profile files, about

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix(dashboard): final polish for Imperial Terminal rebranding"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-4 | Tokens, fonts, kill light mode, rename accent→gold |
| 2 | 5-7 | New primitives, adapt existing primitives, icons |
| 3 | 8-16 | Rewrite all screens (layout, sidebar, login, home, crons, sessions, logs, settings, skeletons) |
| 4 | 17-19 | Sparkline endpoint, next-crons endpoint, final verification |

All work on branch `feat/imperial-terminal-rebranding`. Open PR via `/open-pr` after Task 19.
