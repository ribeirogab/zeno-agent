// Real Orchestrator implementation backed by `dockerode` against the local
// Docker socket. Kept as a thin adapter; behavior is enforced by spec ACs.
//
// Image builds spawn the `docker` CLI as a subprocess (not dockerode's
// buildImage) because the CLI honors `.dockerignore` by default — the
// dockerode HTTP API does not, and would tar the host's `node_modules/`
// into the build context, overwriting the multi-stage builder's
// linux-arch native binaries with the host's macOS Mach-O ones.

import { spawn } from 'node:child_process';
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
    return new Promise<void>((resolve, reject) => {
      // cwd: opts.context so the Dockerfile path and `.` build context resolve
      // against the repo root regardless of where the operator invoked the CLI.
      const child = spawn('docker', ['build', '-t', opts.tag, '-f', opts.dockerfile, '.'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: opts.context,
      });
      let stderr = '';
      const onLine = (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderr += text;
        if (opts.onProgress) {
          for (const line of text.split('\n')) {
            if (line.trim()) opts.onProgress(line.trimEnd());
          }
        }
      };
      child.stdout.on('data', onLine);
      child.stderr.on('data', onLine);
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`docker build exited ${code}\n${stderr.slice(-2000)}`));
      });
    });
  }

  async createContainer(spec: ContainerSpec): Promise<void> {
    const fileEnv = parseEnvFile(spec.envFile);
    // Spec 0072 — pass ZENO_PROFILE so the worker's BackendCredentialsRepo
    // / BackendSettingsRepo open the correct row partition. Without this,
    // the worker defaults to profileId='default' and can't see credentials
    // the host CLI wrote for the actual profile name.
    const env = [
      `ZENO_PROFILE=${spec.profile}`,
      ...fileEnv.filter((e) => !e.startsWith('ZENO_PROFILE=')),
    ];
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
          { Type: 'bind', Source: spec.workspaceBindPath, Target: '/workspace' },
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
          {
            Type: 'bind',
            Source: spec.knowledgeMountSource,
            Target: '/app/knowledge',
            ReadOnly: true,
          },
          {
            Type: 'bind',
            Source: spec.cronsMountSource,
            Target: '/app/crons',
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
