// Coordinator: a human-type participant with no model. Sends run.started with the shard plan, then watches progress and
// ends the run when every pair is settled and every loop is idle, or when model calls stop (budget, daily quota) or the
// run times out. It never calls another participant.
import { createHuman, type Human } from '@mozaik-ai/core';
import { shardPlan } from '../profiler/index.ts';
import { emit, type AgentRunner, type Ctx } from '../shared.ts';

export interface Coordinator {
  participant: Human;
  start(): void;
  /** Resolves with why the run ended. */
  done: Promise<string>;
}

export function createCoordinator(ctx: Ctx, agents: () => AgentRunner[]): Coordinator {
  const { state, config } = ctx;
  const participant = createHuman({ name: 'CO', capabilities: ['coordinate'], handlers: [] });
  ctx.rt.join(participant);
  let finish!: (reason: string) => void;
  const done = new Promise<string>((resolve) => { finish = resolve; });
  let ended = false;
  let poll: NodeJS.Timeout;
  let deadline: NodeJS.Timeout;

  function end(reason: string) {
    if (ended) return;
    ended = true;
    clearInterval(poll);
    clearTimeout(deadline);
    const written = state.shortlist.filter((p) => p.status === 'written').length;
    const abandoned = state.shortlist.filter((p) => p.status === 'abandoned').length;
    emit(ctx, participant, 'run.completed', { summary: `${reason}: ${written} written, ${abandoned} abandoned`, reason, written, abandoned });
    finish(reason);
  }

  function settled(): boolean {
    const p = state.progress;
    if (p.profilesReady.size < config.profilers || p.matchmakerRuns === 0 || p.shortlisting) return false;
    if (state.shortlist.some((x) => x.status === 'shortlisted' || x.status === 'writing')) return false;
    // An abandoned pair the Matchmaker has not answered yet keeps the run open.
    if (agents().some((a) => a.busy)) return false;
    return true;
  }

  return {
    participant,
    done,
    start() {
      const ids = [...state.index.researchers.keys()];
      const shards = shardPlan(ids, config.profilers);
      emit(ctx, participant, 'run.started', {
        summary: `run started: ${ids.length} researchers in ${shards.length} shards, ${state.index.challenges.size} challenges`,
        shards, researchers: ids.length, challenges: state.index.challenges.size, models: config.models, demo: ctx.demo,
      });
      poll = setInterval(() => {
        if (ctx.llm.stopReason && !agents().some((a) => a.busy)) end(`model calls stopped (${ctx.llm.stopReason})`);
        else if (settled()) end('run complete');
      }, 1000);
      deadline = setTimeout(() => end(`run timed out after ${Math.round(config.runTimeoutMs / 60_000)} minutes`), config.runTimeoutMs);
    },
  };
}
