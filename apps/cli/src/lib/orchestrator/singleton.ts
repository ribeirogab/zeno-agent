import { DockerOrchestrator } from './docker.js';
import type { Orchestrator } from './types.js';

let cached: Orchestrator | null = null;

/** Lazy singleton — created on first access. Tests inject their own via `setOrchestrator`. */
export function orchestrator(): Orchestrator {
  if (!cached) cached = new DockerOrchestrator();
  return cached;
}

export function setOrchestrator(o: Orchestrator): void {
  cached = o;
}
