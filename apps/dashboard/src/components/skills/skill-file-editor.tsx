/**
 * Spec 0062 — file editor pane on the skill detail page.
 *
 * For source=dashboard: editable textarea + enabled gold Save button.
 * For zeno_default + profile: read-only view + disabled Save button with
 * tooltip "read-only — edit on the host" (artboard 6OQ-0).
 */

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { type SkillSource, useSkillFile, useWriteSkillFile } from '@/lib/use-skills';

interface SkillFileEditorProps {
  skillId: string;
  skillName: string;
  source: SkillSource;
  selectedPath: string | null;
  /** Total file count in the skill — surfaced in the editor header for context. */
  fileCount: number;
}

const READONLY_HELP: Record<SkillSource, string> = {
  dashboard: '',
  zeno_default: 'ships with agent image · edit at /app/agent/skills/<name>/ on host',
  profile: 'mounted from profile · edit at profiles/<n>/skills/<name>/ on host',
};

export function SkillFileEditor({
  skillId,
  skillName,
  source,
  selectedPath,
  fileCount,
}: SkillFileEditorProps): JSX.Element {
  const fileQuery = useSkillFile(skillId, selectedPath ?? undefined);
  const writeMutation = useWriteSkillFile();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (fileQuery.data !== undefined) setDraft(fileQuery.data);
  }, [fileQuery.data]);

  const isReadOnly = source !== 'dashboard';
  const isDirty = !isReadOnly && draft !== (fileQuery.data ?? '');

  const handleSave = (): void => {
    if (!selectedPath || isReadOnly) return;
    writeMutation.mutate({ id: skillId, path: selectedPath, content: draft });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0',
        minHeight: 480,
        background: '#0F1119',
        border: '1px solid #151824',
        borderRadius: 6,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          gap: 12,
          borderBottom: '1px solid #151824',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              lineHeight: '12px',
              color: '#4B4F66',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            {isReadOnly ? 'viewer' : 'editor'}
          </span>
          {selectedPath ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 20,
                borderRadius: 10,
                padding: '3px 8px',
                background: '#D9B3621A',
                border: '1px solid #D9B36247',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                lineHeight: '12px',
                color: '#D9B362',
                letterSpacing: '0.06em',
                fontWeight: 500,
              }}
            >
              {selectedPath}
            </span>
          ) : (
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
                color: '#4B4F66',
              }}
            >
              select a file from the tree
            </span>
          )}
          {isReadOnly && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 20,
                borderRadius: 10,
                padding: '3px 8px',
                gap: 5,
                background: '#1B1F2E',
                border: '1px solid #2A2F45',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                lineHeight: '12px',
                color: '#8A8FAB',
                letterSpacing: '0.08em',
                fontWeight: 500,
                textTransform: 'uppercase',
              }}
            >
              read-only
            </span>
          )}
        </div>
        {selectedPath && fileQuery.data !== undefined && (
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: '#4B4F66',
            }}
          >
            {fileCount} files ·{' '}
            {(new TextEncoder().encode(fileQuery.data).length / 1024).toFixed(1)} KB
          </span>
        )}
      </div>

      <div style={{ flex: '1 1 0', minHeight: 0, padding: '18px 20px', overflow: 'auto' }}>
        {!selectedPath ? (
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              color: '#4B4F66',
              padding: 20,
              textAlign: 'center',
            }}
          >
            no file selected
          </div>
        ) : fileQuery.isLoading ? (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#4B4F66' }}>loading…</div>
        ) : fileQuery.error ? (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#E55A4F' }}>
            failed to load file
          </div>
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            readOnly={isReadOnly}
            style={{
              width: '100%',
              minHeight: 400,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              lineHeight: '19px',
              color: '#E8EAF5',
              resize: 'vertical',
              cursor: isReadOnly ? 'default' : 'text',
            }}
          />
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: '#08090F',
          borderTop: '1px solid #151824',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: '#4B4F66',
          }}
        >
          {isReadOnly
            ? READONLY_HELP[source]
            : selectedPath
              ? `edits write directly to /workspace/skills/${skillName}/${selectedPath}`
              : ''}
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setDraft(fileQuery.data ?? '')}
            disabled={isReadOnly || !isDirty}
            style={{
              padding: '6px 14px',
              border: '1px solid #151824',
              background: 'transparent',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: '#8A8FAB',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 500,
              borderRadius: 4,
              cursor: isReadOnly || !isDirty ? 'default' : 'pointer',
              opacity: isReadOnly || !isDirty ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isReadOnly || !isDirty || writeMutation.isPending}
            title={isReadOnly ? 'read-only — edit on the host' : undefined}
            style={{
              padding: '6px 14px',
              gap: 6,
              background: isReadOnly ? '#1B1F2E' : '#D9B362',
              border: '1px solid',
              borderColor: isReadOnly ? '#2A2F45' : '#D9B362',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: isReadOnly ? '#8A8FAB' : '#08090F',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
              borderRadius: 4,
              cursor: isReadOnly || !isDirty ? 'default' : 'pointer',
              opacity: isReadOnly ? 0.4 : !isDirty ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {writeMutation.isPending ? 'saving…' : 'save'}
          </button>
        </div>
      </div>
    </div>
  );
}
