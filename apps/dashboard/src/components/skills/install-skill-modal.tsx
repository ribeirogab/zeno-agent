import { CornerBrackets, Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { useInstallSkill } from '@/lib/use-skills';

interface ParsedPreview {
  name: string;
  description: string;
  bodyLength: number;
}

interface ServerError {
  code: 'invalid_frontmatter' | 'skill_already_exists' | 'unknown';
  message: string;
  errors?: Array<{ field: string; code: string; message: string }>;
}

export function InstallSkillModal({ onClose }: { onClose: () => void }): JSX.Element {
  const install = useInstallSkill();
  const [content, setContent] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedPreview | null>(null);
  const [error, setError] = useState<ServerError | null>(null);

  const onFileChosen = async (file: File) => {
    const text = await file.text();
    setContent(text);
    setFilename(file.name);
    setParsed(parseFrontmatterClient(text));
    setError(null);
  };

  const onConfirm = async () => {
    if (!content) return;
    setError(null);
    try {
      await install.mutateAsync({ content });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as {
          error: string;
          message?: string;
          errors?: Array<{ field: string; code: string; message: string }>;
        } | null;
        if (body?.error === 'invalid_frontmatter') {
          const next: ServerError = {
            code: 'invalid_frontmatter',
            message: 'Invalid frontmatter.',
          };
          if (body.errors) next.errors = body.errors;
          setError(next);
          return;
        }
        if (body?.error === 'skill_already_exists') {
          setError({
            code: 'skill_already_exists',
            message: body.message ?? 'Skill já existe.',
          });
          return;
        }
      }
      setError({
        code: 'unknown',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const valid = parsed !== null && error === null;
  const destructive =
    error?.code === 'invalid_frontmatter' || error?.code === 'skill_already_exists';

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[640px]">
        <CornerBrackets />
        <Header destructive={destructive} filename={filename ?? 'SKILL.md'} />
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          {!content && <Dropzone onFileChosen={onFileChosen} />}
          {content && (
            <FilePreview
              filename={filename ?? 'SKILL.md'}
              bytes={content.length}
              parsed={parsed}
              destructive={destructive}
            />
          )}
          {parsed && !error && (
            <NameDescPreview name={parsed.name} description={parsed.description} />
          )}
          {error && <ErrorBlock error={error} />}
        </div>
        <div className="flex items-center justify-between gap-2.5 bg-sidebar border-t border-border-subtle px-7 pt-4 pb-[22px]">
          <span className="font-mono text-[10px] tracking-[0.06em] text-text-tertiary">
            {!content && 'pick a SKILL.md from disk'}
            {content && valid && `ready to install · ${content.length} bytes`}
            {content && error && 'install blocked · fix and re-upload'}
          </span>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center px-3.5 py-2 border border-border-strong font-mono text-xs font-medium tracking-[0.06em] uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!valid || install.isPending}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-bold tracking-[0.06em] uppercase text-text-ink hover:bg-gold/90 disabled:opacity-50 transition-colors duration-[120ms]"
            >
              {install.isPending ? 'installing…' : 'install skill'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Header({
  destructive,
  filename,
}: {
  destructive: boolean;
  filename: string;
}): JSX.Element {
  return (
    <div
      className={`flex items-start gap-3 border-b ${
        destructive ? 'border-status-failed/30' : 'border-border-subtle'
      } pt-[22px] px-7 pb-3.5`}
    >
      <div className="flex flex-col gap-1">
        <span
          className={`font-mono text-[10px] tracking-[0.2em] uppercase ${
            destructive ? 'text-status-failed' : 'text-gold'
          }`}
        >
          {destructive ? 'install · cannot proceed' : 'install · skill'}
        </span>
        <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
          Install{' '}
          <em className={`italic ${destructive ? 'text-status-failed' : 'text-gold'}`}>
            {filename}
          </em>
        </DialogTitle>
      </div>
    </div>
  );
}

function Dropzone({ onFileChosen }: { onFileChosen: (file: File) => void }): JSX.Element {
  return (
    <label
      htmlFor="skill-file"
      className="border border-dashed border-gold-line bg-gold-soft/[0.04] hover:bg-gold-soft/10 px-12 py-10 flex flex-col items-center gap-2 cursor-pointer transition-colors duration-[120ms]"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-gold"
        role="img"
        aria-label="Upload"
      >
        <title>Upload</title>
        <path d="M12 4 V16 M6 10 L12 4 L18 10" />
        <path d="M4 21 H20" />
      </svg>
      <span className="font-mono text-[13px] text-text-primary">Drop a SKILL.md here</span>
      <span className="font-mono text-[11px] text-text-tertiary">or click to choose</span>
      <input
        id="skill-file"
        type="file"
        accept=".md,text/markdown"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileChosen(f);
        }}
      />
    </label>
  );
}

function FilePreview({
  filename,
  bytes,
  parsed,
  destructive,
}: {
  filename: string;
  bytes: number;
  parsed: ParsedPreview | null;
  destructive: boolean;
}): JSX.Element {
  return (
    <div
      className={`flex items-center py-2.5 px-3.5 gap-3 ${
        destructive
          ? 'bg-status-failed/[0.06] border border-status-failed/30'
          : parsed
            ? 'bg-status-active/[0.06] border border-status-active/30'
            : 'bg-panel-2 border border-border-subtle'
      }`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={destructive ? '#F5718C' : parsed ? '#5BD17C' : '#8A8FAB'}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        role="img"
        aria-label="File"
      >
        <title>File</title>
        <path d="M5 4 L19 4 V20 L5 20 Z" />
        {destructive ? (
          <path d="M9 9 L15 15 M15 9 L9 15" />
        ) : parsed ? (
          <path d="M9 12 L11 14 L15 10" />
        ) : null}
      </svg>
      <div className="flex flex-col grow shrink basis-0 min-w-0 gap-0.5">
        <span className="font-mono text-xs leading-4 text-text-primary">{filename}</span>
        <span className="font-mono text-[10px] leading-3 text-text-tertiary">
          {(bytes / 1024).toFixed(1)} KB · {parsed ? 'frontmatter parseado' : 'parseando…'}
        </span>
      </div>
      <span
        className={`font-mono text-[10px] tracking-[0.12em] uppercase ${
          destructive ? 'text-status-failed' : parsed ? 'text-status-active' : 'text-text-tertiary'
        }`}
      >
        {destructive ? 'invalid' : parsed ? 'valid' : 'parsing'}
      </span>
    </div>
  );
}

function NameDescPreview({
  name,
  description,
}: {
  name: string;
  description: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <Field label="name" value={name} mono />
      <Field label="description" value={description} />
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-gold">{label}</span>
      <div
        className={`bg-panel-2 border border-border-subtle px-3.5 py-2.5 ${mono ? 'font-mono' : 'font-sans'} text-[13px] text-text-primary`}
      >
        {value}
      </div>
    </div>
  );
}

function ErrorBlock({ error }: { error: ServerError }): JSX.Element {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 bg-status-failed/[0.06] border-t border-l-2 border-b border-r border-status-failed/30 border-l-status-failed">
      <div className="flex items-center gap-2.5">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#F5718C"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="Warning"
        >
          <title>Warning</title>
          <path d="M12 3 L21 19 L3 19 Z" />
          <path d="M12 9 V13 M12 16 V16.5" />
        </svg>
        <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-status-failed font-semibold">
          {error.code === 'skill_already_exists' ? 'name conflict' : 'validation errors'}
        </span>
      </div>
      <p className="m-0 font-sans text-[13px] leading-[18px] text-text-secondary">
        {error.message}
      </p>
      {error.errors && (
        <ul className="m-0 list-none flex flex-col gap-1.5 pl-0">
          {error.errors.map((e) => (
            <li
              key={`${e.field}-${e.code}`}
              className="flex items-start gap-3 px-3 py-2 bg-panel border border-status-failed/20"
            >
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-status-failed font-semibold w-[80px] shrink-0 pt-0.5">
                {e.code === 'required'
                  ? 'required'
                  : e.code === 'invalid_format'
                    ? 'format'
                    : e.code}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-mono text-xs text-text-primary">
                  {e.field}: <span className="text-status-failed">{e.message}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Best-effort client-side parse for the install preview. The server's parser
 * (apps/api/src/lib/parse-skill-frontmatter.ts) is the source of truth.
 */
function parseFrontmatterClient(content: string): ParsedPreview | null {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const [, yaml, body] = m;
  if (!yaml) return null;
  let name = '';
  let description = '';
  for (const line of yaml.split(/\n/)) {
    const nameMatch = line.match(/^name:\s*(.+?)\s*$/);
    if (nameMatch?.[1]) name = nameMatch[1].replace(/^["']|["']$/g, '');
    const descMatch = line.match(/^description:\s*(.+?)\s*$/);
    if (descMatch?.[1]) description = descMatch[1].replace(/^["']|["']$/g, '');
  }
  if (!name || !description) return null;
  return { name, description, bodyLength: (body ?? '').length };
}
