import type { JSX } from 'react';
import type { SessionMessageApi } from '@/lib/use-session';
import { ToolCallBlock } from './tool-call-block';

/**
 * One message in the session transcript. Visual reference:
 * `apps/design/src/routes/dashboard/sessions/detail/index.tsx` — `<MessageRow>`.
 *
 * Maps the dashboard's `SessionMessageApi` to the design's user/zeno layout:
 * `role === 'user'` → cyan info-tone border, `role === 'assistant'` → gold.
 */
export function MessageBlock({ message }: { message: SessionMessageApi }): JSX.Element {
  const isUser = message.role === 'user';
  const author = isUser ? message.author || 'user' : 'zeno';
  const authorColor = isUser ? 'text-status-info' : 'text-gold';
  const borderColor = isUser ? 'border-l-status-info' : 'border-l-gold';
  const ts = formatTs(message.timestamp);

  return (
    <div className="flex items-start gap-4">
      <div className="shrink-0 w-20 pt-1 flex flex-col gap-[2px]">
        <span
          className={`text-right font-mono text-[10px] font-medium tracking-[0.12em] leading-3 uppercase ${authorColor}`}
        >
          {author}
        </span>
        <span className="text-right font-mono text-[10px] tracking-[0.12em] leading-3 uppercase text-text-tertiary">
          {ts}
        </span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <div
          className={`bg-panel-2 border border-border-subtle border-l-2 ${borderColor} px-3.5 py-2.5`}
        >
          <p className="font-sans text-[13px] leading-[23px] text-text-primary m-0 whitespace-pre-wrap">
            {message.text}
          </p>
        </div>
        {message.toolCalls.length > 0
          ? message.toolCalls.map((tc) => {
              const inputText =
                typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input);
              return <ToolCallBlock key={`${tc.tool}:${inputText}`} toolCall={tc} />;
            })
          : null}
      </div>
    </div>
  );
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
