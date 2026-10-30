// C8 Sections complete: problem with numbers, research questions, a plan (a 3-year table for an industrial PhD), what
// each side brings, why this pair, agreed up front. Every {n} marker in the text must point at a claim.
import type { ProposalSections } from '../../contract.ts';
import { fail, pass, type ProposalCheck } from './context.ts';

// Digits, or number words as companies write them ("one in five", "half of our crews").
const NUMBER = /\d|\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|half|third|quarter|dozen)\b/i;

/** A claim marker: {3}, or a list of them, {1, 2}. */
export const MARKER = /\{\s*\d+(?:\s*,\s*\d+)*\s*\}/g;
const MAX_CLAIM = 400;

/** Every claim number the text's markers point at. */
export function markersIn(text: string): number[] {
  return [...new Set((text.match(MARKER) ?? []).flatMap((m) => m.match(/\d+/g)!.map(Number)))];
}

export function sectionText(s: ProposalSections): string {
  return [s.title, s.problem, ...s.researchQuestions, s.plan, s.eachSideBrings.company, s.eachSideBrings.faculty, s.whyThisPair, s.agreedUpFront].join('\n');
}

export const c8: ProposalCheck = ({ proposal }) => {
  const s = proposal.sections;
  const missing: string[] = [];
  const blank = (x: string) => !x.replace(MARKER, '').trim();
  if (blank(s.title)) missing.push('a title');
  if (blank(s.problem)) missing.push('the problem');
  else if (!NUMBER.test(s.problem.replace(MARKER, ''))) missing.push('numbers in the problem');
  if (!s.researchQuestions.some((q) => !blank(q))) missing.push('research questions');
  const rows = s.plan.split('\n').filter((line) => line.includes('|') && !blank(line.replace(/\|/g, '')));
  if (proposal.format === 'industrial_phd' && rows.length < 3) missing.push('a 3-year plan table (at least three "period | work | output" rows)');
  else if (rows.length < 2) missing.push('a short-project plan (at least two "period | work | output" rows)');
  if (blank(s.eachSideBrings.company)) missing.push('what the company brings');
  if (blank(s.eachSideBrings.faculty)) missing.push('what the faculty brings');
  if (blank(s.whyThisPair)) missing.push('why this pair');
  if (blank(s.agreedUpFront)) missing.push('what is agreed up front');

  const numbers = proposal.claims.map((c) => c.n);
  const repeated = [...new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i))];
  const markers = markersIn(sectionText(s));
  const dangling = markers.filter((n) => !numbers.includes(n));
  const pasted = proposal.claims.filter((c) => c.text.length > MAX_CLAIM).map((c) => c.n);

  const problems = [
    missing.length ? `Missing ${missing.join(', ')}.` : '',
    repeated.length ? `Claim number ${repeated.join(', ')} is used twice.` : '',
    dangling.length ? `${dangling.length === 1 ? 'Marker' : 'Markers'} ${dangling.map((n) => `{${n}}`).join(', ')} ${dangling.length === 1 ? 'points' : 'point'} at no claim.` : '',
    pasted.length ? `Claim ${pasted.join(', ')} ${pasted.length === 1 ? 'is' : 'are'} longer than ${MAX_CLAIM} characters; a claim states one fact in one sentence.` : '',
  ].filter(Boolean);
  return problems.length ? fail('C8', 'proposal', problems.join(' ')) : pass('C8', 'proposal', { detail: 'All six required sections are present.' });
};
