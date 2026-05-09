import { defineCommand } from 'citty';
import {
  c,
  formatTime,
  formatUptime,
  rule,
  setQuiet,
  statusDot,
  statusLabel,
} from '../lib/output.js';
import {
  claudeHomeVolumeName,
  containerName,
  profileDir,
  workspaceVolumeName,
} from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { db } from '../lib/state.js';
import type { ProfileShowJson } from '../types/json-output.js';

const IMAGE_TAG = 'zeno-agent:dev';

export default defineCommand({
  meta: { name: 'show', description: 'show profile details' },
  args: {
    profile: { type: 'positional', description: 'profile identifier', required: true },
    json: { type: 'boolean', description: 'emit JSON' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  run({ args }) {
    if (args.quiet) setQuiet(true);

    const conn = db();
    const name = args.profile;
    const p = requireProfile(conn, name);

    if (args.json) {
      const data: ProfileShowJson = {
        name,
        port: p.port,
        status: p.status,
        createdAt: p.createdAt,
        lastStartedAt: p.lastStartedAt,
        lastStoppedAt: p.lastStoppedAt,
        uptimeMs: p.status === 'running' && p.lastStartedAt ? Date.now() - p.lastStartedAt : null,
        dashboardUrl: `http://localhost:${p.port}`,
        containerName: containerName(name),
        image: IMAGE_TAG,
        workspaceVolume: workspaceVolumeName(name),
        claudeHomeVolume: claudeHomeVolumeName(name),
        profileDir: profileDir(name),
      };
      process.stdout.write(`${JSON.stringify(data)}\n`);
      return;
    }

    console.log('');
    console.log(`  ${c.bold('Profile:')} ${c.gold(name)}`);
    console.log(`  ${rule(50)}`);
    console.log(`  Port:            ${p.port}`);
    console.log(`  Status:          ${statusDot(p.status)} ${statusLabel(p.status)}`);
    console.log(`  Created:         ${formatTime(p.createdAt)}`);
    console.log(`  Last started:    ${formatTime(p.lastStartedAt)}`);
    console.log(`  Last stopped:    ${formatTime(p.lastStoppedAt)}`);
    if (p.status === 'running') console.log(`  Uptime:          ${formatUptime(p.lastStartedAt)}`);
    console.log('');
    console.log(`  Dashboard:       ${c.cyan(`http://localhost:${p.port}`)}`);
    console.log(`  Container name:  ${c.gray(containerName(name))}`);
    console.log(`  Image:           ${c.gray(IMAGE_TAG)}`);
    console.log('');
    console.log(`  ${c.bold('Volumes')}`);
    console.log(`    workspace:     ${c.gray(workspaceVolumeName(name))}`);
    console.log(`    claude home:   ${c.gray(claudeHomeVolumeName(name))}`);
    console.log('');
    console.log(`  ${c.bold('Mounts')} ${c.gray('(read-only binds)')}`);
    console.log(`    /app/agent     ${c.gray('← ~/.zeno/zeno-agent/agent')}`);
    console.log(`    /app/profile   ${c.gray(`← ~/.zeno/profiles/${name}`)}`);
    console.log('');
  },
});
