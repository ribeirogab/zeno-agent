import type { CronRepo, CronRunRepo } from '@zeno/storage';
import type { HandlerMap } from '@/commands/dispatcher';
import { buildCreateHandler } from '@/commands/handlers/create';
import { buildDeleteHandler } from '@/commands/handlers/delete';
import { buildPauseHandler } from '@/commands/handlers/pause';
import { buildRestartHandler } from '@/commands/handlers/restart';
import { buildResumeHandler } from '@/commands/handlers/resume';
import { buildRunNowHandler, type RunnerLike } from '@/commands/handlers/run-now';

export interface HandlerDeps {
  crons: CronRepo;
  cronRuns: CronRunRepo;
  runner: RunnerLike;
  exit: (code: number) => void;
}

export function buildHandlerMap(deps: HandlerDeps): HandlerMap {
  return {
    cron_create: buildCreateHandler(deps.crons),
    cron_pause: buildPauseHandler(deps.crons),
    cron_resume: buildResumeHandler(deps.crons),
    cron_run_now: buildRunNowHandler(deps.crons, deps.runner),
    cron_delete: buildDeleteHandler(deps.crons),
    worker_restart: buildRestartHandler(deps.exit),
  };
}
