import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { nextRunAfter, validateSchedule } from '@/cron/parser';
import type { CronRunner } from '@/cron/runner';
import { logger } from '@/logger';
import type { CronRunRepo } from '@/storage/repos/cron-runs';
import type { CronRepo } from '@/storage/repos/crons';
import type { Cron, CronRun, CronSource } from '@/storage/types';

interface CronToolDeps {
  crons: CronRepo;
  cronRuns: CronRunRepo;
  runner: CronRunner;
}

function jsonText(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function errorText(message: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function serializeCron(cron: Cron): Record<string, unknown> {
  return {
    id: cron.id,
    name: cron.name,
    description: cron.description,
    prompt: cron.prompt,
    schedule: cron.schedule,
    enabled: cron.enabled,
    source: cron.source,
    createdBy: cron.createdBy,
    notify: {
      conversationId: cron.notifyConversationId,
      threadId: cron.notifyThreadId,
    },
    lastRunAt: cron.lastRunAt,
    nextRunAt: cron.nextRunAt,
    createdAt: cron.createdAt,
    updatedAt: cron.updatedAt,
  };
}

function serializeRun(run: CronRun): Record<string, unknown> {
  return {
    id: run.id,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    status: run.status,
    output: run.output,
    error: run.error,
  };
}

/**
 * Build the in-process MCP server exposing cron CRUD tools to the agent.
 * Returned value is meant to be passed under `mcpServers.zeno` to the SDK's `query()`.
 */
export function buildCronMcpServer(deps: CronToolDeps) {
  const cronCreate = tool(
    'cron_create',
    'Create a new scheduled task. Use when the user asks Zeno to do something on a recurring schedule. Validates the cron expression before persisting. Defaults notify_* to the current Slack conversation/thread when provided in the [slack_context] preamble.',
    {
      name: z
        .string()
        .min(1)
        .regex(/^[a-z0-9][a-z0-9-]*$/, 'kebab-case lowercase letters, digits, and hyphens'),
      description: z.string().optional(),
      prompt: z.string().min(1).describe('What Zeno should do when the cron fires'),
      schedule: z.string().min(1).describe('5-field cron expression, e.g. "0 9 * * 1-5"'),
      notify_conversation_id: z
        .string()
        .nullish()
        .describe('Slack channel/DM id to post output to'),
      notify_thread_id: z.string().nullish().describe('Optional Slack thread ts'),
    },
    async (args) => {
      try {
        validateSchedule(args.schedule);
      } catch (error) {
        return errorText(`invalid schedule expression: ${String(error)}`);
      }
      const next = nextRunAfter(args.schedule, new Date());
      const created = deps.crons.create({
        name: args.name,
        description: args.description ?? null,
        prompt: args.prompt,
        schedule: args.schedule,
        enabled: true,
        source: 'chat',
        createdBy: 'slack',
        notifyConversationId: args.notify_conversation_id ?? null,
        notifyThreadId: args.notify_thread_id ?? null,
        nextRunAt: next ? next.toISOString() : null,
      });
      logger.info(
        { event: 'cron_created', cronId: created.id, name: created.name },
        'cron created via tool',
      );
      return jsonText({ cron: serializeCron(created) });
    },
  );

  const cronList = tool(
    'cron_list',
    'List crons. Optional filters: enabled (true/false), source ("static" or "chat").',
    {
      enabled: z.boolean().optional(),
      source: z.enum(['static', 'chat']).optional(),
    },
    async (args) => {
      const filter: { enabled?: boolean; source?: CronSource } = {};
      if (args.enabled !== undefined) filter.enabled = args.enabled;
      if (args.source !== undefined) filter.source = args.source;
      const list = deps.crons.list(filter);
      return jsonText({ crons: list.map(serializeCron) });
    },
  );

  const cronGet = tool(
    'cron_get',
    'Fetch a cron by id, including its 20 most recent runs.',
    { id: z.string().min(1) },
    async (args) => {
      const cron = deps.crons.get(args.id);
      if (!cron) return errorText(`cron ${args.id} not found`);
      const runs = deps.cronRuns.recent(cron.id, 20);
      return jsonText({ cron: serializeCron(cron), runs: runs.map(serializeRun) });
    },
  );

  const cronPause = tool(
    'cron_pause',
    'Disable a cron without deleting it. Use when the user wants to temporarily stop firings.',
    { id: z.string().min(1) },
    async (args) => {
      const cron = deps.crons.get(args.id);
      if (!cron) return errorText(`cron ${args.id} not found`);
      const updated = deps.crons.update(args.id, { enabled: false });
      return jsonText({ cron: serializeCron(updated) });
    },
  );

  const cronResume = tool(
    'cron_resume',
    'Re-enable a paused cron. Recomputes next_run_at from now.',
    { id: z.string().min(1) },
    async (args) => {
      const cron = deps.crons.get(args.id);
      if (!cron) return errorText(`cron ${args.id} not found`);
      const next = nextRunAfter(cron.schedule, new Date());
      const updated = deps.crons.update(args.id, {
        enabled: true,
        nextRunAt: next ? next.toISOString() : null,
      });
      return jsonText({ cron: serializeCron(updated) });
    },
  );

  const cronDelete = tool(
    'cron_delete',
    'Delete a chat-source cron permanently. Refuses static crons (those live in profile/crons.yaml).',
    { id: z.string().min(1) },
    async (args) => {
      const cron = deps.crons.get(args.id);
      if (!cron) return errorText(`cron ${args.id} not found`);
      if (cron.source === 'static') {
        return errorText(
          `cron ${args.id} is source=static — edit profile/crons.yaml and restart instead`,
        );
      }
      deps.crons.delete(args.id);
      return jsonText({ deleted: args.id });
    },
  );

  const cronRunNow = tool(
    'cron_run_now',
    'Execute a cron immediately, regardless of schedule. Updates last_run_at and recomputes next_run_at.',
    { id: z.string().min(1) },
    async (args) => {
      const cron = deps.crons.get(args.id);
      if (!cron) return errorText(`cron ${args.id} not found`);
      // Don't await — run_now can take minutes; reply to the user immediately so the tool call completes.
      void deps.runner.runOnce(cron);
      return jsonText({ started: args.id });
    },
  );

  return createSdkMcpServer({
    name: 'zeno',
    version: '0.1.0',
    tools: [cronCreate, cronList, cronGet, cronPause, cronResume, cronDelete, cronRunNow],
  });
}
