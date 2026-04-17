# @zeno/ui

Shared visual primitives for Zeno apps. Consumed as TypeScript source — no
build step. Designed for Vite (`moduleResolution: "Bundler"`) consumers.

## Usage

```typescript
import { Button, Dialog, Input, cn } from '@zeno/ui';
```

Import the design tokens stylesheet once from the consumer app entry:

```css
@import "@zeno/ui/styles/tokens.css";
```

The token CSS carries the Tailwind v4 `@theme` block and an `@source` directive
so consumers don't need to configure content globs for this package.

React is a peer dependency — the consumer app must provide it.
