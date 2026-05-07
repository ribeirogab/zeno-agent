// Mock orchestrator. Real impl will replace this with Docker socket calls.
// All operations here are pure state mutations + console-facing prints in `would do X` form when relevant.

import { audit, type State } from './state.js';

export interface StartResult {
  alreadyRunning: boolean;
}
export interface StopResult {
  alreadyStopped: boolean;
}
export interface BuildResult {
  built: boolean;
}

export function buildImage(state: State, opts: { force?: boolean } = {}): BuildResult {
  if (state.imageBuilt && !opts.force) return { built: false };
  state.imageBuilt = true;
  audit(state, 'image.build', null, { forced: !!opts.force });
  return { built: true };
}

export function startContainer(state: State, name: string): StartResult {
  const p = state.profiles[name];
  if (!p) throw new Error(`unknown profile ${name}`);
  if (p.status === 'running') return { alreadyRunning: true };
  p.status = 'running';
  p.lastStartedAt = new Date().toISOString();
  audit(state, 'profile.start', name, {});
  return { alreadyRunning: false };
}

export function stopContainer(state: State, name: string): StopResult {
  const p = state.profiles[name];
  if (!p) throw new Error(`unknown profile ${name}`);
  if (p.status !== 'running') return { alreadyStopped: true };
  p.status = 'stopped';
  p.lastStoppedAt = new Date().toISOString();
  audit(state, 'profile.stop', name, {});
  return { alreadyStopped: false };
}
