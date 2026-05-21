---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-20-knowledge-browser-page/spec-knowledge-browser-page]]"
created: 2026-05-21
---
# `react-markdown` passes `data-*` from `hProperties` to `components.a` — use it to switch element type

When a custom remark plugin transforms a token into a node with `data: { hName: 'span', hProperties: { 'data-broken': 'true' } }`, react-markdown forwards those `data-*` attributes through to the matching component override. The `components.a` (or any other) handler can read `data-broken` from its props and decide to render a `<span>` instead of an `<a>` — no need to add a separate `wikilink-broken` component or a custom block-level node type. This keeps the remark plugin focused on transformation and the React side focused on presentation.

## Context

Hit while implementing the wikilink remark plugin for spec [[../specs/2026-05-20-knowledge-browser-page/spec-knowledge-browser-page|2026-05-20-knowledge-browser-page]]. Broken wikilinks `[[ghost]]` need to render as a non-clickable styled span with a tooltip; resolved ones become `<a href="?file=…">`. The naive option — emit a `<link>` mdast node for both and let `components.a` always render `<a>` — left broken links clickable with no href, which UX-wise is "do nothing on click", confusing.

The fix is to emit a `text` mdast node (not a `link`) for broken slugs, with `hName: 'span'` so react-markdown renders a `<span>` directly:

```ts
const brokenNode: Text = {
  type: 'text',
  value: slug,
  data: {
    hName: 'span',
    hProperties: {
      'data-broken': 'true',
      title: `wikilink not found: ${slug}`,
      className: 'wikilink-broken',
    },
  },
};
```

For resolved slugs, emit a normal `link` node with `data.hProperties` carrying additional attributes like `data-wikilink`. The `components.a` override can then defensively check `data-broken` in case the plugin contract ever changes:

```tsx
const markdownComponents: Components = {
  a({ href, children, ...props }) {
    const dataBroken = (props as { 'data-broken'?: string })['data-broken'];
    if (dataBroken === 'true') {
      return <span {...(props as Record<string, unknown>)} className="wikilink-broken">{children}</span>;
    }
    return <a {...props} href={href}>{children}</a>;
  },
};
```

## How to Apply

When designing a remark plugin that has multiple render outputs for a single token kind:

1. Use `hName` to dictate the HTML tag for non-link cases (`'span'`, `'mark'`, etc.) — react-markdown honors it.
2. Pass any toggle/metadata via `hProperties['data-*']` so the React side can distinguish without parsing class names or text content.
3. Keep the `components.<tag>` override defensive: check `data-*` flags even if you only emit one variant today. Cheap, future-proofs the boundary.

Avoid: encoding the toggle in the `className` and parsing it in the component (fragile, breaks if Tailwind classes are appended), or splitting into two custom remark node types (more work, more boilerplate).
