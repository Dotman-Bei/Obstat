// A stand-in model for offline end-to-end runs. It reads the prompt and the offered tools and answers the way a careful
// agent would: profiles its shard, classifies a batch, shortlists from the candidate lines, writes a proposal from the
// dossier (citing the profile's own record, as a real writer would) and revises when the Critic names the right ID.
import { FunctionCallItem, FunctionCallOutputItem, ModelMessageItem, UserMessageItem, type InferenceInput, type InferenceOutput } from '@mozaik-ai/core';
import type { Model } from '../src/providers.ts';

let seq = 0;
const call = (name: string, args: unknown): InferenceOutput => ({ items: [FunctionCallItem.rehydrate({ callId: `fake_${++seq}`, name, args: JSON.stringify(args) })], tokenUsage: undefined, rowResponse: null });
const say = (text: string): InferenceOutput => ({ items: [ModelMessageItem.rehydrate({ text })], tokenUsage: undefined, rowResponse: null });

function proposalFrom(task: string, researcherOverride?: string) {
  const pairId = task.match(/pairId "([^"]+)"/)![1];
  const researcherIds = JSON.parse(task.match(/researcherIds (\[[^\]]*\])/)![1]) as string[];
  const companyId = task.match(/companyId "([^"]+)"/)![1];
  const challengeId = task.match(/challengeId "([^"]+)"/)![1];
  const work = task.match(/^\s+- (SYN-(?:PUB|PRJ|PAT)-\d+)/m)?.[1];
  const rid = researcherOverride ?? researcherIds[0];
  if (researcherOverride) researcherIds.splice(0, 1, researcherOverride);
  const kind = work?.startsWith('SYN-PRJ') ? 'project' : work?.startsWith('SYN-PAT') ? 'patent' : 'authored';
  return {
    pairId, researcherIds, companyId, challengeId, format: 'joint_project',
    sections: {
      title: `Joint work on ${challengeId}`,
      problem: `The company states the problem in ${challengeId} and wants it solved within 12 months {2}.`,
      researchQuestions: ['Which method from the researcher\'s work transfers to the company\'s data?', 'How well does it perform on two months of company data?'],
      plan: 'Months 1-6 | Adapt the method {1} | Prototype\nMonths 7-12 | Test on company data | Report',
      eachSideBrings: { company: 'Data and engineering time.', faculty: 'The method {1}.' },
      whyThisPair: 'The researcher\'s published method addresses the stated problem {1} {2}.',
      agreedUpFront: 'Data stays with the company; results may be published after review.',
    },
    claims: [
      ...(work ? [{ n: 1, kind, text: `${rid} worked on ${work}.`, researcherId: rid, ids: [work] }] : []),
      { n: 2, kind: 'challenge', text: `The company describes the problem in ${challengeId}.`, researcherId: null, ids: [challengeId] },
    ],
  };
}

export function fakeInfer(input: InferenceInput): InferenceOutput {
  const items = input.context.getItems();
  const task = items.find((i): i is UserMessageItem => i instanceof UserMessageItem)!.content.text;
  switch (input.structuredOutput?.name) {
    case 'support': {
      const claims = JSON.parse(task) as { n: number }[];
      return say(JSON.stringify({ results: claims.map((c) => ({ n: c.n, pass: true, detail: 'The cited record supports it.' })) }));
    }
    case 'classes': {
      const ids = [...task.matchAll(/^(C\d{3}-CH\d+) \|/gm)].map((m) => m[1]);
      return say(JSON.stringify({ items: ids.map((id, i) => ({ id, cls: i % 5 === 4 ? 'not_research' : 'research', reason: 'Judged from the challenge text and the closest researchers.' })) }));
    }
    case 'shortlist': {
      const count = Number(task.match(/Shortlist exactly (\d+)/)![1]);
      const blocks = [...task.matchAll(/^(C\d{3}-CH\d+) \|[^\n]*\n\s+(R\d{4})[^:]*\([\d.]+\): (SYN-[A-Z]+-\d+)/gm)];
      return say(JSON.stringify({ pairs: blocks.slice(0, count).map((m) => ({ researcherId: m[2], challengeId: m[1], format: 'joint_project', evidence: [m[3]], why: 'Their work addresses the problem.' })) }));
    }
  }
  const last = items.at(-1)!;
  const tools = new Set((input.tools ?? []).map((t) => t.name));

  if (last instanceof FunctionCallOutputItem) {
    const out = last.output.text;
    const cite = out.match(/Cite (R\d{4})/)?.[1];
    if (tools.has('write_proposal') && cite) return call('write_proposal', proposalFrom(task, cite));
    return say('Done.');
  }
  if (tools.has('write_proposal')) return call('write_proposal', proposalFrom(task));
  // A profiler's brief
  return say('The shard holds its profiles; R0139 is a second record of R0539.');
}

export const fakeModel: Model = {
  endpoint: { endpointMapper: { toRequest: (x: unknown) => x, toResponse: (x: unknown) => x as InferenceOutput }, infer: async (input: InferenceInput) => fakeInfer(input), stream: async function* () { throw new Error('no streaming'); } },
  specification: { name: 'fake', provider: 'fake', supportsReasoningEffort: false, supportedReasoningEfforts: [], supportsStreaming: false, contextWindowSize: 1_000_000, supportedContextItemTypes: [], maxOutputTokens: 10_000, supportsFunctionCalling: true, supportsStructuredOutput: true },
} as unknown as Model;
