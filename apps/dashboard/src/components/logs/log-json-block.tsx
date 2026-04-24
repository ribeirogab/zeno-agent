import type { JSX } from 'react';

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

function colorizeJson(raw: string): string {
  return raw
    .replace(
      /"([^"]+)":/g,
      '<span class="text-gold">"$1"</span>:',
    )
    .replace(
      /: "([^"]*)"/g,
      ': <span style="color:#a5b8e8">"$1"</span>',
    )
    .replace(
      /: (\d+(\.\d+)?)/g,
      ': <span style="color:#b57aea">$1</span>',
    )
    .replace(
      /: (true|false|null)/g,
      ': <span class="text-status-active">$1</span>',
    );
}

export function LogJsonBlock({
  payload,
  levelTone = 'active',
}: {
  payload: string;
  levelTone?: LevelTone;
}): JSX.Element {
  const formatted = prettyPrint(payload);
  const highlighted = colorizeJson(formatted);

  return (
    <pre
      className={`whitespace-pre-wrap rounded border border-border-subtle border-l-2 bg-canvas p-3 font-mono text-[11px] leading-[1.7] text-text-secondary ${LEVEL_BORDER_COLOR[levelTone]}`}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}
