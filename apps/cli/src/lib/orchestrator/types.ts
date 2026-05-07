// Orchestrator interface — abstracts Docker socket calls so the CLI is testable
// against an in-memory MockOrchestrator without a Docker daemon.

export interface ContainerSpec {
  name: string;
  profile: string;
  port: number;
  envFile: string;
  workspaceVolume: string;
  claudeHomeVolume: string;
  agentMountSource: string;
  profileMountSource: string;
}

export interface ContainerInfo {
  name: string;
  profile: string;
  port: number;
  state: 'running' | 'stopped' | 'failed';
  startedAt: string | null;
}

export interface BuildOpts {
  tag: string;
  dockerfile: string;
  context: string;
  onProgress?: (line: string) => void;
}

export interface LogStream {
  abort: () => void;
}

export interface Orchestrator {
  daemonReachable(): Promise<boolean>;
  imageExists(tag: string): Promise<boolean>;
  buildImage(opts: BuildOpts): Promise<void>;
  createContainer(spec: ContainerSpec): Promise<void>;
  startContainer(name: string): Promise<void>;
  stopContainer(name: string): Promise<void>;
  removeContainer(name: string): Promise<void>;
  removeVolume(name: string): Promise<void>;
  listManagedContainers(): Promise<ContainerInfo[]>;
  inspectContainer(name: string): Promise<ContainerInfo | null>;
  streamLogs(
    name: string,
    opts: { tail: number; follow: boolean },
    onLine: (line: string) => void,
  ): Promise<LogStream>;
}
