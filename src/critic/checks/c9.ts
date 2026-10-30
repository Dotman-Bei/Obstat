// C9 No ranking of people: no comparative worth language about people, in any claim or section.
import { sectionText } from './c8.ts';
import { fail, pass, type ClaimCheck, type ProposalCheck } from './context.ts';
import type { CheckResult } from '../../contract.ts';

const PEOPLE = '(researchers?|scientists?|experts?|professors?|candidates?|scholars?|academics?|minds?|people|persons?|specialists?|investigators?)';
const RANKING: RegExp[] = [
  new RegExp(`\\b(best|top|leading|foremost|greatest|finest|brightest|strongest|most (talented|qualified|accomplished|prominent|renowned|productive|cited|respected|capable|gifted))\\s+(\\w+\\s+){0,2}${PEOPLE}\\b`, 'i'),
  /\b(top|highest|best)[- ]ranked\b|\branked (first|1st|#1|highest)\b/i,
  /\b(world|star|elite)[- ]class (researcher|scientist|expert)s?\b|\bstar (researcher|scientist)s?\b/i,
  /\bh-index\b|\bcitation counts?\b|\b(scored?|rated|rating) (of )?\d/i,
  /\b(better|stronger|more qualified) than (any |all )?(the )?other\b|\boutperforms? (other|all)\b/i,
];

export function rankingIn(text: string): string | null {
  for (const re of RANKING) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

function check(text: string, target: number | 'proposal'): CheckResult {
  const phrase = rankingIn(text);
  return phrase ? fail('C9', target, `"${phrase}" compares people's worth. Describe the work and the fit instead.`) : pass('C9', target);
}

export const c9: ClaimCheck = (claim) => check(claim.text, claim.n);
export const c9Proposal: ProposalCheck = ({ proposal }) => check(sectionText(proposal.sections), 'proposal');
