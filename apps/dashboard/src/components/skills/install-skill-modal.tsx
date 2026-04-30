/**
 * Spec 0062 — install modal accepts a .zip via multipart upload.
 * fflate parses the zip in-memory to preview the SKILL.md frontmatter
 * before submission. Once the operator clicks "Install", the original
 * zip bytes are sent to POST /api/skills.
 *
 * Visual contract: artboard 6UD-0 (success) / 6WK-0 (error variants).
 */

import { strFromU8, unzipSync } from 'fflate';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useInstallSkillZip } from '@/lib/use-skills';
import { SkillSourcePill } from './skill-source-pill';

interface InstallSkillModalProps {
  onClose: () => void;
}

interface ZipPreview {
  filename: string;
  sizeBytes: number;
  fileCount: number;
  topLevel: string[];
  skillName: string;
  description: string;
  raw: Blob;
}

interface ParseError {
  code:
    | 'no_skill_md'
    | 'malformed_frontmatter'
    | 'invalid_zip'
    | 'missing_name'
    | 'missing_description';
  message: string;
}

const TOP_LEVEL_LIMIT = 8;

function parseFrontmatter(raw: string): { name?: string; description?: string } | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const block = match[1] ?? '';
  const out: { name?: string; description?: string } = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const value = m[2]?.trim();
    if (m[1] === 'name' && value) out.name = value;
    if (m[1] === 'description' && value) out.description = value;
  }
  return out;
}

async function previewZip(file: File): Promise<ZipPreview | ParseError> {
  let entries: Record<string, Uint8Array>;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    entries = unzipSync(buf);
  } catch (err) {
    return { code: 'invalid_zip', message: `Could not parse zip: ${(err as Error).message}` };
  }
  const skillMdEntry = entries['SKILL.md'];
  if (!skillMdEntry) {
    return { code: 'no_skill_md', message: 'No SKILL.md found at root of zip' };
  }
  const skillMd = strFromU8(skillMdEntry);
  const front = parseFrontmatter(skillMd);
  if (!front) return { code: 'malformed_frontmatter', message: 'SKILL.md has no frontmatter' };
  const skillName = front.name;
  const description = front.description;
  if (!skillName) return { code: 'missing_name', message: 'SKILL.md frontmatter missing `name`' };
  if (!description)
    return { code: 'missing_description', message: 'SKILL.md frontmatter missing `description`' };
  const topLevelSet = new Set<string>();
  let fileCount = 0;
  for (const path of Object.keys(entries)) {
    if (path.endsWith('/')) continue;
    fileCount++;
    const slash = path.indexOf('/');
    if (slash === -1) topLevelSet.add(path);
    else topLevelSet.add(`${path.slice(0, slash)}/`);
  }
  return {
    filename: file.name,
    sizeBytes: file.size,
    fileCount,
    topLevel: Array.from(topLevelSet).slice(0, TOP_LEVEL_LIMIT),
    skillName,
    description,
    raw: file,
  };
}

