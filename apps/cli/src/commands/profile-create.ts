import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { c, err, ok, setQuiet } from '../lib/output.js';
import {
  generateMasterKey,
  isPortTaken,
  nextAvailablePort,
  PORT_MAX,
  PORT_MIN,
  validateName,
} from '../lib/profile.js';
import { db } from '../lib/state.js';
import { detectTimezone, materializeProfile } from '../lib/templates.js';

async function promptOwner(): Promise<string> {
  const rl = createInterface({ input, output });
  const answer = await rl.question('? How should Zeno call you? ');
  rl.close();
  return answer.trim();
}

export default defineCommand({
  meta: {
    name: 'create',
    description: 'create a new profile',
  },
  args: {
    profile: {
      type: 'positional',
      description: 'profile identifier (lowercase kebab-case, e.g. "personal", "work")',
      required: true,
    },
    owner: {
      type: 'string',
      description: 'how Zeno calls you (goes to USER.md). Prompted if omitted.',
    },
    port: {
      type: 'string',
      description: `host port (${PORT_MIN}-${PORT_MAX}). auto-allocated if omitted`,
    },
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'skip prompts, use placeholder for missing fields',
    },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const name = args.profile;
    const validation = validateName(name);
    if (validation !== true) {
      console.error(err(validation));
      process.exit(1);
    }
    if (queries.findProfile(conn, name)) {
      console.error(err(`profile '${name}' already exists`));
      process.exit(1);
    }

    let port: number;
    if (args.port) {
      const parsed = Number(args.port);
      if (!Number.isInteger(parsed) || parsed < PORT_MIN || parsed > PORT_MAX) {
        console.error(err(`port must be integer in [${PORT_MIN}, ${PORT_MAX}]`));
        process.exit(1);
      }
      if (isPortTaken(conn, parsed)) {
        console.error(err(`port ${parsed} already taken`));
        process.exit(1);
      }
      port = parsed;
    } else {
      const auto = nextAvailablePort(conn);
      if (auto === null) {
        console.error(err(`no available ports in [${PORT_MIN}, ${PORT_MAX}]`));
        process.exit(1);
      }
      port = auto;
    }

    let ownerName = args.owner ?? '';
    if (!ownerName) {
      if (args.yes) {
        ownerName = '<your-name>';
      } else {
        ownerName = await promptOwner();
        if (!ownerName) {
          console.error(err('owner name is required (or pass --owner / -y)'));
          process.exit(1);
        }
      }
    }
    const timezone = detectTimezone();
    const masterKey = generateMasterKey();

    materializeProfile({ profile: name, ownerName, timezone, masterKey });
    queries.createProfile(conn, { name, port, masterKey });
    queries.appendAudit(conn, { action: 'profile.create', target: name, details: { port } });

    console.log(ok(`Profile ${c.bold(name)} created`));
    console.log(`  Port:        ${c.gold(String(port))}`);
    console.log(`  Owner:       ${ownerName}`);
    console.log(`  Timezone:    ${c.gray(timezone)}`);
    console.log(`  USER.md:     ${c.gray(`~/.zeno/profiles/${name}/USER.md`)}`);
    console.log('');
    console.log(`  ${c.gray('Edit:')}  $EDITOR ~/.zeno/profiles/${name}/USER.md`);
    console.log(`  ${c.gray('Then:')}  ${c.gold(`zeno start ${name}`)}`);
  },
});
