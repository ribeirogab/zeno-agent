/**
 * PEM input — drag-drop + click-to-pick + paste-textarea. Spec 0046.
 *
 * Drag-drop uses native HTML5 drag events; click-to-pick uses a hidden file
 * input. No external dependency (react-dropzone considered, rejected for
 * bundle size — same UX with native events + ~80 LOC). Accessibility-friendly:
 * the textarea is the canonical input; drag-drop is enhancement; keyboard
 * users use the click-to-pick button or paste directly.
 */

import type { ChangeEvent, DragEvent, JSX } from 'react';
import { useId, useRef, useState } from 'react';

export interface PemDropzoneProps {
  /** Current PEM value (canonical state lives in parent). */
  value: string;
  /** Setter for the PEM value. */
  onChange: (next: string) => void;
  /** Optional label override. Defaults to "PEM (RSA private key)". */
  label?: string;
  /** Optional help text. */
  help?: string;
  /** Number of rows for the textarea. */
  rows?: number;
}

export function PemDropzone({
  value,
  onChange,
  label,
  help,
  rows = 8,
}: PemDropzoneProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const textareaId = useId();
  const helpId = useId();

  const handleFile = (file: File): void => {
    setWarning(null);
    if (!/\.(pem|key)$/i.test(file.name)) {
      setWarning(`expected .pem or .key file, got "${file.name}" — accepting anyway`);
    }
    file.text().then(
      (text) => onChange(text),
      (err) =>
        setWarning(`failed to read file: ${err instanceof Error ? err.message : String(err)}`),
    );
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
  };

  const handlePickFile = (): void => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset so picking the same file again still triggers onChange
    e.target.value = '';
  };

  const dropzoneClasses = `flex flex-col gap-2 border-2 border-dashed transition-colors duration-[120ms] ${
    dragOver ? 'border-gold bg-gold/10' : 'border-border-subtle'
  } px-3 py-2`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={textareaId}
        className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold"
      >
        {label ?? 'PEM (RSA private key)'}
      </label>
      <section
        className={dropzoneClasses}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        aria-label="PEM input"
      >
        <textarea
          id={textareaId}
          value={value}
          placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          aria-describedby={helpId}
          className="bg-panel-2 border border-border-subtle px-3 py-2.5 font-mono text-[11px] leading-[14px] text-text-primary"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePickFile}
            className="font-mono text-[10px] tracking-[0.08em] uppercase text-gold hover:underline"
          >
            choose .pem file
          </button>
          <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
            or drag-drop · or paste
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pem,.key"
          className="hidden"
          onChange={handleFileChange}
        />
      </section>
      <span id={helpId} className="font-mono text-[11px] leading-[14px] text-text-tertiary">
        {help ??
          'Paste, drag-drop, or pick the PEM file you downloaded from your GitHub App settings. Stored encrypted at rest; only the SHA-256 fingerprint is shown after install.'}
      </span>
      {warning && (
        <span className="font-mono text-[11px] leading-[14px] text-status-failed">{warning}</span>
      )}
    </div>
  );
}
