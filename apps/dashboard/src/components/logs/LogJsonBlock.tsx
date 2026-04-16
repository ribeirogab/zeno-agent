import type { JSX } from 'react';

function prettyPrint(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return payload;
  }
}

export function LogJsonBlock({ payload }: { payload: string }): JSX.Element {
  return (
    <pre className="whitespace-pre-wrap rounded-md border border-border-subtle bg-canvas p-3 font-mono text-[11px] leading-5 text-text-secondary">
      {prettyPrint(payload)}
    </pre>
  );
}
