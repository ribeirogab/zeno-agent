// In-memory MockOrchestrator. Used by unit tests of higher-level commands.

import type { BuildOpts, ContainerInfo, ContainerSpec, LogStream, Orchestrator } from './types.js';

interface MockContainer {
  spec: ContainerSpec;
  state: 'running' | 'stopped' | 'failed';
  startedAt: string | null;
}

export class MockOrchestrator implements Orchestrator {
  readonly images = new Set<string>();
  readonly containers = new Map<string, MockContainer>();
  readonly volumes = new Set<string>();
  daemonUp = true;

  async daemonReachable(): Promise<boolean> {
    return this.daemonUp;
  }

  async imageExists(tag: string): Promise<boolean> {
    return this.images.has(tag);
  }

  async buildImage(opts: BuildOpts): Promise<void> {
    this.images.add(opts.tag);
  }

  async createContainer(spec: ContainerSpec): Promise<void> {
    if (this.containers.has(spec.name)) throw new Error(`container ${spec.name} exists`);
    this.containers.set(spec.name, { spec, state: 'stopped', startedAt: null });
    this.volumes.add(spec.workspaceVolume);
    this.volumes.add(spec.claudeHomeVolume);
  }

  async startContainer(name: string): Promise<void> {
    const c = this.containers.get(name);
    if (!c) throw new Error(`no container ${name}`);
    c.state = 'running';
    c.startedAt = new Date().toISOString();
  }

  async stopContainer(name: string): Promise<void> {
    const c = this.containers.get(name);
    if (!c) throw new Error(`no container ${name}`);
    c.state = 'stopped';
  }

  async removeContainer(name: string): Promise<void> {
    this.containers.delete(name);
  }

  async removeVolume(name: string): Promise<void> {
    this.volumes.delete(name);
  }

  async listManagedContainers(): Promise<ContainerInfo[]> {
    return [...this.containers.values()].map((c) => ({
      name: c.spec.name,
      profile: c.spec.profile,
      port: c.spec.port,
      state: c.state,
      startedAt: c.startedAt,
    }));
  }

  async inspectContainer(name: string): Promise<ContainerInfo | null> {
    const c = this.containers.get(name);
    if (!c) return null;
    return {
      name: c.spec.name,
      profile: c.spec.profile,
      port: c.spec.port,
      state: c.state,
      startedAt: c.startedAt,
    };
  }

  async streamLogs(
    _name: string,
    _opts: { tail: number; follow: boolean },
    _onLine: (line: string) => void,
  ): Promise<LogStream> {
    return { abort: () => {} };
  }
}
