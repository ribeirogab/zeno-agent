import { c, err } from './output.js';

interface IO {
  stdin?: NodeJS.ReadableStream & {
    isTTY?: boolean;
    setRawMode?: (v: boolean) => void;
    resume?: () => void;
    pause?: () => void;
  };
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  exit?: (code: number) => unknown;
}

function defaults(): Required<IO> {
  return {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    exit: (code: number) => process.exit(code),
  };
}

const ETX = '';
const BACKSPACE = '';

export async function promptHidden(label: string, help?: string, io: IO = {}): Promise<string> {
  const { stdin, stdout, stderr, exit } = { ...defaults(), ...io };
  if (!stdin.isTTY) {
    stderr.write(`${err('secret value required but stdin is not a TTY. pass via --secret KEY=VALUE')}\n`);
    exit(1);
    return '';
  }
  if (help) stdout.write(`${c.dim(help)}\n`);
  stdout.write(`${label}: `);
  stdin.setRawMode?.(true);
  stdin.resume?.();
  return new Promise<string>((resolve) => {
    let value = '';
    const onData = (chunk: Buffer | string) => {
      const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (let i = 0; i < data.length; i++) {
        const ch = data[i];
        if (ch === '\n' || ch === '\r') {
          stdin.removeListener('data', onData);
          stdin.setRawMode?.(false);
          stdin.pause?.();
          stdout.write('\n');
          return resolve(value);
        }
        if (ch === ETX) {
          stdin.removeListener('data', onData);
          stdin.setRawMode?.(false);
          stdin.pause?.();
          exit(130);
          return resolve('');
        }
        if (ch === BACKSPACE) {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

export async function confirm(prompt: string, io: IO = {}): Promise<boolean> {
  const { stdin, stdout } = { ...defaults(), ...io };
  stdout.write(`${prompt} `);
  stdin.resume?.();
  return new Promise<boolean>((resolve) => {
    const onData = (chunk: Buffer | string) => {
      const reply = (typeof chunk === 'string' ? chunk : chunk.toString('utf8')).trim().toLowerCase();
      stdin.removeListener('data', onData);
      stdin.pause?.();
      resolve(reply === 'y' || reply === 'yes');
    };
    stdin.on('data', onData);
  });
}

export async function confirmDestructive(
  prompt: string,
  args: { yes?: boolean },
  io: IO = {},
): Promise<boolean> {
  if (args.yes) return true;
  const { stdin, stderr } = { ...defaults(), ...io };
  if (!stdin.isTTY) {
    stderr.write(`${err('destructive operation requires --yes in non-interactive mode')}\n`);
    return false;
  }
  return confirm(prompt, io);
}
