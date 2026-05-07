import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HowItWorksSection } from '../../src/sections/how-it-works-section';

describe('<HowItWorksSection />', () => {
  it('renders four diagram nodes with exactly one highlighted (Agent · Claude)', () => {
    const { container } = render(<HowItWorksSection />);

    const nodes = container.querySelectorAll('[data-highlighted], h2, .diagram-node');
    expect(nodes.length).toBeGreaterThan(0);

    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('Channel adapter')).toBeInTheDocument();
    expect(screen.getByText('Agent · Claude')).toBeInTheDocument();
    expect(screen.getByText('MCP servers')).toBeInTheDocument();

    const highlighted = container.querySelectorAll('[data-highlighted="true"]');
    expect(highlighted).toHaveLength(1);

    const highlightedName = highlighted[0]?.querySelector('span:nth-of-type(2)')?.textContent;
    expect(highlightedName).toBe('Agent · Claude');
  });
});
