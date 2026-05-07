import { defineCommand } from 'citty';

import { buildImage, startContainer, stopContainer } from '../lib/orchestrator.js';
import { c, info } from '../lib/output.js';
import { requireProfile, resolveName } from '../lib/profile.js';
import { spin } from '../lib/spinner.js';
import { load, save } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'restart',
    description: 'restart a profile container',
  },
  args: {
    name: { type: 'positional', description: 'profile name (omit for sticky)', required: false },
    all: { type: 'boolean', description: 'restart every profile' },
    build: { type: 'boolean', description: 'force rebuild image before starting' },
  },
  async run({ args }) {
    const state = load();
    const targets = args.all
      ? Object.keys(state.profiles)
      : [resolveName(state, args.name as string | undefined)];
    if (targets.length === 0) {
      console.log(c.gray('no profiles to restart.'));
      return;
    }

    const buildResult = buildImage(state, { force: !!args.build });
    if (buildResult.built) {
      const reason = args.build ? c.gray('(--build)') : c.gray('(image missing)');
      await spin(`building zeno-agent:dev ${reason}`, 3000, {
        successText: `built zeno-agent:dev ${reason}`,
      });
    }

    for (const name of targets) {
      const p = requireProfile(state, name);
      const stopRes = stopContainer(state, name);
      if (!stopRes.alreadyStopped) {
        await spin(`stopping container ${c.gray(`zeno-${name}`)}`, 800, {
          successText: `Container ${c.gray(`zeno-${name}`)} stopped`,
        });
      } else {
        console.log(info(`profile ${c.bold(name)} was not running`));
      }
      const startRes = startContainer(state, name);
      if (!startRes.alreadyRunning) {
        await spin(`starting container ${c.gray(`zeno-${name}`)}`, 1500, {
          successText: `Container ${c.gray(`zeno-${name}`)} started`,
        });
        console.log(`  Port:       ${c.gold(String(p.port))} → 3000`);
        console.log(`  Dashboard:  ${c.cyan(`http://localhost:${p.port}`)}`);
      }
    }
    save(state);
  },
});
