// Read templates/profile/* and write a freshly-created profile dir
// under ~/.zeno/profiles/<name>/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  knowledgeDir,
  profileDir,
  templatesProfileDir,
  templatesProfileKnowledgeDir,
} from './paths.js';

export function readAgentsTemplate(): string {
  return readFileSync(join(templatesProfileDir(), 'AGENTS.md'), 'utf8');
}

export function readEnvTemplate(): string {
  return readFileSync(join(templatesProfileDir(), 'env.template'), 'utf8');
}

export function readKnowledgeTemplateMd(): string {
  return readFileSync(join(templatesProfileKnowledgeDir(), '_template.md'), 'utf8');
}

export function readKnowledgeIndexPlaceholder(): string {
  return readFileSync(join(templatesProfileKnowledgeDir(), '_index.md'), 'utf8');
}

export function readKnowledgeReadme(): string {
  return readFileSync(join(templatesProfileKnowledgeDir(), '_README.md'), 'utf8');
}

export function renderEnv(opts: { masterKey: string }): string {
  return readEnvTemplate().replace(/<generated>/g, opts.masterKey);
}

/**
 * Materialize a fresh profile directory at ~/.zeno/profiles/<profile>/ with
 * AGENTS.md, .env, and knowledge/{_template.md,_index.md,_README.md} written
 * from the canonical templates.
 */
export function materializeProfile(opts: { profile: string; masterKey: string }): void {
  const dir = profileDir(opts.profile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), readAgentsTemplate(), 'utf8');
  writeFileSync(join(dir, '.env'), renderEnv({ masterKey: opts.masterKey }), 'utf8');

  const kDir = knowledgeDir(opts.profile);
  if (!existsSync(kDir)) mkdirSync(kDir, { recursive: true });
  writeFileSync(join(kDir, '_template.md'), readKnowledgeTemplateMd(), 'utf8');
  writeFileSync(join(kDir, '_index.md'), readKnowledgeIndexPlaceholder(), 'utf8');
  writeFileSync(join(kDir, '_README.md'), readKnowledgeReadme(), 'utf8');
}
