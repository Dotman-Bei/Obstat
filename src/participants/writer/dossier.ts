// The slice of the dataset a writer works from (T2): the researcher's profile as the profile states it, the company,
// the challenge and the Matchmaker's evidence, with abstracts of the listed works closest to the challenge. Works are
// listed as the profile lists them, without their author entries: whether each record really credits the researcher
// is the Critic's check, not the writer's (PRD §2: split work loses the context needed to tell people apart).
import type { DataIndex } from '../../data/index.ts';
import { terms } from '../../data/search.ts';
import type { Pair } from '../../state.ts';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const WITH_ABSTRACT = 6;

export function dossier(ix: DataIndex, pair: Pair): string {
  const company = ix.companies.get(pair.companyId)!;
  const challenge = ix.challenges.get(pair.challengeId)!;
  const want = new Set(terms(`${challenge.text} ${challenge.detail}`));
  const people = pair.researcherIds.map((id) => {
    const r = ix.researchers.get(id)!;
    const works = [
      ...r.publications.map((wid) => { const p = ix.publications.get(wid); return { wid, head: p ? `(${p.year}) ${p.title}` : '', text: p ? `${p.title} ${p.abstract} ${p.keywords.join(' ')}` : '', abstract: p?.abstract ?? '' }; }),
      ...r.projects.map((wid) => { const p = ix.projects.get(wid); return { wid, head: p ? `(${p.years}) ${p.title}` : '', text: p ? `${p.title} ${p.summary}` : '', abstract: p?.summary ?? '' }; }),
      ...r.patents.map((wid) => { const p = ix.patents.get(wid); return { wid, head: p ? `(${p.year}, ${p.status}) ${p.title}` : '', text: p ? `${p.title} ${p.abstract}` : '', abstract: p?.abstract ?? '' }; }),
    ];
    const ranked = new Set(works.map((w) => ({ wid: w.wid, hits: terms(w.text).filter((t) => want.has(t)).length }))
      .sort((a, b) => b.hits - a.hits).slice(0, WITH_ABSTRACT).filter((w) => w.hits > 0).map((w) => w.wid));
    const lines = works.map((w) => `  - ${w.wid} ${w.head}${ranked.has(w.wid) && w.abstract ? `\n    ${clip(w.abstract, 450)}` : ''}`);
    return [
      `Researcher ${r.id}: ${r.name}, ${r.title}, ${r.faculty}, ${r.department}`,
      `Fields: ${r.fields.join('; ')}`,
      `Keywords: ${r.keywords.join(', ')}`,
      r.bio ? `Bio: ${clip(r.bio, 900)}` : 'Bio: (none)',
      `open_to: ${r.open_to.length ? r.open_to.map((x) => `"${x}"`).join('; ') : '(none)'}`,
      `notes: ${r.notes ? `"${r.notes}"` : '(none)'}`,
      r.industry_experience ? `Industry experience: ${clip(r.industry_experience, 500)}` : '',
      `Works on this profile (abstracts for those closest to the challenge):\n${lines.join('\n') || '  (none)'}`,
    ].filter(Boolean).join('\n');
  });
  return [
    `Pair ${pair.pairId}. Suggested format: ${pair.format}.`,
    `Matchmaker's reason: ${pair.why} Evidence: ${pair.evidence.join(', ')}.`,
    '',
    ...people,
    '',
    `Company ${company.id}: ${company.name}, ${company.sector}, ${company.employees} employees, ${company.location}`,
    `About: ${clip(company.about, 900)}`,
    `R&D capacity: ${company.rd_capacity}`,
    `Past collaborations: ${clip(company.past_collaborations, 300)}`,
    '',
    `Challenge ${challenge.id}: ${challenge.text}`,
    `Detail: ${challenge.detail}`,
  ].join('\n');
}
