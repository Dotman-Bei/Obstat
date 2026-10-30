// C2 Attribution: each cited work's author, participant or inventor entries carry the named researcher_id.
// A work credited to a second record of the same person passes only when the claim states that ID too.
import { carriers } from '../../data/index.ts';
import { entriesOf, fail, pass, workIds, type ClaimCheck } from './context.ts';

export const c2: ClaimCheck = (claim, { ix, hints }) => {
  const rid = claim.researcherId;
  if (!rid) return fail('C2', claim.n, 'The claim names no researcher_id, so its attribution cannot be checked.');
  const works = workIds(claim.ids);
  if (!works.length) return fail('C2', claim.n, `The claim cites no publication, project or patent that could credit ${rid}.`);
  const stated = new Set(claim.ids);
  for (const id of works) {
    const credited = carriers(ix, id);
    if (credited.includes(rid)) continue;
    if (hints.get(rid)?.sameAs.some((other) => credited.includes(other) && stated.has(other))) continue;
    const by = credited.length ? credited.join(', ') : 'no researcher with a profile';
    return fail('C2', claim.n, `${id}'s ${entriesOf(id)} carry ${by}, not ${rid}.`, { record: id, mark: credited[0] ?? rid });
  }
  return pass('C2', claim.n, { detail: `${works.join(', ')} ${works.length === 1 ? 'credits' : 'credit'} ${rid}.`, record: works[0], mark: rid });
};
