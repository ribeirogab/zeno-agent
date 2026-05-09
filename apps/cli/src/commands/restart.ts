import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { rewriteMasterKey } from '../lib/env-file.js';
import { orchestrator } from '../lib/orchestrator/singleton.js';
import { c, info } from '../lib/output.js';
import {
  agentMountSource,
  claudeHomeVolumeName,
  containerName,
  profileDir,
  profileEnvFile,
  workspaceVolumeName,
  ZENO_HOME,
} from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { spin } from '../lib/spinner.js';
import { db } from '../lib/state.js';

const IMAGE_TAG = 'zeno-agent:dev';

export default defineCommand({
  meta: { name: 'restart', description: 'restart a profile container' },
  args: {
    profile: {
      type: 'positional',
      description: 'profile identifier (omit for sticky)',
      required: false,
    },
    all: { type: 'boolean', description: 'restart every profile' },
    build: { type: 'boolean', description: 'force rebuild image before starting' },
  },
  async run({ args }) {
    const conn = db();
    const targets: string[] = args.all
      ? queries.listProfiles(conn).map((p) => p.name)
      : [(await resolveProfile(args.profile as string | undefined)).name];
    if (targets.length === 0) {
      console.log(c.gray('no profiles to restart.'));
      return;
    }

    const orch = orchestrator();
    const imageThere = await orch.imageExists(IMAGE_TAG);
    const needsBuild = !!args.build || !imageThere;
    if (needsBuild) {
      const reason = args.build ? c.gray('(--build)') : c.gray('(image missing)');
      await spin(
        `building zeno-agent:dev ${reason}`,
        () =>
          orch.buildImage({
            tag: IMAGE_TAG,
            dockerfile: 'infra/Dockerfile',
            context: ZENO_HOME,
          }),
        { successText: `built zeno-agent:dev ${reason}` },
      );
    }

    let failures = 0;
    for (const name of targets) {
      try {
        const p = requireProfile(conn, name);
        rewriteMasterKey(profileEnvFile(name), p.masterKey);

        const cName = containerName(name);
        const live = await orch.inspectContainer(cName);
        if (live && live.state === 'running') {
          await spin(`stopping container ${c.gray(cName)}`, () => orch.stopContainer(cName), {
            successText: `Container ${c.gray(cName)} stopped`,
          });
          queries.updateProfileStatus(conn, name, {
            status: 'stopped',
            lastStoppedAt: Date.now(),
          });
        } else {
          console.log(info(`profile ${c.bold(name)} was not running`));
        }
        if (live) await orch.removeContainer(cName);

        await spin(
          `starting container ${c.gray(cName)}`,
          async () => {
            await orch.createContainer({
              name: cName,
              profile: name,
              port: p.port,
              envFile: profileEnvFile(name),
              workspaceVolume: workspaceVolumeName(name),
              claudeHomeVolume: claudeHomeVolumeName(name),
              agentMountSource: agentMountSource(),
              profileMountSource: profileDir(name),
            });
            await orch.startContainer(cName);
          },
          { successText: `Container ${c.gray(cName)} started` },
        );
        console.log(`  Port:       ${c.gold(String(p.port))} → 3000`);
        console.log(`  Dashboard:  ${c.cyan(`http://localhost:${p.port}`)}`);

        queries.updateProfileStatus(conn, name, { status: 'running', lastStartedAt: Date.now() });
        queries.appendAudit(conn, { action: 'profile.restart', target: name });
      } catch (e) {
        failures++;
        console.error(c.red(`failed: ${name} — ${(e as Error).message}`));
      }
    }
    if (args.all) {
      console.log(c.gray(`${targets.length - failures}/${targets.length} succeeded`));
    }
    if (failures > 0) process.exit(1);
  },
});
