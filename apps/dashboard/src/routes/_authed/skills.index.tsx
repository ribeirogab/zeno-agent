import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { InstallSkillModal } from '@/components/skills/install-skill-modal';
import { useConnectors } from '@/lib/use-connectors';
import { type SkillListItem, useSkills } from '@/lib/use-skills';

export const Route = createFileRoute('/_authed/skills/')({
  component: SkillsScreen,
});

function SkillsScreen(): JSX.Element {
  const skills = useSkills();
  const connectors = useConnectors();
  const [installOpen, setInstallOpen] = useState(false);

  const list = skills.data ?? [];
  const linkedCount = useLinkedCount(list, connectors.data ?? []);

  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip crumbs={[{ label: 'zeno' }, { label: 'skills', current: true }]} />
        <div className="max-w-[1152px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          <Hero
            count={list.length}
            onInstall={() => setInstallOpen(true)}
            disabledDownload={list.length === 0}
          />
          {skills.isLoading && <p className="font-mono text-[11px] text-text-tertiary">loading…</p>}
          {!skills.isLoading && list.length === 0 && (
            <EmptyState onInstall={() => setInstallOpen(true)} />
          )}
          {!skills.isLoading && list.length > 0 && (
            <InstalledSection skills={list} linkedCount={linkedCount} />
          )}
        </div>
      </main>
      {installOpen && <InstallSkillModal onClose={() => setInstallOpen(false)} />}
    </div>
  );
}

function useLinkedCount(skills: SkillListItem[], connectors: unknown[]): number {
  // Soft estimate: we don't fetch the M:N from here. The header label "X of N"
  // requires a per-connector sub-fetch, which is expensive on the list page.
  // For v1 we just show the total. Connector page shows the linked subset.
  void skills;
  void connectors;
  return 0;
}

function Hero({
  count,
  onInstall,
  disabledDownload,
}: {
  count: number;
  onInstall: () => void;
  disabledDownload: boolean;
}): JSX.Element {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col gap-3 max-w-[680px]">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
          playbooks · markdown
        </span>
        <h1 className="m-0 font-mono text-[44px] font-medium tracking-[0.02em] leading-[50px] text-text-primary">
          skills
        </h1>
        <p className="m-0 font-sans text-sm leading-[1.6] text-text-secondary">
          Markdown playbooks the agent reads on demand. Sobe um SKILL.md, linka a um connector se
          quiser. Capabilities (Read, Edit, Bash, ...) ficam em{' '}
          <Link to="/settings" className="text-gold hover:underline">
            /settings
          </Link>
          .
        </p>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <a
          href={count === 0 ? undefined : '/api/skills/download-all'}
          aria-disabled={disabledDownload}
          className={`inline-flex items-center gap-2 px-3.5 py-2 border border-border-strong font-mono text-[11px] font-medium tracking-[0.06em] uppercase ${
            disabledDownload
              ? 'text-text-tertiary opacity-50 pointer-events-none'
              : 'text-text-primary hover:bg-panel-2'
          } transition-colors duration-[120ms]`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            role="img"
            aria-label="Download"
          >
            <title>Download</title>
            <path d="M12 4 V16 M6 12 L12 18 L18 12" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 21 H20" strokeLinecap="round" />
          </svg>
          download all
        </a>
        <button
          type="button"
          onClick={onInstall}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-gold-soft border border-gold-line font-mono text-[11px] font-semibold tracking-[0.06em] uppercase text-gold hover:bg-gold-soft/80 transition-colors duration-[120ms]"
        >
          <span>+</span>
          install skill
        </button>
      </div>
    </header>
  );
}

