import { defineCommand } from 'citty';
import { orchestrator } from '../lib/orchestrator/singleton.js';
import { c, err } from '../lib/output.js';
import { containerName } from '../lib/paths.js';
import { requireProfile, resolveName } from '../lib/profile.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'logs', description: 'tail container logs' },
  args: {
    profile: {
      type: 'positional',
      description: 'profile identifier (omit for sticky)',
      required: false,
    },
    tail: { type: 'string', description: 'last N lines (default 50)' },
  },
  async run({ args }) {
    const conn = db();
    const name = resolveName(conn, args.profile as string | undefined);
    requireProfile(conn, name);
    const tail = args.tail ? Number(args.tail) : 50;
    if (!Number.isInteger(tail) || tail < 0) {
      console.error(err('--tail must be a non-negative integer'));
      process.exit(1);
    }
    const orch = orchestrator();
    const cName = containerName(name);
    const live = await orch.inspectContainer(cName);
    if (!live || live.state !== 'running') {
      console.error(err(`profile ${c.bold(name)} is not running`));
      process.exit(1);
    }
    const stream = await orch.streamLogs(cName, { tail, follow: true }, (line) => {
      process.stdout.write(`${line}\n`);
    });
    const onSig = () => {
      stream.abort();
      process.exit(0);
    };
    process.on('SIGINT', onSig);
    process.on('SIGTERM', onSig);
  },
});
