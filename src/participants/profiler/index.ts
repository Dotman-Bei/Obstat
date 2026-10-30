// Research Profiler xN: wakes on run.started for its own shard. Most of the work is code (PRD §7): the shard's
// identity hints (second records, namesakes, stale status, notes about someone else, capacity text) come from the data
// layer and are handed to the model, which writes the shard brief in one turn. Emits profiles.ready.
import { notesAboutOther } from '../../critic/checks/c5.ts';
import { PRIORITY } from '../../llm.ts';
import type { ObstatState } from '../../state.ts';
import { AgentRunner, emit, handle, type Ctx } from '../shared.ts';

export interface Shard { profiler: string; ids: string[] }

export function shardPlan(ids: string[], n: number): Shard[] {
  const size = Math.ceil(ids.length / n);
  return Array.from({ length: n }, (_, i) => ({ profiler: `P${i + 1}`, ids: ids.slice(i * size, (i + 1) * size) }));
}

const INSTRUCTION = `You are a Research Profiler in Obstat, which proposes collaborations between University of Novi Sad researchers and companies.
You get your shard's profile, computed from the dataset. Reply in at most three sentences: how many profiles the shard holds, and the identity issues a proposal writer must not get wrong, naming researcher IDs.
Never rank or compare people.`;

/** The shard's counts and every identity issue the data layer found in it. */
export function profileShard(state: ObstatState, ids: string[]) {
  const ix = state.index;
  const rows = ids.map((id) => ({ r: ix.researchers.get(id)!, h: state.identities.get(id)! }));
  const issues = rows.flatMap(({ r, h }) => [
    ...(h.sameAs.length && h.canonicalId !== r.id ? [`${r.id} "${r.name}" is a second record of ${h.canonicalId}; cite ${h.canonicalId} (${h.sameAsSignals.join('; ')})`] : []),
    ...(h.namesakes.length ? [`${r.id} "${r.name}" (${r.faculty}) shares a name with ${h.namesakes.join(', ')}, a different person`] : []),
    ...(h.status !== 'active' ? [`${r.id} is ${h.status}: "${h.statusText.slice(0, 160)}"`] : []),
    ...(notesAboutOther(r, ix) ? [`${r.id}'s notes describe ${notesAboutOther(r, ix)}, not ${r.name}`] : []),
  ]);
  return {
    profiles: rows.length,
    withNotes: rows.filter(({ r }) => r.notes).length,
    withOpenTo: rows.filter(({ r }) => r.open_to.length).length,
    withCapacityText: rows.filter(({ h }) => h.capacityText).length,
    byStatus: Object.fromEntries(['active', 'emeritus', 'retired', 'left'].map((s) => [s, rows.filter(({ h }) => h.status === s).length])),
    issues,
  };
}

export function createProfiler(ctx: Ctx, name: string): AgentRunner {
  const { state } = ctx;
  return new AgentRunner(ctx, {
    name,
    instruction: INSTRUCTION,
    model: ctx.config.models.small,
    priority: PRIORITY.other,
    handlers: (self) => [handle<{ shards: Shard[] }>(ctx, 'run.started', async (e) => {
      const shard = e.payload.shards.find((s) => s.profiler === name);
      if (!shard) return;
      const range = `${shard.ids[0]}–${shard.ids.at(-1)}`;
      const profile = profileShard(state, shard.ids);
      const brief = await self.run(`Shard ${name}: researchers ${range}.\n${JSON.stringify(profile, null, 1)}`, { label: `profiling ${range}` });
      state.progress.profilesReady.add(name);
      emit(ctx, self.agent, 'profiles.ready', { summary: `${shard.ids.length} profiles ready (${range})`, profiler: name, researchers: shard.ids.length, issues: profile.issues.length, brief });
    })],
  });
}