export function InstallSkillModal({ onClose }: InstallSkillModalProps): JSX.Element {
  const [preview, setPreview] = useState<ZipPreview | null>(null);
  const [parseError, setParseError] = useState<ParseError | null>(null);
  const installMutation = useInstallSkillZip();

  const handleFile = async (file: File): Promise<void> => {
    setParseError(null);
    setPreview(null);
    const result = await previewZip(file);
    if ('code' in result) setParseError(result);
    else setPreview(result);
  };

  const handleInstall = (): void => {
    if (!preview) return;
    installMutation.mutate(
      { zip: preview.raw, filename: preview.filename },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  };

  const serverError = installMutation.error as
    | (Error & { code?: string; status?: number })
    | undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: only run on unmount
  useEffect(() => {
    return () => {
      installMutation.reset();
    };
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop click closes
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is supplemental; ESC handler omitted for v1
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stop propagation only */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: not interactive */}
      <div
        style={{
          width: 640,
          maxWidth: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
          background: '#0F1119',
          border: '1px solid #E8EAF51A',
          fontFamily: 'JetBrains Mono, monospace',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Bracket position="top-left" />
        <Bracket position="top-right" />
        <Bracket position="bottom-left" />
        <Bracket position="bottom-right" />

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '22px 28px 16px 28px',
            borderBottom: '1px solid #E8EAF50F',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                lineHeight: '12px',
                color: '#D9B362',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                fontWeight: 500,
              }}
            >
              INSTALL · SKILL
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span
                style={{
                  fontFamily: 'Fraunces, serif',
                  fontSize: 24,
                  lineHeight: '30px',
                  color: '#E8EAF5',
                  letterSpacing: '-0.015em',
                }}
              >
                Add skill from
              </span>
              <span
                style={{
                  fontFamily: 'Fraunces, serif',
                  fontSize: 24,
                  lineHeight: '30px',
                  color: '#D9B362',
                  letterSpacing: '-0.015em',
                  fontStyle: 'italic',
                }}
              >
                zip
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              all: 'unset',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '1px solid #E8EAF51F',
              width: 28,
              height: 28,
              fontSize: 13,
              color: '#8A8FAB',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', padding: '22px 28px', gap: 18 }}>
          {!preview && !parseError ? (
            <FilePicker onFile={handleFile} />
          ) : (
            <FilePickerSelected
              filename={preview?.filename ?? '(error)'}
              sizeBytes={preview?.sizeBytes ?? 0}
              fileCount={preview?.fileCount ?? 0}
              hasError={Boolean(parseError) || Boolean(serverError)}
              onReplace={() => {
                setPreview(null);
                setParseError(null);
                installMutation.reset();
              }}
            />
          )}

          {parseError && <ErrorBanner code={parseError.code} message={parseError.message} />}
          {serverError && (
            <ErrorBanner
              code={serverError.code ?? 'unknown'}
              message={serverError.message ?? 'Install failed'}
            />
          )}

          {preview && !parseError && !serverError && <PreviewCard preview={preview} />}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 28px',
            background: '#05060F',
            borderTop: '1px solid #E8EAF50F',
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: parseError || serverError ? '#E55A4F' : '#4B4F66',
              letterSpacing: '0.04em',
            }}
          >
            {parseError || serverError
              ? 'cannot install'
              : preview
                ? `ready to install · ${(preview.sizeBytes / 1024).toFixed(1)} KB · ${preview.fileCount} files`
                : 'select a .zip to begin'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
                border: '1px solid #E8EAF51F',
                background: 'transparent',
                fontSize: 11,
                color: '#8A8FAB',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              cancel
            </button>
            <button
              type="button"
              onClick={handleInstall}
              disabled={!preview || Boolean(parseError) || installMutation.isPending}
              style={{
                padding: '9px 16px',
                gap: 8,
                background:
                  !preview || parseError || installMutation.isPending ? '#1B1F2E' : '#D9B362',
                border: '1px solid',
                borderColor:
                  !preview || parseError || installMutation.isPending ? '#2A2F45' : '#D9B362',
                fontSize: 11,
                color: !preview || parseError || installMutation.isPending ? '#8A8FAB' : '#08090F',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 700,
                cursor: !preview || parseError ? 'default' : 'pointer',
                opacity: !preview || parseError ? 0.45 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {installMutation.isPending ? 'installing…' : 'install →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bracket({
  position,
}: {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}): JSX.Element {
  const styles: Record<string, React.CSSProperties> = {
    'top-left': {
      top: -1,
      left: -1,
      borderTop: '2px solid #D9B362',
      borderLeft: '2px solid #D9B362',
    },
    'top-right': {
      top: -1,
      right: -1,
      borderTop: '2px solid #D9B362',
      borderRight: '2px solid #D9B362',
    },
    'bottom-left': {
      bottom: -1,
      left: -1,
      borderBottom: '2px solid #D9B362',
      borderLeft: '2px solid #D9B362',
    },
    'bottom-right': {
      bottom: -1,
      right: -1,
      borderBottom: '2px solid #D9B362',
      borderRight: '2px solid #D9B362',
    },
  };
  return (
    <div
      style={{
        position: 'absolute',
        width: 14,
        height: 14,
        ...styles[position],
      }}
    />
  );
}

function FilePicker({ onFile }: { onFile: (f: File) => void }): JSX.Element {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '32px 24px',
        background: '#08090F',
        border: '1px dashed #E8EAF51F',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      <input
        type="file"
        accept=".zip,application/zip"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <span style={{ fontSize: 13, color: '#E8EAF5', fontWeight: 500 }}>
        drop a .zip or click to browse
      </span>
      <span style={{ fontSize: 11, color: '#4B4F66' }}>
        max 5 MB total · max 1 MB per file · max 500 files
      </span>
    </label>
  );
}

function FilePickerSelected({
  filename,
  sizeBytes,
  fileCount,
  hasError,
  onReplace,
}: {
  filename: string;
  sizeBytes: number;
  fileCount: number;
  hasError: boolean;
  onReplace: () => void;
}): JSX.Element {
  const bgColor = hasError ? '#E55A4F0F' : '#5BD17C0F';
  const borderColor = hasError ? '#E55A4F4D' : '#5BD17C4D';
  const iconColor = hasError ? '#E55A4F' : '#5BD17C';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 14px',
        gap: 12,
        background: bgColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={iconColor}
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M14 2 H6 a2 2 0 0 0-2 2 v16 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2-2 V8 z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 0, gap: 2 }}>
        <span style={{ fontSize: 12, color: '#E8EAF5', letterSpacing: '0.02em' }}>{filename}</span>
        <span style={{ fontSize: 10, color: '#4B4F66' }}>
          {(sizeBytes / 1024).toFixed(1)} KB · {fileCount} files
        </span>
      </div>
      <button
        type="button"
        onClick={onReplace}
        style={{
          padding: '5px 10px',
          border: '1px solid #E8EAF51F',
          background: 'transparent',
          fontSize: 10,
          color: '#8A8FAB',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        replace file
      </button>
    </div>
  );
}

function PreviewCard({ preview }: { preview: ZipPreview }): JSX.Element {
  return (
    <>
      <span
        style={{
          fontSize: 10,
          color: '#4B4F66',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}
      >
        EXTRACTED PREVIEW
      </span>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '18px 18px',
          gap: 12,
          background: '#151824',
          border: '1px solid #E8EAF514',
        }}
      >
        <Row label="name" value={preview.skillName} />
        <Row label="desc" value={preview.description} mono={false} />
        <Row
          label="files"
          value={`${preview.fileCount} · total ${(preview.sizeBytes / 1024).toFixed(1)} KB`}
        />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span
            style={{
              width: 80,
              flexShrink: 0,
              fontSize: 10,
              lineHeight: '14px',
              color: '#4B4F66',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            top-level
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {preview.topLevel.map((p) => (
              <span
                key={p}
                style={{
                  padding: '3px 8px',
                  background: p === 'SKILL.md' ? '#D9B3621A' : '#1B1F2E',
                  border: `1px solid ${p === 'SKILL.md' ? '#D9B36247' : '#2A2F45'}`,
                  borderRadius: 3,
                  fontSize: 11,
                  color: p === 'SKILL.md' ? '#D9B362' : '#8A8FAB',
                  fontWeight: p === 'SKILL.md' ? 500 : 400,
                }}
              >
                {p}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span
            style={{
              width: 80,
              flexShrink: 0,
              fontSize: 10,
              color: '#4B4F66',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            source
          </span>
          <SkillSourcePill source="dashboard" />
          <span style={{ fontSize: 11, color: '#4B4F66' }}>
            → /workspace/skills/{preview.skillName}/
          </span>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span
        style={{
          width: 80,
          flexShrink: 0,
          fontSize: 10,
          lineHeight: '14px',
          color: '#4B4F66',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: mono ? 'JetBrains Mono, monospace' : 'Inter, system-ui, sans-serif',
          fontSize: 13,
          lineHeight: mono ? '18px' : '19px',
          color: '#E8EAF5',
          letterSpacing: mono ? '0.02em' : 'normal',
          flex: '1 1 0',
          minWidth: 0,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  );
}

const ERROR_COPY: Record<string, { heading: string; tail?: string }> = {
  no_skill_md: {
    heading: 'No SKILL.md found at root of zip',
    tail: 'A skill bundle must contain a top-level SKILL.md with name + description frontmatter.',
  },
  malformed_frontmatter: {
    heading: 'SKILL.md frontmatter is malformed',
    tail: 'Expected `---` delimited YAML at the top with `name:` and `description:` fields.',
  },
  missing_name: { heading: 'SKILL.md frontmatter is missing `name`' },
  missing_description: { heading: 'SKILL.md frontmatter is missing `description`' },
  invalid_zip: { heading: 'Could not parse zip' },
  skill_frontmatter_missing: { heading: 'No SKILL.md found at root of zip' },
  skill_name_taken: { heading: 'A skill with that name is already installed' },
  skill_size_exceeded: { heading: 'Bundle exceeds 5 MB total size cap' },
  skill_file_too_large: { heading: 'A file exceeds the 1 MB per-file cap' },
  skill_too_many_files: { heading: 'Bundle has too many files (cap: 500)' },
  skill_path_invalid: { heading: 'Zip refused — unsafe path entries detected' },
  skill_zip_invalid: { heading: 'Zip parse failed' },
};

function ErrorBanner({ code, message }: { code: string; message: string }): JSX.Element {
  const copy = ERROR_COPY[code] ?? { heading: code };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 16px',
        gap: 8,
        background: '#E55A4F0F',
        border: '1px solid #E55A4F4D',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#E55A4F"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12" y2="16" />
        </svg>
        <span style={{ fontSize: 12, color: '#E55A4F', letterSpacing: '0.04em', fontWeight: 500 }}>
          {copy.heading}
        </span>
      </div>
      <span
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 12,
          lineHeight: '18px',
          color: '#8A8FAB',
          paddingLeft: 22,
        }}
      >
        {copy.tail ?? message}
      </span>
    </div>
  );
}
