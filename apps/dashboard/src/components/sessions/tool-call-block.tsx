import type { JSX } from 'react';

export interface ToolCallData {
  tool: string;
  input: unknown;
  output?: string;
  duration?: string;
}

/**
 * Compact tool-call card under a message. Visual reference:
 * `apps/design/src/routes/dashboard/sessions/detail/index.tsx` — `<ToolBlock>`.
 */
export function ToolCallBlock({ toolCall }: { toolCall: ToolCallData }): JSX.Element {
  const inputText =
    typeof toolCall.input === 'object' ? JSON.stringify(toolCall.input) : String(toolCall.input);

  return (
    <div className="bg-canvas border border-border-subtle px-3.5 py-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <DiamondIcon />
        <span className="font-mono text-[9px] tracking-[0.15em] leading-3 uppercase text-gold">
          tool · {toolCall.tool}
        </span>
        {toolCall.duration ? (
          <span className="ml-auto font-mono text-[9px] tracking-[0.15em] leading-3 uppercase text-text-tertiary">
            {toolCall.duration}
          </span>
        ) : null}
      </div>
      <pre className="font-mono text-[11px] leading-[14px] text-text-primary m-0 whitespace-pre-wrap">
        {inputText}
      </pre>
      {toolCall.output ? (
        <pre className="font-mono text-[11px] leading-[14px] text-status-active m-0 whitespace-pre-wrap">
          {toolCall.output}
        </pre>
      ) : null}
    </div>
  );
}

function DiamondIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
      <path d="M5 0 L10 5 L5 10 L0 5 Z" stroke="#D9B362" fill="none" />
    </svg>
  );
}
