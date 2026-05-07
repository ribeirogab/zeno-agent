import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiagramNode } from '../../src/components/diagram-node';

describe('<DiagramNode />', () => {
  it('renders kicker, name, and caption', () => {
    render(
      <DiagramNode kicker="backend" name="Agent · Claude" caption="Reasons over the request" />,
    );
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.getByText('Agent · Claude')).toBeInTheDocument();
    expect(screen.getByText('Reasons over the request')).toBeInTheDocument();
  });

  it('marks highlighted nodes with data-highlighted="true"', () => {
    const { container } = render(
      <DiagramNode kicker="backend" name="Agent · Claude" caption="x" highlighted />,
    );
    expect(container.firstElementChild?.getAttribute('data-highlighted')).toBe('true');
  });
});
