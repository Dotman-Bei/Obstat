// C7 Research problem: the challenge must be one the Analyst classified as research. Runs on challenge claims and on
// the proposal's own challenge, so a proposal cannot skip it by making no challenge claim.
import { recordType } from '../../data/index.ts';
import type { CheckResult } from '../../contract.ts';
import { fail, pass, type CheckContext, type ClaimCheck, type ProposalCheck } from './context.ts';

function classify(id: string, target: number | 'proposal', { challengeClass }: CheckContext): CheckResult {
  const c = challengeClass.get(id);
  if (!c) return fail('C7', target, `The Analyst has not classified ${id} yet.`, { record: id });
  if (c.cls !== 'research') return fail('C7', target, `The Analyst classified ${id} as ${c.cls}: ${c.reason}`, { record: id });
  return pass('C7', target, { detail: `The Analyst classified ${id} as a research problem.`, record: id });
}

export const c7: ClaimCheck = (claim, ctx) => {
  const ids = claim.ids.filter((id) => recordType(id) === 'challenge');
  const results = (ids.length ? ids : [ctx.proposal.challengeId]).map((id) => classify(id, claim.n, ctx));
  return results.find((r) => !r.pass) ?? results[0];
};

export const c7Proposal: ProposalCheck = (ctx) => classify(ctx.proposal.challengeId, 'proposal', ctx);
