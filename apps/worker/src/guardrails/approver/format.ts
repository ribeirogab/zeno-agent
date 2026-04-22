import type { ApprovalRequest } from '../types.js';

const MAX_INPUT_CHARS = 500;

function truncateInput(input: Record<string, unknown>): string {
  const json = JSON.stringify(input);
  if (json.length <= MAX_INPUT_CHARS) return json;
  return `${json.slice(0, MAX_INPUT_CHARS)}… (truncated)`;
}

/**
 * Owner-mode message: posted in the same thread the owner is talking in. Short,
 * because the owner already has the conversation context.
 */
export function formatOwnerThreadMessage(request: ApprovalRequest): string {
  const lines = [
    'Posso executar essa ação?',
    `*Tool:* \`${request.toolName}\``,
    `*Input:* \`${truncateInput(request.toolInput)}\``,
  ];
  if (request.classifierReason) {
    lines.push(`*Motivo:* ${request.classifierReason}`);
  }
  lines.push('Reaja com 👍 aprova / 👎 nega.');
  return lines.join('\n');
}

/**
 * Worker-mode DM: posted privately to the owner. Includes who asked and a link
 * back to the original thread so the owner has enough context to decide.
 */
export function formatOwnerDmMessage(request: ApprovalRequest, threadLink: string): string {
  const lines = [
    'Pedido de aprovação:',
    `*Pedido por:* <@${request.requesterUserId}>`,
    `*Tool:* \`${request.toolName}\``,
    `*Input:* \`${truncateInput(request.toolInput)}\``,
  ];
  if (request.classifierReason) {
    lines.push(`*Motivo:* ${request.classifierReason}`);
  }
  lines.push(`*Link:* ${threadLink}`);
  lines.push('Reaja com 👍 aprova / 👎 nega.');
  return lines.join('\n');
}
