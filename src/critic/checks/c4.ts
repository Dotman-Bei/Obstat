// C4 Namesake: another researcher has the same name, and the cited evidence belongs to them.
import { carriers } from '../../data/index.ts';
import { fail, pass, workIds, type ClaimCheck } from './context.ts';

export const c4: ClaimCheck = (claim, { ix, hints }) => {
  const rid = claim.researcherId!;
  const namesakes = hints.get(rid)?.namesakes ?? [];
  if (!namesakes.length) return pass('C4', claim.n);
  const faculty = (id: string) => ix.researchers.get(id)?.faculty ?? '';
  for (const id of workIds(claim.ids)) {
    const credited = carriers(ix, id);
    if (credited.includes(rid)) continue;
    const other = namesakes.find((o) => credited.includes(o));
    if (other) {
      const name = ix.researchers.get(other)?.name ?? other;
      return fail('C4', claim.n, `${id} belongs to ${other} ${name} (${faculty(other)}), a different person with the same name as ${rid} (${faculty(rid)}).`, { record: id, mark: other });
    }
  }
  return pass('C4', claim.n, { detail: `${rid} shares a name with ${namesakes.join(', ')}; the cited records are ${rid}'s own.` });
};
