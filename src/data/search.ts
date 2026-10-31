// Candidate retrieval in code: TF-IDF over each researcher's own profile (fields, keywords, department, and the titles
// and keywords of the works their profile lists), queried with a challenge's text. Models then judge the shortlist;
// they never read the whole dataset.
import type { IdentityHint } from './identities.ts';
import type { Challenge, DataIndex, Researcher } from './index.ts';
import { fold } from './normalize.ts';

const STOP = new Set(('a an and are as at be but by can for from has have how in into is it its of on or our so that the their them '
  + 'they this to was we what when which who will with within without would not no more most than then there these those very '
  + 'also each per via using use used about over under between new based all any one two three need needs want wants current '
  + 'currently every some such other only both well up out time data system systems').split(' '));

export function terms(text: string): string[] {
  return fold(text).split(' ').filter((t) => t.length > 2 && !STOP.has(t)).map(stem);
}

/** A light English stem, enough to meet "detection" with "detecting" and "networks" with "network". */
function stem(t: string): string {
  return t.replace(/(ations?|ings?|ers?|ies|es|s|ed|ly)$/, '') || t;
}

export interface Candidate { researcherId: string; score: number; matched: string[] }

export interface SearchIndex {
  search(query: string, k: number, filter?: (r: Researcher) => boolean): Candidate[];
}

export function researcherText(ix: DataIndex, r: Researcher): string {
  const works = [
    ...r.publications.map((id) => ix.publications.get(id)).map((p) => (p ? `${p.title} ${p.keywords.join(' ')}` : '')),
    ...r.projects.map((id) => ix.projects.get(id)?.title ?? ''),
    ...r.patents.map((id) => ix.patents.get(id)?.title ?? ''),
  ];
  return [r.fields.join(' '), r.keywords.join(' '), r.keywords.join(' '), r.department, ...works].join(' ');
}

export function buildSearch(ix: DataIndex): SearchIndex {
  const docs = [...ix.researchers.values()].map((r) => {
    const tf = new Map<string, number>();
    for (const t of terms(researcherText(ix, r))) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { r, tf };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log(1 + docs.length / (df.get(t) ?? docs.length));
  const vectors = docs.map(({ r, tf }) => {
    const w = new Map([...tf].map(([t, n]) => [t, (1 + Math.log(n)) * idf(t)]));
    const norm = Math.sqrt([...w.values()].reduce((a, x) => a + x * x, 0)) || 1;
    return { r, w, norm };
  });

  return {
    search(query, k, filter) {
      const q = new Map<string, number>();
      for (const t of terms(query)) q.set(t, (q.get(t) ?? 0) + idf(t));
      const qnorm = Math.sqrt([...q.values()].reduce((a, x) => a + x * x, 0)) || 1;
      const scored: Candidate[] = [];
      for (const { r, w, norm } of vectors) {
        if (filter && !filter(r)) continue;
        let dot = 0;
        const matched: string[] = [];
        for (const [t, x] of q) {
          const y = w.get(t);
          if (y) {
            dot += x * y;
            matched.push(t);
          }
        }
        if (dot > 0) scored.push({ researcherId: r.id, score: dot / (norm * qnorm), matched });
      }
      return scored.sort((a, b) => b.score - a.score || a.researcherId.localeCompare(b.researcherId)).slice(0, k);
    },
  };
}

/** Candidates for a challenge, one record per person: second records fold into the canonical one. */
export function candidatesFor(search: SearchIndex, hints: Map<string, IdentityHint>, ch: Challenge, k: number): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of search.search(`${ch.text} ${ch.detail}`, k * 3, (r) => hints.get(r.id)?.status !== 'left')) {
    const canon = hints.get(c.researcherId)?.canonicalId ?? c.researcherId;
    if (seen.has(canon)) continue;
    seen.add(canon);
    out.push(c);
    if (out.length === k) break;
  }
  return out;
}
