// Industry Analyst: wakes on run.started and classifies every challenge as research, not_research or no_uns_fit, with
// a reason, in batches. Each batch is one loop with one model turn answering in JSON, so each call starts from a fresh
// context. Every challenge comes with its closest researchers from code retrieval, so "no fit at the university" is
// judged on evidence. Emits challenges.ready per batch.
import { candidatesFor } from '../../data/search.ts';
import { FAILED, PRIORITY } from '../../llm.ts';
import type { ChallengeClassName } from '../../state.ts';
import { AgentRunner, emit, handle, type Ctx } from '../shared.ts';

const INSTRUCTION = `You are the Industry Analyst in Obstat, which proposes collaborations between University of Novi Sad researchers and companies around NTP Novi Sad.
For each company challenge you are given, choose one class:
- research: an open technical or scientific question that university research could answer, and the closest researchers' fields plausibly cover it.
- not_research: hiring, funding or grant applications, sales, marketing, legal, tax or administrative work, or buying a ready-made product. There is no open technical question in it.
- no_uns_fit: a real research question, but none of the closest researchers works in its field (low match scores, unrelated fields).
A challenge with a technical question whose answer is uncertain (a material property to reach, a measurement, a detection or prediction task, automating an expert's judgement, an algorithm that must meet a limit) is research, even when the company frames it as a purchase, a supplier problem or a hire.
Give each challenge one plain reason of at most 20 words. Answer with every challenge in the batch.`;

const CLASSES: ChallengeClassName[] = ['research', 'not_research', 'no_uns_fit'];

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, cls: { type: 'string', enum: CLASSES }, reason: { type: 'string' } }, required: ['id', 'cls', 'reason'] },
    },
  },
  required: ['items'],
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The JSON a structured answer carries, tolerating a code fence around it. */
export function parseJson<T>(answer: string): T | null {
  if (answer.startsWith(FAILED)) return null;
  try {
    return JSON.parse(answer.replace(/^\s*```(json)?\s*|\s*```\s*$/g, '')) as T;
  } catch {
    return null;
  }
}

export function createAnalyst(ctx: Ctx): AgentRunner {
  const { state, config } = ctx;

  function describe(id: string): string {
    const ch = state.index.challenges.get(id)!;
    const company = state.index.companies.get(ch.companyId)!;
    const near = candidatesFor(ctx.search, state.identities, ch, 3).map((c) => {
      const r = state.index.researchers.get(c.researcherId)!;
      return `${r.id} ${r.fields.slice(0, 2).join('; ')} (${c.score.toFixed(2)})`;
    });
    return `${id} | ${company.name}, ${company.sector} | ${ch.text} | ${clip(ch.detail, 240)} | closest: ${near.join(' / ') || 'none'}`;
  }

  return new AgentRunner(ctx, {
    name: 'AN',
    instruction: INSTRUCTION,
    model: config.models.small,
    priority: PRIORITY.other,
    handlers: (self) => [handle(ctx, 'run.started', async () => {
      const all = [...state.index.challenges.keys()];
      const batches = Array.from({ length: Math.ceil(all.length / config.analystBatch) }, (_, i) => all.slice(i * config.analystBatch, (i + 1) * config.analystBatch));
      state.progress.batchesTotal = batches.length;
      for (const [i, ids] of batches.entries()) {
        const answer = await self.run(
          `Batch ${i + 1} of ${batches.length}: classify these ${ids.length} challenges. Match scores run from 0 to about 0.3; below 0.06 is a weak match.\n${ids.map(describe).join('\n')}`,
          { label: `classifying batch ${i + 1} of ${batches.length}`, structuredOutput: { name: 'classes', schema: SCHEMA } },
        );
        const inBatch = new Set(ids);
        for (const item of parseJson<{ items: { id: string; cls: ChallengeClassName; reason: string }[] }>(answer)?.items ?? []) {
          if (inBatch.has(item.id) && CLASSES.includes(item.cls)) state.challengeClass.set(item.id, { cls: item.cls, reason: String(item.reason ?? '').trim(), ids: [item.id] });
        }
        const done = ids.filter((id) => state.challengeClass.has(id));
        const count = (cls: ChallengeClassName) => done.filter((id) => state.challengeClass.get(id)!.cls === cls).length;
        state.progress.batchesDone += 1;
        emit(ctx, self.agent, 'challenges.ready', {
          summary: `batch ${i + 1} of ${batches.length}: ${count('research')} research, ${count('not_research')} not research, ${count('no_uns_fit')} no fit${done.length < ids.length ? `, ${ids.length - done.length} unclassified` : ''}`,
          batch: i + 1, batches: batches.length, ids: done, research: count('research'), notResearch: count('not_research'), noFit: count('no_uns_fit'), unclassified: ids.length - done.length,
          ...(done.length < ids.length ? { note: clip(answer, 200) } : {}),
        });
      }
    })],
  });
}
