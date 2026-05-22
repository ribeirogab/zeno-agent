// Read templates/profile/* and write a freshly-created profile dir
// under ~/.zeno/profiles/<name>/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cronsDir,
  knowledgeDir,
  profileDir,
  templatesProfileCronsDir,
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

export function readCronsReadme(): string {
  return readFileSync(join(templatesProfileCronsDir(), '_README.md'), 'utf8');
}

export function readCronTemplateMd(): string {
  return readFileSync(join(templatesProfileCronsDir(), '_template', 'CRON.md'), 'utf8');
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

  // Spec 2026-05-22 (crons CLI-first) — scaffold crons folder.
  const cDir = cronsDir(opts.profile);
  if (!existsSync(cDir)) mkdirSync(cDir, { recursive: true });
  writeFileSync(join(cDir, '_README.md'), readCronsReadme(), 'utf8');
  const templateDir = join(cDir, '_template');
  if (!existsSync(templateDir)) mkdirSync(templateDir, { recursive: true });
  writeFileSync(join(templateDir, 'CRON.md'), readCronTemplateMd(), 'utf8');
}
