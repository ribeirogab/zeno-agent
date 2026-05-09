import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CatalogModal } from '@/components/catalog-modal';
import type { CatalogEntryApi } from '@/lib/use-catalog';
import type { ConnectorListEntry } from '@/lib/use-connectors';

afterEach(() => cleanup());

const baseCatalog: CatalogEntryApi[] = [
  {
    id: 'github',
    name: 'github',
    description: 'github access via personal token',
    iconUrl: '/icons/github.svg',
    docsUrl: 'https://github.example/mcp',
    transport: 'stdio',
    secrets: [],
    toolCount: 12,
    isInstalled: false,
    customInstallComponent: null,
    multiInstance: true,
  },
  {
    id: 'linear',
    name: 'linear',
    description: 'issues, projects, cycles',
    iconUrl: '/icons/linear.svg',
    docsUrl: 'https://linear.example/mcp',
    transport: 'remote',
    secrets: [],
    toolCount: 12,
    isInstalled: true,
    customInstallComponent: null,
    multiInstance: true,
  },
  {
    id: 'playwright',
    name: 'playwright',
    description: 'browser automation',
    iconUrl: '/icons/playwright.svg',
    docsUrl: 'https://playwright.example/mcp',
    transport: 'stdio',
    secrets: [],
    toolCount: 25,
    isInstalled: true,
    customInstallComponent: null,
    multiInstance: false,
  },
];

const installed: ConnectorListEntry[] = [
  {
    kind: 'connector_group',
    catalogId: 'linear',
    name: 'linear',
    iconUrl: null,
    installationCount: 3,
    statusAggregate: 'active',
    lastVerifiedAt: null,
    installations: [],
  },
  {
    kind: 'connector',
    id: 'pw-1',
    slug: 'playwright-default',
    displayName: 'Playwright',
    instanceLabel: null,
    description: null,
    source: 'catalog',
    catalogId: 'playwright',
    iconUrl: null,
    transport: 'stdio',
    status: 'enabled',
    lastError: null,
    lastErrorAt: null,
    lastVerifiedAt: null,
    toolCount: 25,
    invocationCount24h: 0,
    appId: null,
  },
];

describe('<CatalogModal>', () => {
  it('renders the search input + filter/sort placeholders', () => {
    render(<CatalogModal catalog={baseCatalog} installed={[]} onClose={() => {}} />);
    expect(screen.getByLabelText('search catalog')).toBeDefined();
    expect(screen.getByText(/filter by/i)).toBeDefined();
    expect(screen.getByText(/sort by/i)).toBeDefined();
  });

  it('lists at least one catalog card', () => {
    render(<CatalogModal catalog={baseCatalog} installed={[]} onClose={() => {}} />);
    expect(screen.getByText('github')).toBeDefined();
    expect(screen.getByText('issues, projects, cycles')).toBeDefined();
  });

  it('shows "available" for non-installed entries and "N installed" for installed', () => {
    render(<CatalogModal catalog={baseCatalog} installed={installed} onClose={() => {}} />);
    expect(screen.getByText('available')).toBeDefined();
    expect(screen.getByText('3 installed')).toBeDefined();
    expect(screen.getByText('1 installed')).toBeDefined();
  });

  it('subhead summarizes the available + installed counts', () => {
    render(<CatalogModal catalog={baseCatalog} installed={installed} onClose={() => {}} />);
    expect(screen.getByText(/available · 3 connectors/i)).toBeDefined();
    expect(screen.getByText(/4 installed/)).toBeDefined();
  });

  it('disables the + button for single-instance catalogs that are already installed', () => {
    render(<CatalogModal catalog={baseCatalog} installed={installed} onClose={() => {}} />);
    const plusButtons = screen.getAllByRole('button', { name: /Install playwright/i });
    expect(plusButtons[0]).toBeDefined();
    expect((plusButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/single-instance catalog · already installed/i)).toBeDefined();
  });

  it('opens a CommandModal with the install command when + is clicked', () => {
    render(<CatalogModal catalog={baseCatalog} installed={[]} onClose={() => {}} />);
    const plus = screen.getByRole('button', { name: /Install github/i });
    fireEvent.click(plus);
    expect(screen.getByText(/zeno connector install github/)).toBeDefined();
  });

  it('filters cards via the search input', () => {
    render(<CatalogModal catalog={baseCatalog} installed={[]} onClose={() => {}} />);
    const input = screen.getByLabelText('search catalog');
    fireEvent.change(input, { target: { value: 'lin' } });
    expect(screen.getByText('linear')).toBeDefined();
    expect(screen.queryByText('github')).toBeNull();
  });

  it('opens docs in a new tab when the card body is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<CatalogModal catalog={baseCatalog} installed={[]} onClose={() => {}} />);
    const docsBtn = screen.getByRole('button', { name: /Open github docs/i });
    fireEvent.click(docsBtn);
    expect(openSpy).toHaveBeenCalledWith(
      'https://github.example/mcp',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });

  it('calls onClose when the X is pressed', () => {
    const onClose = vi.fn();
    render(<CatalogModal catalog={baseCatalog} installed={[]} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('close'));
    expect(onClose).toHaveBeenCalled();
  });
});
