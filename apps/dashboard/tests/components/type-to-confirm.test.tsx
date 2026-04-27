import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { TypeToConfirm } from '@/components/shared/type-to-confirm';

afterEach(() => cleanup());

function Wrapper({ expected }: { expected: string }) {
  const [value, setValue] = useState('');
  return <TypeToConfirm expected={expected} value={value} onChange={setValue} />;
}

describe('<TypeToConfirm>', () => {
  it('renders the expected value above the input', () => {
    render(<Wrapper expected="Zen Bot" />);
    expect(screen.getByText('Zen Bot')).toBeDefined();
  });

  it('renders the default label when none provided', () => {
    render(<Wrapper expected="x" />);
    expect(screen.getByText('type the value to confirm')).toBeDefined();
  });

  it('renders a custom label when provided', () => {
    const TestComponent = () => {
      const [value, setValue] = useState('');
      return (
        <TypeToConfirm expected="x" label="custom label here" value={value} onChange={setValue} />
      );
    };
    render(<TestComponent />);
    expect(screen.getByText('custom label here')).toBeDefined();
  });

  it('aria-invalid=true when value is non-empty and does not match', () => {
    render(<Wrapper expected="hello" />);
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wrong' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('aria-invalid=false when value matches', () => {
    render(<Wrapper expected="hello" />);
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });
});
