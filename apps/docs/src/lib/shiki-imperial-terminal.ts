import githubDarkDefault from '@shikijs/themes/github-dark-default';

/**
 * Imperial Terminal shiki theme — forked from `github-dark-default`.
 *
 * Surgical overrides on top of the base theme:
 * - `editor.background` → #08090F (Imperial canvas)
 * - `editor.foreground` → #e8eaf5 (Imperial text-primary)
 * - keyword / storage tokens → Imperial gold (#d9b362), used sparingly
 *
 * Everything else inherits from github-dark-default to keep language coverage
 * (TS, Bash, JSON, TSX, Markdown, regex, diff, etc.) robust. The base theme
 * is frozen (and typed `readonly`) so we deep-clone via JSON and treat the
 * clone as a plain mutable object before passing to shiki.
 */
const IMPERIAL_GOLD = '#d9b362';
const IMPERIAL_CANVAS = '#08090F';
const IMPERIAL_FOREGROUND = '#e8eaf5';

interface MutableTokenColor {
  scope: string | string[] | undefined;
  settings?: Record<string, string>;
}

interface MutableTheme {
  name?: string;
  displayName?: string;
  type?: string;
  colors?: Record<string, string>;
  tokenColors?: MutableTokenColor[];
  semanticHighlighting?: boolean;
}

function buildImperialTheme(): MutableTheme {
  const theme = JSON.parse(JSON.stringify(githubDarkDefault)) as MutableTheme;

  if (theme.colors) {
    theme.colors['editor.background'] = IMPERIAL_CANVAS;
    theme.colors['editor.foreground'] = IMPERIAL_FOREGROUND;
    theme.colors.foreground = IMPERIAL_FOREGROUND;
  }

  // Override keyword / storage token foregrounds to Imperial gold.
  // github-dark-default ships these scopes with coral (#ff7b72); the new
  // tint is gold but limited to control-flow + storage so it doesn't wash
  // the whole syntax tree.
  const goldScopes = new Set(['keyword', 'storage', 'storage.type']);
  for (const tokenColor of theme.tokenColors ?? []) {
    const scopes = Array.isArray(tokenColor.scope) ? tokenColor.scope : [tokenColor.scope];
    if (scopes.some((scope) => typeof scope === 'string' && goldScopes.has(scope))) {
      tokenColor.settings = { ...(tokenColor.settings ?? {}), foreground: IMPERIAL_GOLD };
    }
  }

  theme.name = 'imperial-terminal';
  theme.displayName = 'Imperial Terminal';

  return theme;
}

export const imperialTerminalTheme = buildImperialTheme();
