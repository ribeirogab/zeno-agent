import type { JSX } from 'react';
import {
  type AgentCapability,
  useAgentCapabilities,
  useUpdateAgentCapabilities,
} from '@/lib/use-agent-capabilities';

/**
 * Spec 0052 — Agent capabilities section embedded in /settings (Paper
 * artboard SET1). Operator opts in per-tool to non-MCP capabilities the
 * gate (apps/worker/src/guardrails/policies/connector-permission.ts) consults
 * on every tool call.
 */
export function AgentCapabilitiesSection(): JSX.Element {
  const caps = useAgentCapabilities();
  const update = useUpdateAgentCapabilities();
  const list = caps.data ?? [];
  const enabled = list.filter((c) => c.enabled);
  const bashOn = list.find((c) => c.toolName === 'Bash')?.enabled === true;

  const toggle = async (toolName: string, enabledNext: boolean) => {
    await update.mutateAsync({ updates: [{ toolName, enabled: enabledNext }] });
  };

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-2 border-b border-border-subtle pb-4">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
          settings · section
        </span>
        <h2 className="m-0 font-mono text-[28px] font-medium tracking-[0.02em] leading-[34px] text-text-primary">
          agent <em className="font-serif italic text-gold tracking-[-0.015em]">capabilities</em>
        </h2>
        <p className="m-0 font-sans text-sm leading-[1.6] text-text-secondary max-w-[720px]">
          Non-MCP tools the agent can use. Skills reference what's enabled here — the
          connector-permission gate (spec 0050) consults this setting before every call. Default
          OFF: Zeno is strictly connector-only until you enable a capability.
        </p>
      </header>

      {bashOn && <BashWarning />}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2">
          <h3 className="m-0 font-sans text-base font-medium text-text-primary">non-MCP tools</h3>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary">
            {enabled.length} enabled · {list.length - enabled.length} disabled
          </span>
        </div>
        {caps.isLoading && <p className="font-mono text-[11px] text-text-tertiary">loading…</p>}
        <div className="flex flex-col gap-1.5">
          {list.map((c) => (
            <CapabilityRow
              key={c.toolName}
              capability={c}
              busy={update.isPending}
              onToggle={(next) => toggle(c.toolName, next)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface ToolDescriptor {
  badge: string;
  badgeTone: 'safe' | 'mutates' | 'sensitive' | 'neutral';
  description: string;
}

const TOOL_DESCRIPTORS: Record<string, ToolDescriptor> = {
  Read: {
    badge: 'safe',
    badgeTone: 'safe',
    description: 'Read files in /workspace. Read-only — no side effects.',
  },
  Edit: {
    badge: 'mutates fs',
    badgeTone: 'mutates',
    description: 'Modify existing files in /workspace via diff edits.',
  },
  Write: {
    badge: 'creates files',
    badgeTone: 'mutates',
    description: 'Create new files in /workspace.',
  },
  Bash: {
    badge: 'shell · sensitive',
    badgeTone: 'sensitive',
    description:
      'Execute shell commands. Can touch any file, install packages, make network requests.',
  },
  Glob: {
    badge: 'read',
    badgeTone: 'neutral',
    description: 'Glob-pattern file search.',
  },
  Grep: {
    badge: 'read',
    badgeTone: 'neutral',
    description: 'Recursive content search inside /workspace.',
  },
  WebFetch: {
    badge: 'network',
    badgeTone: 'neutral',
    description: 'Fetch URLs from the web — typically docs, articles, third-party APIs.',
  },
  WebSearch: {
    badge: 'network',
    badgeTone: 'neutral',
    description: 'Search the web via SDK-managed providers.',
  },
  Task: {
    badge: 'subagent',
    badgeTone: 'sensitive',
    description: 'Spawn a Claude subagent. Inherits capabilities of the parent.',
  },
  ToolSearch: {
    badge: 'harness · safe',
    badgeTone: 'safe',
    description:
      'Loads schemas of deferred MCP tools so the agent can invoke them. Metadata-only — no side effects. Default ON; disable only for strict harness lockdown.',
  },
};

const TONE_CLASSES: Record<ToolDescriptor['badgeTone'], string> = {
  safe: 'text-status-active',
  mutates: 'text-gold',
  sensitive: 'text-status-failed',
  neutral: 'text-text-tertiary',
};

function CapabilityRow({
  capability,
  busy,
  onToggle,
}: {
  capability: AgentCapability;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
}): JSX.Element {
  const desc = TOOL_DESCRIPTORS[capability.toolName] ?? {
    badge: 'unknown',
    badgeTone: 'neutral' as const,
    description: 'Unknown tool — check your SDK version.',
  };
  const toneClass = TONE_CLASSES[desc.badgeTone];

  const wrapperClass = capability.enabled
    ? desc.badgeTone === 'sensitive'
      ? 'bg-status-failed/[0.04] border border-status-failed/30 border-l-2 border-l-status-failed'
      : desc.badgeTone === 'mutates'
        ? 'bg-gold-soft/[0.06] border border-gold-line border-l-2 border-l-gold'
        : 'bg-status-active/[0.04] border border-status-active/30 border-l-2 border-l-status-active'
    : 'bg-panel-2 border border-border-subtle';

  return (
    <div className={`flex items-center gap-4 px-4 py-3 ${wrapperClass}`}>
      <span className="shrink-0 w-8 h-8 grid place-items-center border border-border-subtle bg-panel">
        <ToolIcon tone={desc.badgeTone} />
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[13px] font-medium tracking-[0.02em] text-text-primary">
            {capability.toolName}
          </span>
          <span className={`font-mono text-[9px] tracking-[0.18em] uppercase ${toneClass}`}>
            {desc.badge}
          </span>
        </div>
        <span className="font-sans text-[12px] leading-[18px] text-text-secondary">
          {desc.description}
        </span>
      </div>
      <span
        className={`shrink-0 font-mono text-[10px] tracking-[0.18em] uppercase ${
          capability.enabled ? toneClass : 'text-text-tertiary'
        }`}
      >
        {capability.enabled ? 'enabled' : 'disabled'}
      </span>
      <button
        type="button"
        onClick={() => onToggle(!capability.enabled)}
        disabled={busy}
        aria-label={
          capability.enabled ? `disable ${capability.toolName}` : `enable ${capability.toolName}`
        }
        className={`shrink-0 relative inline-flex items-center w-9 h-5 transition-colors duration-[120ms] ${
          capability.enabled
            ? desc.badgeTone === 'sensitive'
              ? 'bg-status-failed/30 border border-status-failed/50'
              : desc.badgeTone === 'mutates'
                ? 'bg-gold-soft border border-gold-line'
                : 'bg-status-active/30 border border-status-active/50'
            : 'bg-panel-2 border border-border-strong'
        }`}
      >
        <span
          className={`absolute top-[1px] w-3.5 h-3.5 transition-all duration-[120ms] ${
            capability.enabled
              ? desc.badgeTone === 'sensitive'
                ? 'right-[2px] bg-status-failed'
                : desc.badgeTone === 'mutates'
                  ? 'right-[2px] bg-gold'
                  : 'right-[2px] bg-status-active'
              : 'left-[2px] bg-text-tertiary'
          }`}
        />
      </button>
    </div>
  );
}

function ToolIcon({ tone }: { tone: ToolDescriptor['badgeTone'] }): JSX.Element {
  const stroke =
    tone === 'safe'
      ? '#5BD17C'
      : tone === 'mutates'
        ? '#D9B362'
        : tone === 'sensitive'
          ? '#F5718C'
          : '#8A8FAB';
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Capability"
    >
      <title>Capability</title>
      <path d="M5 4 L19 4 V20 L5 20 Z" />
      <path d="M9 9 H15 M9 13 H15 M9 17 H13" />
    </svg>
  );
}

function BashWarning(): JSX.Element {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#F5718C"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 mt-0.5"
        role="img"
        aria-label="Warning"
      >
        <title>Warning</title>
        <path d="M12 3 L21 19 L3 19 Z" />
        <path d="M12 9 V13 M12 16 V16.5" />
      </svg>
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-status-failed font-semibold">
          shell access enabled
        </span>
        <span className="font-sans text-[13px] leading-[18px] text-text-primary">
          Bash is enabled — the agent can run shell commands on any turn. Disable it if you don't
          trust a recently-installed skill.
        </span>
      </div>
    </div>
  );
}
