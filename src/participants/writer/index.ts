// Proposal Writer xN: takes one shortlisted pair at a time and writes its proposal from the pair's dossier by calling
// write_proposal, its only tool, which the gate holds until the Critic passes it. On a failed round it revises; when
// its loop ends without a written proposal, the pair is abandoned with the reason. Then it takes the next free pair.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contractFields, writeProposalSchema, type Verdict, type WriteProposalInput } from '../../contract.ts';
import { ObstatGate, WRITE_PROPOSAL, WriterInterception, verdictHandler } from '../../gate/obstat-gate.ts';
import { FAILED, PRIORITY } from '../../llm.ts';
import type { Pair } from '../../state.ts';
import { AgentRunner, emit, handle, tool, type Ctx } from '../shared.ts';
import { dossier } from './dossier.ts';
import { renderProposal } from './render.ts';

const instruction = (name: string, today: string) => `You are Proposal Writer ${name} in Obstat. You write one collaboration proposal between a University of Novi Sad researcher and a company around NTP Novi Sad, by calling write_proposal with the whole proposal. A separate Critic checks every claim against the dataset before anything is written. If it fails claims, you get its reasons back: fix exactly what it names and call write_proposal again with the whole proposal.

Rules:
- Use only facts from the dossier. Never invent IDs, numbers, names, methods or results.
- Every factual sentence in the sections ends with a marker such as {3}, pointing at claim 3. Each claim has n, kind, text, researcherId and ids.
- A claim's text is one sentence of at most 40 words stating one fact in your own words. Never paste a whole paragraph from the dossier into a claim.
- Claim kinds: authored (ids: the SYN-PUB publication), project (ids: the SYN-PRJ project), patent (ids: the SYN-PAT patent), available_for (the researcher's availability for the proposed role; its text must quote, inside double quotes, exact words from the researcher's open_to or notes; ids: [the researcher ID]), challenge (what the company states; ids: [the challenge ID]), company_fact (ids: [the company ID]), other.
- researcherId is the ID of the person the claim is about, or null for challenge and company claims.
- Never compare or rank people: no "best", "top", "leading expert", scores or rankings. Describe the work and the fit.
- Sections: title; problem, using the company's own numbers; researchQuestions, two to four; plan, one row per line written "period | work | output", with rows Year 1, Year 2 and Year 3 for an industrial_phd and at least two rows otherwise; eachSideBrings.company and eachSideBrings.faculty; whyThisPair; agreedUpFront (data access, intellectual property, publication).
- format: industrial_phd, joint_project or contract_research. Follow the suggested format unless the researcher's open_to rules it out.
- Today is ${today}. Do not rely on dates that have passed.
- If the Critic says a record belongs to another researcher ID, or that an ID is a second record of another, use exactly the ID it names, in the claims and in researcherIds.
- Call write_proposal straight away; the dossier holds everything you need. If you cannot write an honest proposal, reply with one line saying why, without calling write_proposal.`;

export function createWriter(ctx: Ctx, name: string): AgentRunner {
  const { state, config } = ctx;
  const ix = state.index;
  let runner: AgentRunner;

  const write = tool({
    name: WRITE_PROPOSAL,
    description: 'Writes the proposal to out/proposals/<pairId>.md. The Critic checks every claim first; the call returns its failures if any claim fails.',
    parameters: writeProposalSchema,
    invoke: (args: WriteProposalInput) => {
      // The gate already held this call; the file is still written only for the exact proposal the Critic passed (F4).
      const passed = [...state.reviews.byCall.values()].find((h) => h.pairId === args.pairId && state.reviews.byId.get(h.reviewId)?.verdict?.pass && sameJson(h.args, args));
      const verdict: Verdict | undefined = passed && state.reviews.byId.get(passed.reviewId)!.verdict;
      if (!verdict) return { error: 'This proposal has no passing Critic verdict, so it was not written.' };
      const at = new Date();
      const dir = join(config.outDir, 'proposals');
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `${args.pairId}.md`);
      const proposal = contractFields(args);
      writeFileSync(path, renderProposal(ix, proposal, verdict, at));
      writeFileSync(join(dir, `${args.pairId}.json`), `${JSON.stringify({ ...proposal, writerId: name, verdict, writtenAt: at.toISOString() }, null, 2)}\n`);
      const pair = state.shortlist.find((p) => p.pairId === args.pairId);
      if (pair) {
        pair.status = 'written';
        // The pair now names whom the passed proposal names (a second record is replaced by its canonical one).
        pair.researcherIds = proposal.researcherIds;
      }
      emit(ctx, runner.agent, 'proposal.written', { summary: `proposals/${args.pairId}.md written`, pairId: args.pairId, path: `out/proposals/${args.pairId}.md`, reviewId: verdict.reviewId });
      return { written: `out/proposals/${args.pairId}.md` };
    },
  });

  function abandon(pair: Pair, reasons: string[]) {
    if (pair.status !== 'writing') return;
    pair.status = 'abandoned';
    pair.reason = reasons.join(' ');
    emit(ctx, runner.agent, 'pair.abandoned', { summary: `${pair.pairId} abandoned: ${pair.reason.slice(0, 140)}`, pairId: pair.pairId, writerId: name, reasons });
  }

  async function next() {
    if (runner.busy || state.assignments.has(name) || ctx.llm.stopReason) return;
    const pair = state.shortlist.find((p) => p.status === 'shortlisted');
    if (!pair) return;
    pair.status = 'writing';
    pair.writerId = name;
    state.assignments.set(name, pair.pairId);
    const gate = new WriterInterception(new ObstatGate({ writerId: runner.id, writerName: name, reviews: state.reviews, sendEvent: ctx.rt.sendEvent, timeoutMs: config.criticTimeoutMs, revisionCap: config.revisionCap }));
    const answer = await runner.run(`Write the proposal for this pair. Use pairId "${pair.pairId}", researcherIds ${JSON.stringify(pair.researcherIds)}, companyId "${pair.companyId}", challengeId "${pair.challengeId}".\n\n${dossier(ix, pair)}`, {
      label: `writing ${pair.pairId}`,
      data: { pairId: pair.pairId },
      gate,
    });
    if (pair.status === 'writing') abandon(pair, [answer.startsWith(FAILED) ? answer : `The writer stopped without a passing proposal: ${answer.slice(0, 300)}`]);
    state.assignments.delete(name);
    await next();
  }

  runner = new AgentRunner(ctx, {
    name,
    instruction: instruction(name, ctx.today.toISOString().slice(0, 10)),
    tools: [write],
    model: config.models.strong,
    priority: PRIORITY.writer,
    handlers: () => [
      verdictHandler(state.reviews),
      handle(ctx, 'pair.shortlisted', () => next()),
      handle<{ pairId: string; writerId: string; reasons: string[] }>(ctx, 'pair.abandoned', (e) => {
        // The gate abandons from inside this writer's loop; record it on the pair as soon as it happens.
        const pair = state.shortlist.find((p) => p.pairId === e.payload.pairId);
        if (pair && e.payload.writerId === name && pair.status === 'writing') {
          pair.status = 'abandoned';
          pair.reason = e.payload.reasons.join(' ');
        }
      }),
    ],
  });
  return runner;
}

function sameJson(raw: string, value: unknown): boolean {
  try {
    return JSON.stringify(JSON.parse(raw)) === JSON.stringify(value);
  } catch {
    return false;
  }
}
