/**
 * Spec 0062 — delete cascade modal.
 *
 * - Dashboard source: artboard 71K-0 — bullets show file count + connector
 *   + cron link unlinks; reassurance line confirms connectors/crons
 *   themselves stay alive.
 * - Profile source: artboard 72Y-0 — adds yellow reseed callout above
 *   the cascade card explaining the row will be re-INSERTed on next boot
 *   unless the host dir is also removed.
 * - zeno_default: refuses to render (the detail page should hide the
 *   delete affordance entirely; this is a defensive guard).
 */

import type { JSX } from 'react';
import { useState } from 'react';
import { type SkillDetail, useDeleteSkill, useSkillFiles } from '@/lib/use-skills';
import { SkillSourcePill } from './skill-source-pill';

export function DeleteSkillModal({
  skill,
  onClose,
  onDeleted,
}: {
  skill: SkillDetail;
  onClose: () => void;
  onDeleted: () => void;
}): JSX.Element | null {
  const remove = useDeleteSkill();
  const filesQuery = useSkillFiles(skill.id);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const matches = typed === skill.name;

  if (skill.source === 'zeno_default') return null;

  const handleDelete = async (): Promise<void> => {
    setError(null);
    try {
      await remove.mutateAsync({ id: skill.id, name: skill.name });
      onClose();
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed');
    }
  };

  const isProfile = skill.source === 'profile';
  const fileCount = filesQuery.data?.length ?? '—';
  const canonicalLabel = isProfile
    ? `~/.claude/skills/${skill.name}`
    : `/workspace/skills/${skill.name}/`;

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
          width: 520,
          maxWidth: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          borderRadius: 8,
          background: '#0F1119',
          border: '1px solid #151824',
          fontFamily: 'JetBrains Mono, monospace',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '28px 32px 20px 32px',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#E8617A"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span
              style={{
                fontSize: 11,
                color: '#E8617A',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 500,
              }}
            >
              destructive · cannot undo
            </span>
            {isProfile && <SkillSourcePill source="profile" />}
          </div>
          <div
            style={{
              fontSize: 22,
              lineHeight: '24px',
              color: '#E8EAF5',
              fontWeight: 500,
            }}
          >
            delete {skill.name}?
          </div>
          {!isProfile && (
            <div
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 14,
                lineHeight: '22px',
                color: '#8A8FAB',
              }}
            >
              Removes the skill row, its files on disk, and unlinks anything that depends on it.
            </div>
          )}
        </div>

        {/* Profile reseed callout */}
        {isProfile && <DeleteReseedCallout skillName={skill.name} />}

        {/* Cascade preview */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '0 32px 22px 32px',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: '#4B4F66',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            CASCADE PREVIEW
          </span>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '14px 16px',
              gap: 10,
              background: '#151824',
              border: '1px solid #E8EAF514',
              borderRadius: 6,
            }}
          >
            {!isProfile && (
              <Bullet
                color="#E8617A"
                count={fileCount}
                tail={
                  <>
                    files will be removed from{' '}
                    <code style={{ background: '#0F1119', padding: '0 4px', color: '#E8EAF5' }}>
                      {canonicalLabel}
                    </code>
                  </>
                }
                icon="trash"
              />
            )}
            {isProfile && (
              <Bullet
                color="#E8617A"
                count="1"
                tail={
                  <>
                    DB row + symlink at{' '}
                    <code style={{ background: '#0F1119', padding: '0 4px', color: '#E8EAF5' }}>
                      {canonicalLabel}
                    </code>
                  </>
                }
                icon="trash"
              />
            )}
            <Bullet
              color="#D9B362"
              count={skill.connectorSkillsCount}
              tail="connector link(s) will be unlinked"
              icon="link"
            />
            <Bullet
              color="#D9B362"
              count={skill.cronSkillsCount}
              tail="cron link(s) will be unlinked"
              icon="clock"
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                paddingTop: 6,
                marginTop: 4,
                borderTop: '1px dashed #E8EAF50A',
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke={isProfile ? '#7AA6E8' : '#5BD17C'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12 L11 14 L15 10" />
              </svg>
              <span style={{ fontSize: 11, lineHeight: '16px', color: '#8A8FAB' }}>
                {isProfile
                  ? `host dir profiles/<n>/skills/${skill.name}/ stays untouched`
                  : 'connectors and crons are preserved · only the link rows are deleted'}
              </span>
            </div>
          </div>
        </div>

        {/* Type-to-confirm */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '0 32px 24px 32px',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, lineHeight: '14px', color: '#8A8FAB' }}>
            Type{' '}
            <code
              style={{
                background: '#151824',
                padding: '1px 6px',
                color: '#E8617A',
                fontWeight: 500,
                borderRadius: 3,
              }}
            >
              {skill.name}
            </code>{' '}
            to confirm:
          </span>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={skill.name}
            style={{
              padding: '10px 12px',
              background: '#08090F',
              border: '1px solid #E8617A40',
              borderRadius: 4,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 13,
              lineHeight: '16px',
              color: '#E8EAF5',
              outline: 'none',
            }}
          />
          {error && (
            <span
              style={{ fontSize: 11, color: '#E55A4F', fontFamily: 'JetBrains Mono, monospace' }}
            >
              {error}
            </span>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 32px',
            background: '#08090F',
            borderTop: '1px solid #151824',
          }}
        >
          <span
            style={{ fontSize: 10, lineHeight: '14px', color: '#4B4F66', letterSpacing: '0.04em' }}
          >
            ↳{' '}
            {isProfile
              ? 'reseed unless host dir removed'
              : `removes ${fileCount} files + db row + ${skill.connectorSkillsCount + skill.cronSkillsCount} link rows`}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0 16px',
                height: 36,
                border: '1px solid #151824',
                borderRadius: 4,
                background: 'transparent',
                fontSize: 12,
                color: '#8A8FAB',
                letterSpacing: '0.06em',
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
              onClick={handleDelete}
              disabled={!matches || remove.isPending}
              style={{
                padding: '0 16px',
                height: 36,
                gap: 8,
                background: '#E8617A24',
                border: '1px solid #E8617A',
                borderRadius: 4,
                fontSize: 12,
                color: '#E8617A',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 600,
                cursor: matches ? 'pointer' : 'default',
                opacity: matches ? 1 : 0.45,
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {remove.isPending ? 'deleting…' : 'delete skill'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bullet({
  color,
  count,
  tail,
  icon,
}: {
  color: string;
  count: number | string;
  tail: React.ReactNode;
  icon: 'trash' | 'link' | 'clock';
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon kind={icon} color={color} />
      <span style={{ fontSize: 12, lineHeight: '16px', color: '#E8EAF5' }}>
        <span style={{ color, fontWeight: 600 }}>{count}</span> {tail}
      </span>
    </div>
  );
}

function Icon({ kind, color }: { kind: 'trash' | 'link' | 'clock'; color: string }): JSX.Element {
  if (kind === 'trash') {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    );
  }
  if (kind === 'link') {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function DeleteReseedCallout({ skillName }: { skillName: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 32px 16px 32px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '14px 14px',
          background: '#D9B36214',
          border: '1px solid #D9B36247',
          borderRadius: 6,
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#D9B362"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, marginTop: 1 }}
          aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 0' }}>
          <span
            style={{
              fontSize: 11,
              lineHeight: '15px',
              color: '#D9B362',
              letterSpacing: '0.04em',
              fontWeight: 600,
            }}
          >
            profile skill — will be reseeded on next worker restart
          </span>
          <span
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 12,
              lineHeight: '18px',
              color: '#8A8FAB',
            }}
          >
            This skill ships in{' '}
            <code
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                background: '#151824',
                padding: '0 4px',
                color: '#E8EAF5',
              }}
            >
              profiles/&lt;n&gt;/skills/{skillName}/
            </code>
            . Deleting from the dashboard removes the DB row + symlink only. The profile watcher
            will reinstall it on next worker boot.
          </span>
          <span
            style={{
              fontSize: 11,
              lineHeight: '16px',
              color: '#4B4F66',
              paddingTop: 4,
              borderTop: '1px dashed #D9B36229',
              fontStyle: 'italic',
            }}
          >
            → to delete{' '}
            <em style={{ color: '#D9B362', fontStyle: 'normal', fontWeight: 500 }}>permanently</em>,
            remove the host directory.
          </span>
        </div>
      </div>
    </div>
  );
}
