---
tags:
  - learning
  - gotcha
related:
  - "[[tailwind-merge-position-conflict]]"
created: 2026-04-24
---
# CSS animations referencing missing @keyframes fail silently

When a Tailwind `animate-[name_duration_easing]` class references a `@keyframes` name that doesn't exist in any loaded stylesheet, the element renders but the animation simply doesn't run. There's no console error, no build warning — it's completely silent.

## Context

The Dialog overlay used `animate-[fade-in_200ms_ease-out]` and content used `animate-[dialog-in_240ms_ease-out]`, but the `@keyframes fade-in` and `@keyframes dialog-in` blocks were never added to `globals.css`. The dialog rendered in the DOM but was invisible because the `fade-in` animation never ran (the overlay stayed at its initial state, which for a `from { opacity: 0 }` animation means invisible).

## How It Works

Tailwind v4's arbitrary animation syntax `animate-[name_duration_easing]` generates valid CSS `animation: name duration easing`. But Tailwind does NOT generate the `@keyframes` block — that must be defined manually. If the keyframes don't exist, the browser treats the animation as if it has no effect.

The prototype's `zeno.css` defined these keyframes inline. When porting to Tailwind, the class was ported but the keyframe definition was missed.

## How to Apply

- When using `animate-[custom-name]` in Tailwind, always verify the matching `@keyframes custom-name` exists in `globals.css` or `tokens.css`
- After porting CSS from a prototype to Tailwind, grep for all `@keyframes` in the source and ensure each one has a corresponding definition in the target
- If a Radix dialog/overlay exists in the DOM but is invisible, check for missing keyframes in addition to position conflicts
