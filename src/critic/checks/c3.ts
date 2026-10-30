// C3 Duplicate profile: the claim names a second record of a person; the verdict says which ID is canonical.
import { carriers } from '../../data/index.ts';
import { pass, fail, workIds, type ClaimCheck, type ProposalCheck } from './context.ts';

/** The proposal's own researcherIds must name each person by their canonical record, or the file names the wrong one. */
export const c3Proposal: ProposalCheck = ({ hints, proposal }) => {
  const second = proposal.researcherIds.filter((id) => (hints.get(id)?.canonicalId ?? id) !== id);
  if (!second.length) return pass('C3', 'proposal');
  const fix = second.map((id) => `${id} is a second record of ${hints.get(id)!.canonicalId}`).join('; ');
  return fail('C3', 'proposal', `researcherIds lists a second record: ${fix}. List the canonical ID.`, { record: second[0], mark: hints.get(second[0])!.canonicalId });
};

export const c3: ClaimCheck = (claim, { ix, hints }) => {
  const rid = claim.researcherId!;
  const hint = hints.get(rid);
  if (!hint?.sameAs.length) return pass('C3', claim.n);
  const canon = hint.canonicalId;
  if (canon === rid) return pass('C3', claim.n, { detail: `${rid} is the canonical record; ${hint.sameAs.join(', ')} is a second record of the same person.` });
  if (claim.ids.includes(canon)) return pass('C3', claim.n, { detail: `The claim states both ${rid} and ${canon}.` });

  // The name form and the faculty make the short reason; the record evidence is in the identity hints.
  const why = hint.sameAsSignals.filter((s) => !/ lists | imported /.test(s)).map((s) => s.replace(/, named in Serbian on one record$/, '')).join(', ');
  const credited = workIds(claim.ids).find((id) => carriers(ix, id).includes(canon));
  const lead = credited ? `${credited} is attributed to ${canon}. ` : '';
  return fail('C3', claim.n, `${lead}${rid} and ${canon} look like one person (${why}). Cite ${canon} or state both IDs.`, { record: credited ?? canon, mark: canon });
};
