/**
 * Spec 0062 — skill detail page.
 *
 * Layout: header (icon + h1 + description + meta line + source pill +
 * Edit description (dashboard only) + kebab) → file tree (left, 280px)
 * + file editor (right, fills). Edit description button + delete kebab
 * are hidden for non-dashboard sources.
 *
 * Visual contract: artboard 6JK-0 (dashboard) / 6OQ-0 (zeno_default + profile).
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { DeleteSkillModal } from '@/components/skills/delete-skill-modal';
import { EditSkillModal } from '@/components/skills/edit-skill-modal';
import { SkillFileEditor } from '@/components/skills/skill-file-editor';
import { SkillFileTree } from '@/components/skills/skill-file-tree';
import { SkillSourcePill } from '@/components/skills/skill-source-pill';
import { useSkill, useSkillFiles } from '@/lib/use-skills';

export const Route = createFileRoute('/_authed/skills/$id')({
  component: SkillDetailScreen,
});

function SkillDetailScreen(): JSX.Element {
  const { id } = Route.useParams();
  const skill = useSkill(id);
  const files = useSkillFiles(id);
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>('SKILL.md');

  if (skill.error) {
    return (
      <Main breadcrumb="error">
        <div className="bg-status-failed/[0.06] border border-status-failed/30 text-status-failed px-4 py-3 font-mono text-[11px]">
          failed to load skill — it may have been deleted
        </div>
      </Main>
    );
  }
  if (!skill.data) {
    return (
      <Main breadcrumb="…">
        <p className="font-mono text-[11px] text-text-tertiary">loading…</p>
      </Main>
    );
  }

  const s = skill.data;
  const fileList = files.data ?? [];
  const totalBytes = fileList.reduce((sum, f) => sum + f.sizeBytes, 0);
  const isReadOnly = s.source !== 'dashboard';

  return (
    <Main breadcrumb={s.name}>
      {/* Header */}
      <header className="flex items-start justify-between gap-6 border-b border-border-subtle pb-6">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <span className="shrink-0 w-14 h-14 inline-flex items-center justify-center border border-gold-line bg-panel-2 text-gold rounded-lg">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 3 H18 V21 H6 Z" />
              <path d="M9 8 H15 M9 12 H15 M9 16 H13" />
            </svg>
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <h1 className="m-0 font-mono text-2xl font-medium tracking-[-0.01em] leading-[30px] text-text-primary">
              {s.name}
            </h1>
            <span className="font-sans text-[13px] leading-5 text-text-secondary">
              {s.description}
            </span>
            <div className="flex items-center flex-wrap gap-3 pt-1">
              <SkillSourcePill source={s.source} />
              <span className="font-mono text-[11px] text-text-tertiary">·</span>
              <span className="font-mono text-[11px] text-text-tertiary">
                installed {formatRelative(s.createdAt)} · {fileList.length} files ·{' '}
                {(totalBytes / 1024).toFixed(1)} KB total
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <a
            href={`/api/skills/${s.id}/download`}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-border-strong font-mono text-[11px] font-medium tracking-[0.06em] uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 4 V16 M6 12 L12 18 L18 12" />
              <path d="M4 21 H20" />
            </svg>
            download
          </a>
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 border border-border-strong font-mono text-[11px] font-medium tracking-[0.06em] uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
            >
              edit description
            </button>
          )}
          {s.source !== 'zeno_default' && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center justify-center w-8 h-8 border border-border-subtle font-mono text-sm text-text-secondary hover:text-status-failed hover:border-status-failed/30"
              title="delete skill"
            >
              ⋯
            </button>
          )}
        </div>
      </header>

      {/* Body grid: file tree + editor */}
      <section className="flex flex-row gap-4 min-h-[480px]">
        <SkillFileTree
          files={fileList}
          selectedPath={selectedPath}
          onSelect={(p) => setSelectedPath(p)}
        />
        <SkillFileEditor
          skillId={s.id}
          skillName={s.name}
          source={s.source}
          selectedPath={selectedPath}
          fileCount={fileList.length}
        />
      </section>

      {editOpen && <EditSkillModal skill={s} onClose={() => setEditOpen(false)} />}
      {deleteOpen && (
        <DeleteSkillModal
          skill={s}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => navigate({ to: '/skills' })}
        />
      )}
    </Main>
  );
}

function Main({
  breadcrumb,
  children,
}: {
  breadcrumb: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip
          crumbs={[
            { label: 'skills', to: '/skills' },
            { label: breadcrumb, current: true },
          ]}
        />
        <div className="max-w-[1280px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to="/skills"
              className="font-mono text-[11px] tracking-[0.06em] leading-[14px] uppercase text-text-tertiary hover:text-text-secondary"
            >
              skills
            </Link>
            <span className="font-mono text-[11px] tracking-[0.06em] leading-[14px] text-text-tertiary">
              /
            </span>
            <span className="font-mono text-[11px] tracking-[0.06em] leading-[14px] uppercase text-gold">
              {breadcrumb}
            </span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
