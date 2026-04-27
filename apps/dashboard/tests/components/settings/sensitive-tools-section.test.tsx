import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SensitiveToolsSection } from '@/components/settings/sensitive-tools-section';
import type { ApprovalRule } from '@/lib/use-approval-rules';

const mockUseApprovalRules = vi.hoisted(() => vi.fn());
const mockUseDeleteApprovalRule = vi.hoisted(() => vi.fn());
const mockUseRemoveOrphanRules = vi.hoisted(() => vi.fn());

vi.mock('@/lib/use-approval-rules', () => ({
  useApprovalRules: () => mockUseApprovalRules(),
  useDeleteApprovalRule: () => mockUseDeleteApprovalRule(),
  useRemoveOrphanRules: () => mockUseRemoveOrphanRules(),
}));

vi.mock('@/components/settings/add-rule-modal', () => ({
  AddRuleModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="add-rule-modal">
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock('@zeno/ui', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useToast: () => ({
      success: vi.fn(),
      fail: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    }),
  };
});

afterEach(() => cleanup());

function makeRule(
  overrides: Partial<ApprovalRule> & {
    matchStatus?: { matchCount: number; isOrphan: boolean };
  } = {},
): ApprovalRule & { matchStatus: { matchCount: number; isOrphan: boolean } } {
  const { matchStatus, ...rest } = overrides;
  return {
    id: 'r-1',
    pattern: 'mcp__example__delete_*',
    source: 'manual',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    notes: null,
    ...rest,
    matchStatus: matchStatus ?? { matchCount: 1, isOrphan: false },
  };
}

function Wrap({ children }: { children: JSX.Element }): JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockUseApprovalRules.mockReset();
  mockUseDeleteApprovalRule.mockReset();
  mockUseRemoveOrphanRules.mockReset();
  mockUseDeleteApprovalRule.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockUseRemoveOrphanRules.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe('<SensitiveToolsSection>', () => {
  it('renders empty state when no rules', () => {
    mockUseApprovalRules.mockReturnValue({ data: [], isLoading: false });
    render(
      <Wrap>
        <SensitiveToolsSection />
      </Wrap>,
    );
    expect(screen.getByText(/No sensitive tools configured/)).toBeDefined();
    expect(screen.getByText('0 rules')).toBeDefined();
  });

  it('renders rules with their pattern + source label', () => {
    mockUseApprovalRules.mockReturnValue({
      data: [
        makeRule({ id: 'r-1', pattern: 'mcp__example__delete_*', source: 'manual' }),
        makeRule({
          id: 'r-2',
          pattern: 'mcp__github-app-acme__merge_pull_request',
          source: 'auto',
        }),
        makeRule({ id: 'r-3', pattern: 'mcp__legacy__*', source: 'yaml-migrated' }),
      ],
      isLoading: false,
    });
    render(
      <Wrap>
        <SensitiveToolsSection />
      </Wrap>,
    );
    expect(screen.getByText('mcp__example__delete_*')).toBeDefined();
    expect(screen.getByText('mcp__github-app-acme__merge_pull_request')).toBeDefined();
    expect(screen.getByText('mcp__legacy__*')).toBeDefined();
    expect(screen.getByText(/manual/)).toBeDefined();
    expect(screen.getByText(/auto/)).toBeDefined();
    expect(screen.getByText(/migrated/)).toBeDefined();
    expect(screen.getByText('3 rules')).toBeDefined();
  });

  it('renders "managed" label for auto rules instead of delete button', () => {
    mockUseApprovalRules.mockReturnValue({
      data: [makeRule({ source: 'auto' })],
      isLoading: false,
    });
    render(
      <Wrap>
        <SensitiveToolsSection />
      </Wrap>,
    );
    expect(screen.getByText(/managed/)).toBeDefined();
    expect(screen.queryByText('delete')).toBeNull();
  });

  it('renders delete button for manual rules', () => {
    mockUseApprovalRules.mockReturnValue({
      data: [makeRule({ source: 'manual' })],
      isLoading: false,
    });
    render(
      <Wrap>
        <SensitiveToolsSection />
      </Wrap>,
    );
    expect(screen.getByText('delete')).toBeDefined();
  });

  it('renders delete button for yaml-migrated rules (cleanable)', () => {
    mockUseApprovalRules.mockReturnValue({
      data: [makeRule({ source: 'yaml-migrated' })],
      isLoading: false,
    });
    render(
      <Wrap>
        <SensitiveToolsSection />
      </Wrap>,
    );
    expect(screen.getByText('delete')).toBeDefined();
  });

  it('renders loading text', () => {
    mockUseApprovalRules.mockReturnValue({ data: undefined, isLoading: true });
    render(
      <Wrap>
        <SensitiveToolsSection />
      </Wrap>,
    );
    expect(screen.getByText('loading…')).toBeDefined();
  });
});
