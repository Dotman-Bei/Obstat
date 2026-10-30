// C10 Support: a small model, given only the cited records, judges whether they support each sentence. One call judges
// every eligible claim of a review together. The model call is injected, so the Critic runs without it (and tests run
// without keys).
import type { CheckResult, Claim } from '../../contract.ts';
import type { AnyRecord, RecordType } from '../../data/index.ts';
import { fail, pass } from './context.ts';

export interface SupportItem { claim: Claim; records: { id: string; type: RecordType; record: AnyRecord }[] }

export type SupportJudge = (items: SupportItem[]) => Promise<Map<number, { pass: boolean; detail: string }>>;

export async function c10(items: SupportItem[], judge: SupportJudge): Promise<CheckResult[]> {
  if (!items.length) return [];
  try {
    const judged = await judge(items);
    return items.map(({ claim, records }) => {
      const v = judged.get(claim.n);
      if (!v) return fail('C10', claim.n, 'The support check returned no judgement for this claim.');
      return v.pass ? pass('C10', claim.n, { detail: v.detail }) : fail('C10', claim.n, v.detail, { record: records[0]?.id });
    });
  } catch (e) {
    // Fails closed: an unverified sentence does not pass.
    return items.map(({ claim }) => fail('C10', claim.n, `The support check could not run (${(e as Error).message}).`));
  }
}
