// The Critic (PRD §9): runs the check catalogue on a held write_proposal and returns one verdict. Checks are plain code;
// only C10 calls a model, and only for claims that passed everything else.
import { SemanticEvent } from '@mozaik-ai/core';
import type { CheckResult, Claim, ClaimFailure, ReviewRequest, Verdict } from '../contract.ts';
import { getRecord } from '../data/index.ts';
import type { ObstatState } from '../state.ts';
import { on } from '../situations.ts';
import { c1, c1Proposal } from './checks/c1.ts';
import { c10, type SupportJudge } from './checks/c10.ts';
import { c2 } from './checks/c2.ts';
import { c3, c3Proposal } from './checks/c3.ts';
import { c4 } from './checks/c4.ts';
import { c5 } from './checks/c5.ts';
import { c6 } from './checks/c6.ts';
import { c7, c7Proposal } from './checks/c7.ts';
import { c8 } from './checks/c8.ts';
import { c9, c9Proposal } from './checks/c9.ts';
import type { CheckContext } from './checks/context.ts';

export interface CriticDeps extends Omit<CheckContext, 'proposal' | 'today'> {
  today: () => Date;
  support?: SupportJudge;
}

const ATTRIBUTION = new Set(['authored', 'patent', 'project']);

/** The record-dependent checks for one claim, in catalogue order. C6 runs later, next to the commitment it guards. */
function claimChecks(claim: Claim, ctx: CheckContext): CheckResult[] {
  const results = [c1(claim, ctx)];
  if (results[0].pass) {
    if (ATTRIBUTION.has(claim.kind)) results.push(c2(claim, ctx));
    if (claim.researcherId) results.push(c3(claim, ctx), c4(claim, ctx));
    if (claim.kind === 'available_for') results.push(c5(claim, ctx));
    if (claim.kind === 'challenge') results.push(c7(claim, ctx));
  }
  results.push(c9(claim, ctx));
  return results;
}

export async function review(req: ReviewRequest, deps: CriticDeps): Promise<Verdict> {
  const ctx: CheckContext = { ...deps, proposal: req.proposal, today: deps.today() };
  const { claims } = req.proposal;
  const checks: CheckResult[] = [c1Proposal(ctx), c3Proposal(ctx), c7Proposal(ctx), c8(ctx), c9Proposal(ctx)];
  for (const claim of claims) checks.push(...claimChecks(claim, ctx));

  if (deps.support) {
    const failed = new Set(checks.filter((c) => !c.pass).map((c) => c.target));
    const items = claims.filter((c) => !failed.has(c.n)).map((claim) => ({ claim, records: claim.ids.map((id) => getRecord(deps.ix, id)).filter((r) => r !== undefined) }));
    checks.push(...(await c10(items, deps.support)));
  }

  // From here to the commitment there is no await, so two reviews of one researcher cannot both pass C6.
  for (const claim of claims) if (claim.kind === 'available_for' && checks.find((c) => c.target === claim.n && c.check === 'C1')?.pass) checks.push(c6(claim, ctx));
  checks.sort((a, b) => order(a.target) - order(b.target) || Number(a.check.slice(1)) - Number(b.check.slice(1)));

  const failures: ClaimFailure[] = checks.filter((c) => !c.pass).map((c) => ({ n: c.target, check: c.check, pass: false, detail: c.detail ?? '' }));
  const verdict: Verdict = { reviewId: req.reviewId, writerId: req.writerId, pairId: req.pairId, round: req.round, pass: failures.length === 0, claims: failures, checks };
  if (verdict.pass) commit(req, deps);
  return verdict;
}

const order = (target: number | 'proposal') => (target === 'proposal' ? 0 : target);

function commit(req: ReviewRequest, { hints, commitments }: CriticDeps) {
  for (const rid of req.proposal.researcherIds) {
    const canon = hints.get(rid)?.canonicalId ?? rid;
    const list = commitments.get(canon) ?? [];
    if (!list.includes(req.pairId)) commitments.set(canon, [...list, req.pairId]);
  }
}

/**
 * The Critic's situation handler: on claim.review.requested it reviews, writes the verdict to state, then announces it.
 * A review that throws still answers, as a failure, so the writer is not left waiting for the timeout.
 */
export function criticHandler(opts: { criticId: string; state: ObstatState; sendEvent: (e: SemanticEvent, senderId: string) => void; support?: SupportJudge; today?: () => Date }) {
  const { criticId, state, sendEvent } = opts;
  const deps: CriticDeps = {
    ix: state.index,
    hints: state.identities,
    challengeClass: state.challengeClass,
    commitments: state.commitments,
    support: opts.support,
    today: opts.today ?? (() => new Date()),
  };
  const say = (type: string, payload: Record<string, unknown>) => sendEvent(SemanticEvent.create(type, criticId, payload), criticId);
  return on<ReviewRequest>('claim.review.requested', async (event) => {
    const req = event.payload;
    // Each review is one Critic loop on the timeline, named by its review ID.
    const loopId = `critic-${req.reviewId}`;
    say('loop.started', { loopId, reviewId: req.reviewId, summary: `reviewing ${req.reviewId} (${req.pairId} round ${req.round})` });
    const support: SupportJudge | undefined = deps.support && (async (items) => {
      say('inference.started', { loopId, model: 'support check', summary: `support check on ${items.length} claims` });
      try {
        return await deps.support!(items);
      } finally {
        say('inference.completed', { loopId, items: [], summary: 'support check returned' });
      }
    });
    let verdict: Verdict;
    try {
      verdict = await review(req, { ...deps, support });
    } catch (e) {
      const detail = `The Critic could not finish this review (${(e as Error).message}).`;
      verdict = { reviewId: req.reviewId, writerId: req.writerId, pairId: req.pairId, round: req.round, pass: false, claims: [{ n: 'proposal', check: 'C8', pass: false, detail }], checks: [{ check: 'C8', target: 'proposal', pass: false, detail }] };
    }
    state.reviews.record(verdict);
    say('claim.review.completed', { ...verdict, loopId });
    say('loop.finished', { loopId, summary: verdict.pass ? 'review passed' : 'review failed' });
  });
}
