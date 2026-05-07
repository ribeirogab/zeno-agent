// Real Orchestrator implementation backed by `dockerode` against the local
// Docker socket. Kept as a thin adapter; behavior is enforced by spec ACs.

import { existsSync, readFileSync } from 'node:fs';
import Docker from 'dockerode';
import type { BuildOpts, ContainerInfo, ContainerSpec, LogStream, Orchestrator } from './types.js';

const MANAGED_LABEL = 'zeno.managed';
const PROFILE_LABEL = 'zeno.profile';
const PORT_LABEL = 'zeno.port';

export class DockerOrchestrator implements Orchestrator {
  private readonly docker = new Docker();

  async daemonReachable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async imageExists(tag: string): Promise<boolean> {
    try {
      await this.docker.getImage(tag).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async buildImage(opts: BuildOpts): Promise<void> {
    const stream = await this.docker.buildImage(
      { context: opts.context, src: ['.'] },
      { t: opts.tag, dockerfile: opts.dockerfile },
    );
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => (err ? reject(err) : resolve()),
        (event: { stream?: string; status?: string }) => {
          if (opts.onProgress) {
            const line = event.stream ?? event.status;
            if (line) opts.onProgress(line.trimEnd());
          }
        },
      );
    });
  }

  async createContainer(spec: ContainerSpec): Promise<void> {
    const env = parseEnvFile(spec.envFile);
    await this.docker.createContainer({
      Image: 'zeno-agent:dev',
      name: spec.name,
      Labels: {
        [MANAGED_LABEL]: 'true',
        [PROFILE_LABEL]: spec.profile,
        [PORT_LABEL]: String(spec.port),
      },
      Env: env,
      Tty: true,
      OpenStdin: true,
      ExposedPorts: { '3000/tcp': {} },
      HostConfig: {
        PortBindings: { '3000/tcp': [{ HostPort: String(spec.port) }] },
        Mounts: [
          { Type: 'volume', Source: spec.workspaceVolume, Target: '/workspace' },
          { Type: 'volume', Source: spec.claudeHomeVolume, Target: '/home/node/.claude' },
          {
            Type: 'bind',
            Source: spec.agentMountSource,
            Target: '/app/agent',
            ReadOnly: true,
          },
          {
            Type: 'bind',
            Source: spec.profileMountSource,
            Target: '/app/profile',
            ReadOnly: true,
          },
        ],
        RestartPolicy: { Name: 'unless-stopped' },
      },
    });
  }

  async startContainer(name: string): Promise<void> {
    await this.docker.getContainer(name).start();
  }

  async stopContainer(name: string): Promise<void> {
    try {
      await this.docker.getContainer(name).stop();
    } catch (e) {
      const err = e as { statusCode?: number };
      // 304 = already stopped; treat as success.
      if (err.statusCode !== 304) throw e;
    }
  }

  async removeContainer(name: string): Promise<void> {
    try {
      await this.docker.getContainer(name).remove({ force: true });
    } catch (e) {
      const err = e as { statusCode?: number };
      if (err.statusCode !== 404) throw e;
    }
  }

  async removeVolume(name: string): Promise<void> {
    try {
      await this.docker.getVolume(name).remove();
    } catch (e) {
      const err = e as { statusCode?: number };
      if (err.statusCode !== 404) throw e;
    }
  }

  async listManagedContainers(): Promise<ContainerInfo[]> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: [`${MANAGED_LABEL}=true`] },
    });
    return containers.map((c) => containerToInfo(c));
  }

  async inspectContainer(name: string): Promise<ContainerInfo | null> {
    try {
      const data = await this.docker.getContainer(name).inspect();
      const labels = data.Config.Labels ?? {};
      const profile = labels[PROFILE_LABEL] ?? name.replace(/^zeno-/, '');
      const port = Number(labels[PORT_LABEL] ?? '0');
      const stateMap: Record<string, ContainerInfo['state']> = {
        running: 'running',
        exited: 'stopped',
        created: 'stopped',
        paused: 'failed',
        dead: 'failed',
        restarting: 'running',
      };
      return {
        name,
        profile,
        port,
        state: stateMap[data.State.Status] ?? 'failed',
        startedAt: data.State.StartedAt ?? null,
      };
    } catch (e) {
      const err = e as { statusCode?: number };
      if (err.statusCode === 404) return null;
      throw e;
    }
  }

  async streamLogs(
    name: string,
    opts: { tail: number; follow: boolean },
    onLine: (line: string) => void,
  ): Promise<LogStream> {
    const container = this.docker.getContainer(name);
    // dockerode's overload narrows on `follow: true` literal; cast through unknown.
    const stream = (await (
      container.logs as unknown as (o: {
        follow: boolean;
        stdout: boolean;
        stderr: boolean;
        tail: number;
      }) => Promise<NodeJS.ReadableStream>
    )({
      follow: opts.follow,
      stdout: true,
      stderr: true,
      tail: opts.tail,
    })) as NodeJS.ReadableStream;

    let buffer = '';
    const onData = (chunk: Buffer) => {
      // Docker multiplexed format: 8-byte header per frame. Strip headers,
      // accumulate into `buffer`, flush per newline.
      let i = 0;
      while (i < chunk.length) {
        // header
        if (chunk.length - i < 8) {
          buffer += chunk.slice(i).toString('utf8');
          break;
        }
        const len = chunk.readUInt32BE(i + 4);
        const start = i + 8;
        const end = start + len;
        if (end > chunk.length) {
          buffer += chunk.slice(start).toString('utf8');
          break;
        }
        buffer += chunk.slice(start, end).toString('utf8');
        i = end;
      }
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        onLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf('\n');
      }
    };

    stream.on('data', onData);

    return {
      abort: () => {
        stream.removeListener('data', onData);
        const destroyable = stream as { destroy?: () => void };
        if (destroyable.destroy) destroyable.destroy();
      },
    };
  }
}

function containerToInfo(c: Docker.ContainerInfo): ContainerInfo {
  const labels = c.Labels ?? {};
  const profile = labels[PROFILE_LABEL] ?? '';
  const port = Number(labels[PORT_LABEL] ?? '0');
  const stateMap: Record<string, ContainerInfo['state']> = {
    running: 'running',
    exited: 'stopped',
    created: 'stopped',
    paused: 'failed',
    dead: 'failed',
    restarting: 'running',
  };
  return {
    name: c.Names[0]?.replace(/^\//, '') ?? '',
    profile,
    port,
    state: stateMap[c.State] ?? 'failed',
    startedAt: null,
  };
}

function parseEnvFile(path: string): string[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf8');
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && l.includes('='));
}
