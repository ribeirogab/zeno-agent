import type { JSX } from 'react';
import type { DisplayState } from './types';

interface DisplayPanelProps {
  value: DisplayState;
  onChange: (next: DisplayState) => void;
}

export function DisplayPanel({ value, onChange }: DisplayPanelProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <Slider
        label="node size"
        min={0.5}
        max={2.0}
        step={0.1}
        value={value.nodeSize}
        onChange={(v) => onChange({ ...value, nodeSize: v })}
      />
      <Slider
        label="link thickness"
        min={0.5}
        max={3.0}
        step={0.1}
        value={value.linkThickness}
        onChange={(v) => onChange({ ...value, linkThickness: v })}
      />
      <Slider
        label="label fade zoom"
        min={0.5}
        max={4.0}
        step={0.1}
        value={value.labelFadeZoom}
        onChange={(v) => onChange({ ...value, labelFadeZoom: v })}
      />
    </div>
  );
}

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
}

function Slider({ label, min, max, step, value, onChange }: SliderProps): JSX.Element {
  return (
    <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="text-text-secondary">{value.toFixed(1)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-gold"
      />
    </label>
  );
}
