// C6 Capacity: commitments the gate has already passed must not exceed what the researcher's note allows.
// Each note is read once per researcher and cached.
import type { IdentityHint } from '../../data/identities.ts';
import { fail, pass, type ClaimCheck } from './context.ts';

export interface CapacityLimit { n: number; quote: string }

const LIMITS: [RegExp, number][] = [
  [/\bno (new )?capacity\b|\bnot (taking on|accepting) (any )?new\b|\bfully (booked|committed)\b/i, 0],
  [/\b(one|a single|1)\s+(new|additional|more)\b/i, 1],
  [/\b(two|2)\s+(new|additional|more)\b/i, 2],
  [/\b(three|3)\s+(new|additional|more)\b/i, 3],
];

export function parseCapacity(text: string): CapacityLimit | null {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    for (const [re, n] of LIMITS) if (re.test(sentence)) return { n, quote: sentence.trim() };
  }
  return null;
}

const cache = new WeakMap<Map<string, IdentityHint>, Map<string, CapacityLimit | null>>();

function limitFor(hints: Map<string, IdentityHint>, id: string): CapacityLimit | null {
  let byId = cache.get(hints);
  if (!byId) cache.set(hints, (byId = new Map()));
  if (!byId.has(id)) byId.set(id, parseCapacity(hints.get(id)?.capacityText ?? ''));
  return byId.get(id)!;
}

export const c6: ClaimCheck = (claim, { hints, commitments, proposal }) => {
  const rid = claim.researcherId;
  if (!rid) return fail('C6', claim.n, 'The claim names no researcher whose capacity could be checked.');
  const canon = hints.get(rid)?.canonicalId ?? rid;
  const limit = limitFor(hints, canon) ?? limitFor(hints, rid);
  const others = (commitments.get(canon) ?? []).filter((p) => p !== proposal.pairId);
  if (!limit) return pass('C6', claim.n, { detail: `${canon}'s notes set no number of new commitments; ${others.length} passed so far.` });
  const allows = limit.n === 0 ? 'no new commitments' : `${limit.n} new ${limit.n === 1 ? 'commitment' : 'commitments'}`;
  if (others.length >= limit.n) {
    return fail('C6', claim.n, `${canon}'s notes allow ${allows} ("${limit.quote}"), and the gate has already passed ${others.join(', ')} with them.`, { record: canon, mark: limit.quote });
  }
  return pass('C6', claim.n, { detail: `${canon}'s notes allow ${allows}; ${others.length} passed so far.`, record: canon, mark: limit.quote });
};
