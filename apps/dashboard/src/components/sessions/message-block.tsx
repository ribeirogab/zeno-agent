import type { JSX } from 'react';
import type { SessionMessageApi } from '@/lib/use-session';
import { ToolCallBlock } from './tool-call-block';

export function MessageBlock({ message }: { message: SessionMessageApi }): JSX.Element {
  const isUser = message.role === 'user';
  const roleColor = isUser ? 'text-status-info' : 'text-gold';
  const borderColor = isUser ? 'border-l-status-info' : 'border-l-gold';

  return (
    <div className="grid grid-cols-[80px_1fr] gap-0">
      <div className={`flex flex-col gap-0.5 pt-3 ${roleColor}`}>
        <span className="text-xs font-bold">{message.author}</span>
        <span className="font-mono text-[10px] text-text-tertiary">{message.timestamp}</span>
      </div>
      <div>
        <div
          className={`border-l-2 ${borderColor} bg-panel-2 p-3 whitespace-pre-wrap text-sm leading-6 text-text-primary`}
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
