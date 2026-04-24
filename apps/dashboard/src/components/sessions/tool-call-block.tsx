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
    <div className="mt-2 border border-border-subtle bg-panel p-3">
      <div className="flex items-center gap-2">
        <Losango size={4} color="var(--gold)" />
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-gold">
          tool · {toolCall.tool}
        </span>
        {toolCall.duration && (
          <>
            <span className="flex-1" />
            <span className="font-mono text-[9px] text-text-tertiary">{toolCall.duration}</span>
          </>
        )}
      </div>
      <div className="mt-2 whitespace-pre-wrap font-mono text-xs text-text-primary">
        $ {inputText}
      </div>
      {toolCall.output && (
        <div className="mt-1 whitespace-pre-wrap font-mono text-xs text-status-active">
          ↳ {toolCall.output}
        </div>
      )}
    </div>
  );
}
