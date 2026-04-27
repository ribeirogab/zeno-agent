import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddRuleModal } from '@/components/settings/add-rule-modal';

const mockUseCreate = vi.hoisted(() => vi.fn());
const mockUsePreview = vi.hoisted(() => vi.fn());

vi.mock('@/lib/use-approval-rules', () => ({
  useCreateApprovalRule: () => mockUseCreate(),
}));
vi.mock('@/lib/use-rule-match-preview', () => ({
  useRuleMatchPreview: () => mockUsePreview(),
}));

afterEach(() => cleanup());

function Wrap({ children }: { children: JSX.Element }): JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockUseCreate.mockReset();
  mockUsePreview.mockReset();
  mockUseCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUsePreview.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe('<AddRuleModal>', () => {
  it('renders the title and the pattern input', () => {
    render(
      <Wrap>
        <AddRuleModal onClose={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByText(/sensitive tool/)).toBeDefined();
    const input = document.querySelector('input[placeholder*="github-app"]');
    expect(input).not.toBeNull();
  });

  it('SAVE button is disabled when pattern is empty', () => {
    render(
      <Wrap>
        <AddRuleModal onClose={vi.fn()} />
      </Wrap>,
    );
    const save = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('save rule'),
    ) as HTMLButtonElement | undefined;
    expect(save).toBeDefined();
    expect(save?.disabled).toBe(true);
  });

  it('SAVE button enables when a valid pattern is entered', () => {
    render(
      <Wrap>
        <AddRuleModal onClose={vi.fn()} />
      </Wrap>,
    );
    const input = document.querySelector('input[placeholder*="github-app"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mcp__example__delete_*' } });
    const save = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('save rule'),
    ) as HTMLButtonElement | undefined;
    expect(save?.disabled).toBe(false);
  });

  it('SAVE button is disabled for malformed patterns', () => {
    render(
      <Wrap>
        <AddRuleModal onClose={vi.fn()} />
      </Wrap>,
    );
    const input = document.querySelector('input[placeholder*="github-app"]') as HTMLInputElement;
    // Spaces are rejected by the regex.
    fireEvent.change(input, { target: { value: 'bad pattern' } });
    const save = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('save rule'),
    ) as HTMLButtonElement | undefined;
    expect(save?.disabled).toBe(true);
  });

  it('cancel button calls onClose', () => {
    const onClose = vi.fn();
    render(
      <Wrap>
        <AddRuleModal onClose={onClose} />
      </Wrap>,
    );
    const cancel = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('cancel'),
    ) as HTMLButtonElement | undefined;
    cancel?.click();
    expect(onClose).toHaveBeenCalled();
  });
});
