// out/proposals/<pairId>.md: the proposal, then its claim -> ID table with the Critic's final verdict per claim (F3).
import { CHECK_NAMES, type Verdict, type WriteProposalInput } from '../../contract.ts';
import type { DataIndex } from '../../data/index.ts';

const FORMAT_NAMES = { industrial_phd: 'Industrial PhD', joint_project: 'Joint project', contract_research: 'Contract research' } as const;
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
// {3} and {1, 2} become [3] and [1, 2].
const marks = (s: string) => s.replace(/\s*\{\s*(\d+(?:\s*,\s*\d+)*)\s*\}/g, (_, list: string) => ` [${list.split(/\s*,\s*/).join(', ')}]`);

export function renderProposal(ix: DataIndex, p: WriteProposalInput, verdict: Verdict, writtenAt: Date): string {
  const s = p.sections;
  const company = ix.companies.get(p.companyId);
  const people = p.researcherIds.map((id) => {
    const r = ix.researchers.get(id);
    return r ? `${r.name} (${id}), ${r.faculty}` : id;
  });
  const rows = s.plan.split('\n').filter((l) => l.includes('|')).map((l) => l.split('|').map((c) => cell(marks(c))));
  const checksFor = (n: number) => verdict.checks.filter((c) => c.target === n);

  return [
    `# ${marks(s.title)}`,
    '',
    `**Pair** ${p.pairId} · **Researcher** ${people.join('; ')} · **Company** ${company?.name ?? p.companyId} (${p.companyId}) · **Challenge** ${p.challengeId} · **Format** ${FORMAT_NAMES[p.format]}`,
    '',
    '## Problem',
    '',
    marks(s.problem),
    '',
    '## Research questions',
    '',
    ...s.researchQuestions.map((q, i) => `${i + 1}. ${marks(q)}`),
    '',
    '## Plan',
    '',
    '| Period | Work | Output |',
    '|---|---|---|',
    ...rows.map((r) => `| ${[r[0] ?? '', r[1] ?? '', r.slice(2).join(' · ')].join(' | ')} |`),
    '',
    '## What each side brings',
    '',
    `**Company.** ${marks(s.eachSideBrings.company)}`,
    '',
    `**Faculty.** ${marks(s.eachSideBrings.faculty)}`,
    '',
    '## Why this pair',
    '',
    marks(s.whyThisPair),
    '',
    '## Agreed up front',
    '',
    marks(s.agreedUpFront),
    '',
    '## Claims and evidence',
    '',
    'Every bracketed number above points to a claim here. The Critic checked each one against the dataset before this file was written.',
    '',
    '| # | Claim | Kind | Researcher | Dataset IDs | Critic verdict |',
    '|---|---|---|---|---|---|',
    ...p.claims.map((c) => {
      const checks = checksFor(c.n);
      const verdictText = checks.every((x) => x.pass) ? `Pass (${checks.map((x) => x.check).join(', ')})` : `Fail (${checks.filter((x) => !x.pass).map((x) => x.check).join(', ')})`;
      return `| ${c.n} | ${cell(c.text)} | ${c.kind} | ${c.researcherId ?? ''} | ${c.ids.join(', ')} | ${verdictText} |`;
    }),
    '',
    `Proposal-level checks: ${verdict.checks.filter((c) => c.target === 'proposal').map((c) => `${c.check} ${CHECK_NAMES[c.check]} ${c.pass ? 'pass' : 'fail'}`).join(', ')}.`,
    '',
    `Released by the Critic in ${verdict.reviewId} (round ${verdict.round}, ${verdict.writerId}); written ${writtenAt.toISOString()}.`,
    '',
  ].join('\n');
}
