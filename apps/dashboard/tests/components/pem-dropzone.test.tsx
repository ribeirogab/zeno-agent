import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PemDropzone } from '@/components/shared/pem-dropzone';

afterEach(() => cleanup());

function Wrapper() {
  const [value, setValue] = useState('');
  return <PemDropzone value={value} onChange={setValue} />;
}

describe('<PemDropzone>', () => {
  it('renders the textarea + choose-file button', () => {
    render(<Wrapper />);
    expect(document.querySelector('textarea')).toBeDefined();
    expect(screen.getByText(/choose .pem file/i)).toBeDefined();
  });

  it('forwards textarea changes via onChange', () => {
    let captured = '';
    const TestComponent = () => {
      const [value, setValue] = useState('');
      return (
        <PemDropzone
          value={value}
          onChange={(next) => {
            captured = next;
            setValue(next);
          }}
        />
      );
    };
    render(<TestComponent />);
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '-----BEGIN PRIVATE KEY-----' } });
    expect(captured).toBe('-----BEGIN PRIVATE KEY-----');
  });

  it('renders the default label and help text', () => {
    render(<Wrapper />);
    expect(screen.getByText(/PEM \(RSA private key\)/i)).toBeDefined();
    expect(screen.getByText(/Paste, drag-drop, or pick/i)).toBeDefined();
  });

  it('renders a custom label when provided', () => {
    const TestComponent = () => {
      const [value, setValue] = useState('');
      return <PemDropzone value={value} onChange={setValue} label="new key" />;
    };
    render(<TestComponent />);
    expect(screen.getByText('new key')).toBeDefined();
  });
});
