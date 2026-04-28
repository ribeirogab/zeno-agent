/**
 * Spec 0054: build the [zeno_context] block prepended to the cron prompt
 * when the cron has linked skills and/or linked connectors. Pure function;
 * no DB, no logging — caller passes the resolved Skill[] + slug[].
 *
 * Bytes-cap semantics: skill bodies are concatenated in the input order. If
 * the running total of skill `## name + body` pieces would exceed
 * `capBytes`, the next skill is dropped (and every skill after it). The
 * dropped names surface in `droppedSkills` so the caller can emit
 * `cron_skill_truncated`.
 *
 * Format:
 *   [zeno_context]
 *   linked_skills:
 *   ## name-1
 *
 *   <body-1>
 *
 *   ---
 *
 *   ## name-2
 *
 *   <body-2>
 *   linked_connectors: <slug-a>, <slug-b>
 *   [/zeno_context]
 *
 *   <original prompt>
 *
 * When zero skills + zero connectors: returns `{ block: null, ... }` and
 * the caller skips prepending entirely (back-compat for unlinked crons).
 */
export const ZENO_CONTEXT_CAP_BYTES = 20_480; // 20 KB total skill bodies

export interface SkillForBlock {
  name: string;
  body: string;
}

export interface BuildBlockResult {
  block: string | null;
  /** Total bytes the input skills would have used if uncapped. */
  requestedBytes: number;
  /** Total bytes actually included after the cap was applied. */
  truncatedBytes: number;
  /** Names of skills dropped because the cap was exceeded. */
  droppedSkills: string[];
}

export function buildZenoContextBlock(
  skills: SkillForBlock[],
  connectorSlugs: string[],
  capBytes = ZENO_CONTEXT_CAP_BYTES,
): BuildBlockResult {
  if (skills.length === 0 && connectorSlugs.length === 0) {
    return { block: null, requestedBytes: 0, truncatedBytes: 0, droppedSkills: [] };
  }

  let runningBytes = 0;
  const kept: SkillForBlock[] = [];
  const dropped: string[] = [];
  let requested = 0;

  for (const skill of skills) {
    const piece = `## ${skill.name}\n\n${skill.body}`;
    const size = Buffer.byteLength(piece, 'utf-8');
    requested += size;
    if (runningBytes + size <= capBytes) {
      kept.push(skill);
      runningBytes += size;
    } else {
      dropped.push(skill.name);
    }
  }

  const lines: string[] = ['[zeno_context]'];
  if (kept.length > 0) {
    lines.push('linked_skills:');
    lines.push(kept.map((s) => `## ${s.name}\n\n${s.body}`).join('\n\n---\n\n'));
  }
  if (connectorSlugs.length > 0) {
    lines.push(`linked_connectors: ${connectorSlugs.join(', ')}`);
  }
  lines.push('[/zeno_context]');

  return {
    block: lines.join('\n'),
    requestedBytes: requested,
    truncatedBytes: runningBytes,
    droppedSkills: dropped,
  };
}
