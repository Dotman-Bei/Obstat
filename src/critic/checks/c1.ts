// C1 ID exists: every cited ID is in the dataset, and the proposal's own IDs fit together.
import { getRecord } from '../../data/index.ts';
import { fail, pass, type ClaimCheck, type ProposalCheck } from './context.ts';

export const c1: ClaimCheck = (claim, { ix }) => {
  const cited = claim.researcherId ? [claim.researcherId, ...claim.ids] : claim.ids;
  const missing = [...new Set(cited.filter((id) => !getRecord(ix, id)))];
  if (missing.length) return fail('C1', claim.n, `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not in the dataset.`, { record: missing[0] });
  if (!claim.ids.length) return fail('C1', claim.n, 'The claim cites no dataset ID.');
  return pass('C1', claim.n);
};

export const c1Proposal: ProposalCheck = ({ ix, proposal }) => {
  const missing = [...proposal.researcherIds, proposal.companyId, proposal.challengeId].filter((id) => !getRecord(ix, id));
  if (missing.length) return fail('C1', 'proposal', `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not in the dataset.`, { record: missing[0] });
  const owner = ix.challenges.get(proposal.challengeId)!.companyId;
  if (owner !== proposal.companyId) return fail('C1', 'proposal', `${proposal.challengeId} belongs to ${owner}, not ${proposal.companyId}.`, { record: proposal.challengeId, mark: owner });
  return pass('C1', 'proposal');
};
