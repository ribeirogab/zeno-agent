import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { parseAgentsMdName } from './parse-agents-md';

const contentBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('tool_use'), name: z.string(), input: z.unknown() }),
  z.object({ type: z.literal('tool_result'), content: z.unknown() }).passthrough(),
]);

type ContentBlock = z.infer<typeof contentBlock>;

const entrySchema = z.object({
  type: z.enum(['user', 'assistant', 'system']),
  message: z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.union([z.string(), z.array(contentBlock)]),
  }),
  timestamp: z.string().optional(),
  uuid: z.string().optional(),
});

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  author: string;
  timestamp: string;
  text: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
}

function extractText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function extractToolCalls(
  content: string | ContentBlock[],
): Array<{ tool: string; input: unknown }> {
  if (typeof content === 'string') return [];
  return content
    .filter(
      (block): block is { type: 'tool_use'; name: string; input: unknown } =>
        block.type === 'tool_use',
    )
    .map((block) => ({ tool: block.name, input: block.input }));
}

function authorFor(role: 'user' | 'assistant' | 'system', operatorName: string): string {
  if (role === 'user') return operatorName;
  if (role === 'assistant') return 'Zeno';
  return '(system)';
}

function readOperatorName(profileDir: string | undefined): string {
  if (!profileDir) return 'user';
  const agentsMdPath = join(profileDir, 'AGENTS.md');
  if (!existsSync(agentsMdPath)) return 'user';
  const content = readFileSync(agentsMdPath, 'utf8');
  return parseAgentsMdName(content) ?? 'user';
}

export function readSessionMessages(
  claudeHome: string,
  sessionId: string,
  profileDir?: string,
): SessionMessage[] {
  const operatorName = readOperatorName(profileDir);
  const path = join(claudeHome, `${sessionId}.jsonl`);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index): SessionMessage => {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        return {
          id: `unparseable-${index}`,
          role: 'system',
          author: '(system)',
          timestamp: new Date(0).toISOString(),
          text: `[unparseable line ${index + 1}]`,
          toolCalls: [],
        };
      }
      const parsed = entrySchema.safeParse(raw);
      if (!parsed.success) {
        return {
          id: `invalid-${index}`,
          role: 'system',
          author: '(system)',
          timestamp: new Date(0).toISOString(),
          text: `[invalid shape line ${index + 1}]`,
          toolCalls: [],
        };
      }
      const entry = parsed.data;
      return {
        id: entry.uuid ?? `idx-${index}`,
        role: entry.type,
        author: authorFor(entry.type, operatorName),
        timestamp: entry.timestamp ?? new Date(0).toISOString(),
        text: extractText(entry.message.content),
        toolCalls: extractToolCalls(entry.message.content),
      };
    });
}
