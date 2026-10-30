// Builds and runs one Obstat pass: the index, shared state, the model runner and every participant, joined in order.
// The Trace Observer joins first, so it records each event before anyone reacts to it.
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { FunctionCallOutputItem, createAgent, defineRuntime } from '@mozaik-ai/core';
import { loadConfig, type Config } from './config.ts';
import { criticHandler } from './critic/critic.ts';
import { supportJudge } from './critic/support.ts';
import { buildIdentities } from './data/identities.ts';
import { loadIndex } from './data/index.ts';
import { buildSearch } from './data/search.ts';
import { GuardedRunner } from './llm.ts';
import { createAnalyst } from './participants/analyst/index.ts';
import { createCoordinator } from './participants/coordinator/index.ts';
import { createMatchmaker } from './participants/matchmaker/index.ts';
import { createObserver } from './participants/observer/index.ts';
import { createProfiler } from './participants/profiler/index.ts';
import type { AgentRunner, Ctx } from './participants/shared.ts';
import { createWriter } from './participants/writer/index.ts';
import { models, type Model } from './providers.ts';
import { writeReports, type RunStats } from './report.ts';
import { ObstatState } from './state.ts';

export const MOZAIK_VERSION = '4.1.0';

/** T1: the interception pieces exist in the installed Mozaik, or the run stops with a clear message. */
export function assertMozaik(): void {
  const require = createRequire(import.meta.url);
  const version = JSON.parse(readFileSync(require.resolve('@mozaik-ai/core/package.json'), 'utf8')).version;
  const problems = [
    version !== MOZAIK_VERSION && `@mozaik-ai/core is ${version}; Obstat is pinned to ${MOZAIK_VERSION}, the version whose InterceptionHandler it was verified against`,
    typeof FunctionCallOutputItem?.create !== 'function' && 'FunctionCallOutputItem.create is missing',
    defineRuntime().runLoop.length !== 4 && 'runLoop does not take an interception handler as its 4th argument',
  ].filter(Boolean);
  if (problems.length) throw new Error(`Mozaik check failed: ${problems.join('; ')}. Run npm install to restore the pinned version.`);
}

export interface RunOptions {
  root?: string;
  demo: boolean;
  print?: boolean;
  config?: Partial<Config>;
  /** Replaces the provider models (tests). */
  models?: Model[];
  log?: (line: string) => void;
}

export interface RunResult { reason: string; state: ObstatState; stats: RunStats }

export async function runObstat(opts: RunOptions): Promise<RunResult> {
  assertMozaik();
  const config = { ...loadConfig(opts.root), ...opts.config };
  const log = opts.log ?? ((line: string) => console.error(`[obstat] ${line}`));
  mkdirSync(config.outDir, { recursive: true });
  rmSync(join(config.outDir, 'proposals'), { recursive: true, force: true });
  const recording = join(config.outDir, 'recording.jsonl');
  writeFileSync(recording, '');

  const startedAt = new Date();
  const ix = loadIndex(config.dataDir);
  const state = new ObstatState(ix, buildIdentities(ix));
  const rt = defineRuntime<ObstatState>();
  const llm = new GuardedRunner(opts.models ?? models(), {
    callsPerMinute: config.callsPerMinute, maxConcurrent: config.maxConcurrentCalls, maxRetries: config.maxRetries,
    tokenBudget: config.tokenBudget, recordTo: recording, log,
  });
  rt.initializeRuntime({ state, inferenceRunnerConfig: { runner: llm } });
  const ctx: Ctx = { config, state, rt, llm, search: buildSearch(ix), demo: opts.demo, today: startedAt, log };

  const observer = createObserver(ctx, join(config.outDir, 'trace.jsonl'), { print: opts.print });
  const agents: AgentRunner[] = [];
  const coordinator = createCoordinator(ctx, () => agents);

  const critic = createAgent({ name: 'CR', capabilities: ['review'], instruction: 'Critic: checks every claim of a held write_proposal against the dataset.', tools: [], handlers: [] });
  critic.setHandlers([criticHandler({ criticId: critic.getId(), state, sendEvent: rt.sendEvent, support: supportJudge(llm, config.models.small), today: () => startedAt })]);
  rt.join(critic);

  for (let i = 1; i <= config.profilers; i++) agents.push(createProfiler(ctx, `P${i}`));
  agents.push(createAnalyst(ctx), createMatchmaker(ctx));
  for (let i = 1; i <= config.writers; i++) agents.push(createWriter(ctx, `W${i}`));

  coordinator.start();
  const reason = await coordinator.done;
  observer.stop();
  const stats: RunStats = {
    startedAt, endedAt: new Date(), calls: llm.usage.calls, failedCalls: llm.usage.failed, retries: llm.usage.retries,
    tokens: llm.usage.tokens, stopReason: llm.stopReason, maxConcurrentLoops: observer.peak(), demo: opts.demo,
  };
  writeReports(state, config.outDir, stats);
  return { reason, state, stats };
}
