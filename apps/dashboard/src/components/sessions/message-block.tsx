import type { JSX } from 'react';
import type { SessionMessageApi } from '@/lib/use-session';

export function MessageBlock({ message }: { message: SessionMessageApi }): JSX.Element {
  const authorColor = message.role === 'assistant' ? 'text-accent' : 'text-text-primary';
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-baseline gap-2">
        <span className={`font-mono text-xs font-medium ${authorColor}`}>{message.author}</span>
        <span className="text-[11px] text-text-tertiary">{message.timestamp}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-text-primary">{message.text}</div>
      {message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          {message.toolCalls.map((tc) => {
            const inputText =
              typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input);
            return (
              <span
                key={`${tc.tool}:${inputText}`}
                className="font-mono text-[11px] text-text-tertiary"
              >
                → {tc.tool}({inputText})
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
