import { Losango } from '@zeno/ui';
import type { JSX } from 'react';

export interface ToolCallData {
  tool: string;
  input: unknown;
  output?: string;
  duration?: string;
}

export function ToolCallBlock({ toolCall }: { toolCall: ToolCallData }): JSX.Element {
  const inputText =
    typeof toolCall.input === 'object' ? JSON.stringify(toolCall.input) : String(toolCall.input);

  return (
    <div className="mt-2.5 flex flex-col gap-1 border border-border-subtle bg-canvas px-3.5 py-2.5 font-mono text-[11px]">
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.15em] text-gold">
        <Losango size={4} color="var(--color-gold)" />
        <span>tool · {toolCall.tool}</span>
        {toolCall.duration && (
          <span className="ml-auto text-text-tertiary">{toolCall.duration}</span>
        )}
      </div>
      <div className="whitespace-pre-wrap text-text-primary">$ {inputText}</div>
      {toolCall.output && (
        <div className="whitespace-pre-wrap text-status-active">↳ {toolCall.output}</div>
      )}
    </div>
  );
}
