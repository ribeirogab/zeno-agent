import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { ClassifierResult } from '../types.js';
import { CLASSIFIER_SYSTEM_PROMPT } from './prompt.js';

interface HaikuClassifierOptions {
  model: string;
  timeoutMs?: number;
}

const ResultSchema = z.object({
  sensitive: z.boolean(),
  reason: z.string(),
});

/**
 * Strip optional ```json fences and parse + validate the classifier's reply.
 * Throws on any deviation from the contract — callers translate that into a
 * fail-safe deny via the policy.
 */
/**
 * Parse the classifier reply tolerantly. Tries strict JSON first, then extracts
 * the first JSON object from prose (some Haiku turns prepend an explanatory
 * sentence even when instructed not to). Throws if no valid object can be
 * extracted — callers translate that into a fail-safe deny.
 */
export function parseClassifierOutput(text: string): ClassifierResult {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const candidates: string[] = [unfenced];
  const objectMatch = unfenced.match(/\{[\s\S]*?"sensitive"[\s\S]*?\}/);
  if (objectMatch && objectMatch[0] !== unfenced) {
    candidates.push(objectMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return ResultSchema.parse(parsed);
    } catch {
      // try next candidate
    }
  }
  throw new Error(`classifier output not parseable: ${text.slice(0, 200)}`);
}

/**
 * LLM-driven sensitivity classifier. Issues a short turn against Haiku via the
 * Claude Agent SDK (reusing the existing OAuth token), with `allowedTools: []`
 * so the model can only emit text. A 10s default timeout enforces fail-safe.
 */
export class HaikuClassifier {
  constructor(private readonly opts: HaikuClassifierOptions) {}

  async classify(toolName: string, input: Record<string, unknown>): Promise<ClassifierResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 10_000);
    try {
      const iter = query({
        prompt: JSON.stringify({ tool: toolName, input }),
        options: {
          systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
          allowedTools: [],
          model: this.opts.model,
          permissionMode: 'bypassPermissions',
          abortController: controller,
          settingSources: ['user'],
        },
      });

      let text = '';
      for await (const message of iter) {
        if (
          message.type === 'result' &&
          'result' in message &&
          typeof message.result === 'string'
        ) {
          text = message.result;
        }
      }

      if (!text) {
        throw new Error('classifier returned empty result');
      }
      return parseClassifierOutput(text);
    } finally {
      clearTimeout(timer);
    }
  }
}
