import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { DeleteSkillModal } from '@/components/skills/delete-skill-modal';
import { EditSkillModal } from '@/components/skills/edit-skill-modal';
import { useSkill } from '@/lib/use-skills';

export const Route = createFileRoute('/_authed/skills/$id')({
  component: SkillDetailScreen,
});

function SkillDetailScreen(): JSX.Element {
  const { id } = Route.useParams();
  const skill = useSkill(id);
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
  const sizeKb = (new TextEncoder().encode(s.body).length / 1024).toFixed(1);
  const lineCount = s.body.split('\n').length;

  return (
    <Main breadcrumb={s.name}>
      <header className="flex items-start justify-between gap-6 border-b border-border-subtle pb-6">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <span className="shrink-0 w-12 h-12 inline-flex items-center justify-center border border-gold-line bg-panel-2 text-gold">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 3 H18 V21 H6 Z" />
              <path d="M9 8 H15 M9 12 H15 M9 16 H13" />
            </svg>
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <h1 className="m-0 font-mono text-2xl font-medium tracking-[0.02em] leading-[30px] text-text-primary">
              {s.name}
            </h1>
            <div className="flex items-center flex-wrap gap-3">
              <Pill outline>skill</Pill>
              <Pill outline>markdown</Pill>
              {s.source === 'zeno_default' && <Pill source="zeno_default">default · zeno</Pill>}
              {s.source === 'profile' && <Pill source="profile">profile</Pill>}
              <span className="font-sans text-[13px] leading-4 text-text-secondary">
                {s.description}
              </span>
            </div>
            <span className="font-mono text-[10px] tracking-[0.06em] text-text-tertiary uppercase">
              pick mode · updated {formatRelative(s.updatedAt)}
            </span>
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
              role="img"
              aria-label="Download"
            >
              <title>Download</title>
              <path d="M12 4 V16 M6 12 L12 18 L18 12" />
              <path d="M4 21 H20" />
            </svg>
            download
          </a>
          {s.source === 'zeno_default' ? (
            <span
              className="inline-flex items-center gap-2 px-3.5 py-2 border border-gold-line bg-gold-soft font-mono text-[10px] tracking-[0.12em] uppercase text-gold"
              title="This skill ships with Zeno. To customize, copy the file to your profile and rename it (drop the zeno- prefix)."
            >
              managed by zeno
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 border border-border-strong font-mono text-[11px] font-medium tracking-[0.06em] uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  role="img"
                  aria-label="Edit"
                >
                  <title>Edit</title>
                  <path d="M4 20 L8 19 L20 7 L17 4 L5 16 Z" />
                </svg>
                edit
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center justify-center w-8 h-8 border border-border-subtle font-mono text-sm text-text-secondary hover:text-status-failed hover:border-status-failed/30"
                title="delete skill"
              >
                ⋯
              </button>
            </>
          )}
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <header className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
          <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
            body
          </h2>
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-text-tertiary">
            SKILL.md · {sizeKb} KB · {lineCount} lines
          </span>
        </header>
        <pre className="bg-panel-2 border border-border-subtle p-5 overflow-x-auto font-mono text-[12px] leading-[20px] text-text-primary whitespace-pre-wrap">
          {s.body}
        </pre>
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
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
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

function Pill({
  children,
  outline,
  source,
}: {
  children: React.ReactNode;
  outline?: boolean;
  source?: 'zeno_default' | 'profile';
}): JSX.Element {
  let classes: string;
  if (source === 'zeno_default') {
    classes = 'border border-gold-line bg-gold-soft text-gold';
  } else if (source === 'profile') {
    classes = 'border border-border-subtle bg-panel-2 text-text-secondary';
  } else if (outline) {
    classes = 'border border-border-subtle text-text-tertiary';
  } else {
    classes = 'bg-status-active/[0.06] border border-status-active/30 text-status-active';
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 font-mono text-[10px] tracking-[0.1em] leading-3 uppercase ${classes}`}
    >
      {children}
    </span>
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
