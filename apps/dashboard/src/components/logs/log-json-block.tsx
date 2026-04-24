import type { JSX, ReactNode } from 'react';

type LevelTone = 'active' | 'paused' | 'failed';

const LEVEL_BORDER_COLOR: Record<LevelTone, string> = {
  active: 'border-l-status-active',
  paused: 'border-l-status-paused',
  failed: 'border-l-status-failed',
};

function prettyPrint(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return payload;
  }
}

interface Token {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

function tokenizeJson(raw: string): Token[] {
  const tokens: Token[] = [];
  const regex = /"([^"]+)":|: "([^"]*)"|: (\d+(?:\.\d+)?)|: (true|false|null)|([^":\d]+)/g;
  let lastIndex = 0;

  for (const match of raw.matchAll(regex)) {
    if (match.index > lastIndex) {
      tokens.push({ text: raw.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      tokens.push({ text: `"${match[1]}":`, className: 'text-gold' });
    } else if (match[2] !== undefined) {
      tokens.push({ text: ': ' });
      tokens.push({ text: `"${match[2]}"`, style: { color: '#a5b8e8' } });
    } else if (match[3] !== undefined) {
      tokens.push({ text: ': ' });
      tokens.push({ text: match[3], style: { color: '#b57aea' } });
    } else if (match[4] !== undefined) {
      tokens.push({ text: ': ' });
      tokens.push({ text: match[4], className: 'text-status-active' });
    } else if (match[5] !== undefined) {
      tokens.push({ text: match[5] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < raw.length) {
    tokens.push({ text: raw.slice(lastIndex) });
  }

  return tokens;
}

function renderTokens(tokens: Token[]): ReactNode[] {
  return tokens.map((token) => {
    if (token.className || token.style) {
      return (
        <span key={token.text} className={token.className} style={token.style}>
          {token.text}
        </span>
      );
    }
    return token.text;
  });
}

export function LogJsonBlock({
  payload,
  levelTone = 'active',
}: {
  payload: string;
  levelTone?: LevelTone;
}): JSX.Element {
  const formatted = prettyPrint(payload);
  const tokens = tokenizeJson(formatted);

  return (
    <pre
      className={`overflow-x-auto whitespace-pre border border-border-subtle border-l-2 bg-canvas px-[18px] py-3.5 font-mono text-[11px] leading-[1.7] text-text-primary ${LEVEL_BORDER_COLOR[levelTone]}`}
    >
      {renderTokens(tokens)}
    </pre>
  );
}
