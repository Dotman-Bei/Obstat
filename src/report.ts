// End-of-run files: out/summary.md (F6), out/no-match.md (F7) and out/run.json, the snapshot the console serves in
// replay (pairs, classes, verdicts, usage) so it never has to re-run anything.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK_NAMES, type CheckId, type Verdict } from './contract.ts';
import type { ObstatState } from './state.ts';

export interface RunStats { startedAt: Date; endedAt: Date; calls: number; failedCalls: number; retries: number; tokens: number; stopReason: string | null; maxConcurrentLoops: number; demo: boolean }

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function verdicts(state: ObstatState): Verdict[] {
  return [...state.reviews.byId.values()].map((r) => r.verdict).filter((v): v is Verdict => !!v).sort((a, b) => a.reviewId.localeCompare(b.reviewId));
}

export function writeReports(state: ObstatState, outDir: string, stats: RunStats): void {
  const ix = state.index;
  const name = (id: string) => ix.researchers.get(id)?.name ?? id;
  const company = (id: string) => ix.companies.get(id)?.name ?? id;
  const all = verdicts(state);
  const written = state.shortlist.filter((p) => p.status === 'written');
  const abandoned = state.shortlist.filter((p) => p.status === 'abandoned');
  const unfinished = state.shortlist.filter((p) => p.status === 'shortlisted' || p.status === 'writing');

  const failedChecks = new Map<CheckId, number>();
  for (const v of all) for (const f of v.claims) failedChecks.set(f.check, (failedChecks.get(f.check) ?? 0) + 1);
  const writers = [...new Set(all.map((v) => v.writerId))].sort();
  const timeouts = [...state.reviews.byId.values()].filter((r) => r.status === 'timeout').length;
  const minutes = ((stats.endedAt.getTime() - stats.startedAt.getTime()) / 60_000).toFixed(1);

  const summary = [
    '# Obstat run summary',
    '',
    `Run ${stats.startedAt.toISOString()} to ${stats.endedAt.toISOString()} (${minutes} min)${stats.demo ? ', with the --demo pair seeded' : ''}. ${stats.calls} model calls, ${stats.tokens.toLocaleString('en')} tokens, ${stats.retries} rate-limit retries, ${stats.failedCalls} failed calls. At most ${stats.maxConcurrentLoops} loops ran at once.`,
    stats.stopReason ? `\nModel calls stopped early: ${stats.stopReason}.` : '',
    '',
    `## Pairs proposed (${written.length})`,
    '',
    '| Pair | Researcher | Company | Challenge | Format | Released in |',
    '|---|---|---|---|---|---|',
    ...written.map((p) => {
      const pass = all.filter((v) => v.pairId === p.pairId && v.pass).at(-1);
      return `| [${p.pairId}](proposals/${p.pairId}.md) | ${p.researcherIds.map((id) => `${name(id)} (${id})`).join(', ')} | ${company(p.companyId)} (${p.companyId}) | ${p.challengeId} | ${p.format} | ${pass ? `${pass.reviewId}, round ${pass.round}` : ''} |`;
    }),
    '',
    `## Pairs abandoned (${abandoned.length})`,
    '',
    ...(abandoned.length ? abandoned.map((p) => `- **${p.pairId}** (${p.researcherIds.join(', ')} with ${p.challengeId}): ${p.reason ?? 'no reason recorded'}`) : ['None.']),
    ...(unfinished.length ? ['', `Not finished when the run ended: ${unfinished.map((p) => p.pairId).join(', ')}.`] : []),
    '',
    `## Holds per writer (${all.length} reviews${timeouts ? `, ${timeouts} timed out` : ''})`,
    '',
    '| Writer | Holds | Failed | Passed |',
    '|---|---|---|---|',
    ...writers.map((w) => {
      const mine = all.filter((v) => v.writerId === w);
      return `| ${w} | ${mine.length} | ${mine.filter((v) => !v.pass).length} | ${mine.filter((v) => v.pass).length} |`;
    }),
    '',
    '## Checks failed, by type',
    '',
    'A claim can fail more than one check: attribution (C2) fails alongside the duplicate (C3) or namesake (C4) check that explains it.',
    '',
    '| Check | Failures |',
    '|---|---|',
    ...[...failedChecks].sort((a, b) => b[1] - a[1]).map(([c, n]) => `| ${c} ${CHECK_NAMES[c]} | ${n} |`),
    ...(failedChecks.size ? [] : ['| none | 0 |']),
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'summary.md'), summary);

  const turned = [...state.challengeClass].filter(([, c]) => c.cls !== 'research');
  const section = (cls: 'not_research' | 'no_uns_fit', title: string, note: string) => {
    const rows = turned.filter(([, c]) => c.cls === cls).sort(([a], [b]) => a.localeCompare(b));
    return [`## ${title} (${rows.length})`, '', note, '', '| Challenge | Company | Challenge text | Reason |', '|---|---|---|---|',
      ...rows.map(([id, c]) => { const ch = ix.challenges.get(id)!; return `| ${id} | ${cell(company(ch.companyId))} | ${cell(ch.text)} | ${cell(c.reason)} |`; }), ''];
  };
  const unclassified = [...ix.challenges.keys()].filter((id) => !state.challengeClass.has(id));
  writeFileSync(join(outDir, 'no-match.md'), [
    '# Challenges turned away before matching',
    '',
    `The Industry Analyst classified ${state.challengeClass.size} of ${ix.challenges.size} challenges. ${turned.length} were turned away; no proposal was attempted for them.`,
    '',
    ...section('not_research', 'Not a research problem', 'Hiring, funding, sales, legal or routine integration work: a contractor or consultant fits better than a research collaboration.'),
    ...section('no_uns_fit', 'No fit at the University of Novi Sad', 'A real research question, but no researcher in the dataset works in its field.'),
    ...(unclassified.length ? [`Not classified when the run ended: ${unclassified.length} challenges.`, ''] : []),
  ].join('\n'));

  writeFileSync(join(outDir, 'run.json'), `${JSON.stringify({
    stats,
    pairs: state.shortlist,
    classes: Object.fromEntries(state.challengeClass),
    verdicts: all,
  }, null, 2)}\n`);
}
