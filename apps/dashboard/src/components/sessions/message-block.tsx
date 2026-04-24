import type { JSX } from 'react';
import type { SessionMessageApi } from '@/lib/use-session';
import { ToolCallBlock } from './tool-call-block';

export function MessageBlock({ message }: { message: SessionMessageApi }): JSX.Element {
  const isUser = message.role === 'user';
  const gutterBoldColor = isUser ? 'text-status-info' : 'text-gold';
  const borderColor = isUser ? 'border-l-status-info' : 'border-l-gold';

  return (
    <div className="grid grid-cols-[80px_1fr] gap-4">
      <div className="pt-1 text-right font-mono text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
        <b className={`mb-0.5 block font-medium ${gutterBoldColor}`}>{message.author}</b>
        <span>{message.timestamp}</span>
      </div>
      <div>
        <div
          className={`border border-border-subtle border-l-2 ${borderColor} bg-panel-2 px-3.5 py-2.5 font-mono text-[13px] leading-[1.6] whitespace-pre-wrap text-text-primary`}
        >
          {message.text}
        </div>
        {message.toolCalls.length > 0 &&
          message.toolCalls.map((tc) => {
            const inputText =
              typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input);
            return <ToolCallBlock key={`${tc.tool}:${inputText}`} toolCall={tc} />;
          })}
      </div>
    </div>
  );
}