function EmptyState({ onInstall }: { onInstall: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-6 py-20">
      <div className="flex flex-col items-center gap-3 max-w-[640px] text-center">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
          playbooks · markdown
        </span>
        <h2 className="m-0 font-serif text-[44px] tracking-[-0.015em] leading-[1.1] text-text-primary">
          Teach Zeno <em className="italic text-gold">new tricks.</em>
        </h2>
        <p className="font-sans text-[14px] leading-[1.6] text-text-secondary">
          Skills are markdown playbooks the agent reads on demand.{' '}
          <code className="font-mono text-text-primary">frontend-design</code> teaches Zeno how you
          review React code; <code className="font-mono text-text-primary">aws-debug</code>{' '}
          documents your incident runbook. Upload a SKILL.md and the agent learns.
        </p>
      </div>
      <button
        type="button"
        onClick={onInstall}
        className="border border-dashed border-gold-line bg-gold-soft/10 hover:bg-gold-soft/20 px-12 py-12 flex flex-col items-center gap-3 transition-colors duration-[120ms]"
      >
        <span className="w-12 h-12 grid place-items-center border border-gold-line text-gold">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="Upload"
          >
            <title>Upload</title>
            <path d="M12 4 V16 M6 10 L12 4 L18 10" />
            <path d="M4 21 H20" />
          </svg>
        </span>
        <span className="font-mono text-[13px] text-text-primary">Drop a SKILL.md here</span>
        <span className="font-mono text-[11px] text-text-tertiary">
          or click to choose from disk
        </span>
        <span className="mt-2 inline-flex items-center gap-2 px-3.5 py-2 bg-gold border border-gold font-mono text-[11px] font-bold tracking-[0.06em] uppercase text-text-ink">
          + install skill
        </span>
      </button>
      <span className="font-mono text-[10px] text-text-tertiary tracking-[0.06em]">
        soon · import from skills.sh via URL
      </span>
    </div>
  );
}

function InstalledSection({
  skills,
  linkedCount,
}: {
  skills: SkillListItem[];
  linkedCount: number;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          installed
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-text-tertiary">
          {skills.length} skill{skills.length === 1 ? '' : 's'}
          {linkedCount > 0 && ` · ${linkedCount} linked`}
        </span>
      </header>
      <div className="flex flex-col">
        <div className="grid grid-cols-[1fr_140px_100px_24px] gap-4 px-3 py-2.5 border-b border-border-subtle">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-text-tertiary">
            skill
          </span>
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-text-tertiary">
            linked
          </span>
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-text-tertiary">
            updated
          </span>
          <span />
        </div>
        {skills.map((s) => (
          <SkillRow key={s.id} skill={s} />
        ))}
      </div>
    </section>
  );
}

function SkillRow({ skill }: { skill: SkillListItem }): JSX.Element {
  return (
    <Link
      to="/skills/$id"
      params={{ id: skill.id }}
      className="grid grid-cols-[1fr_140px_100px_24px] gap-4 items-center px-3 py-3 border-b border-border-subtle hover:bg-panel-2 transition-colors duration-[120ms]"
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className="shrink-0 w-8 h-8 grid place-items-center border border-border-subtle text-text-tertiary">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="Skill"
          >
            <title>Skill</title>
            <path d="M6 3 H18 V21 H6 Z" />
            <path d="M9 8 H15 M9 12 H15 M9 16 H13" />
          </svg>
        </span>
        <div className="flex flex-col min-w-0 gap-0.5">
          <span className="font-mono text-[13px] font-medium tracking-[0.02em] text-text-primary inline-flex items-center gap-2">
            {skill.name}
            <SourceBadge source={skill.source} />
          </span>
          <span className="font-sans text-[12px] leading-[1.5] text-text-secondary truncate">
            {skill.description}
          </span>
        </div>
      </div>
      <span className="font-mono text-[11px] text-text-tertiary tracking-[0.04em]">
        — pick mode
      </span>
      <span className="font-mono text-[11px] text-text-tertiary tracking-[0.04em]">
        {formatRelative(skill.updatedAt)}
      </span>
      <span className="text-text-tertiary">›</span>
    </Link>
  );
}

/**
 * Spec 0053 — visual source badge. Shown only when source !== 'dashboard'
 * (the spec 0052 default). zeno_default → gold lock icon + "default · zeno";
 * profile → neutral "profile" tag.
 */
function SourceBadge({ source }: { source: SkillListItem['source'] }): JSX.Element | null {
  if (source === 'dashboard') return null;
  if (source === 'zeno_default') {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-gold-line bg-gold-soft text-gold font-mono text-[9px] tracking-[0.12em] uppercase"
        title="Managed by Zeno — shipped with the binary, immutable here"
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="Default"
        >
          <title>Default</title>
          <rect x="5" y="11" width="14" height="10" rx="1" />
          <path d="M8 11 V7 a4 4 0 0 1 8 0 V11" />
        </svg>
        default · zeno
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 border border-border-subtle bg-panel-2 text-text-secondary font-mono text-[9px] tracking-[0.12em] uppercase"
      title="Profile-seeded skill — file in profiles/<name>/skills/, editable from here after first boot"
    >
      profile
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
