import { defineCommand } from 'citty';
import { c, formatTime, formatUptime, rule, statusDot, statusLabel } from '../lib/output.js';
import { claudeHomeVolumeName, containerName, workspaceVolumeName } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'show', description: 'show profile details' },
  args: {
    profile: { type: 'positional', description: 'profile identifier', required: true },
  },
  run({ args }) {
    const conn = db();
    const name = args.profile;
    const p = requireProfile(conn, name);
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
    console.log(`  Image:           ${c.gray('zeno-agent:dev')}`);
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
