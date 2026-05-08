import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiagramNode } from '../../src/components/diagram-node';

describe('<DiagramNode />', () => {
  it('renders kicker, name, and caption', () => {
    render(<DiagramNode kicker="backend" name="Agent" caption="Reasons over the request" />);
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Reasons over the request')).toBeInTheDocument();
  });

  it('marks highlighted nodes with data-highlighted="true"', () => {
    const { container } = render(
      <DiagramNode kicker="backend" name="Agent" caption="x" highlighted />,
    );
    expect(container.firstElementChild?.getAttribute('data-highlighted')).toBe('true');
  });
});
