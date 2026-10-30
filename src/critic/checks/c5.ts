// C5 Availability: an available_for claim must quote the researcher's own open_to or notes, the quoted words must
// support the role offered, a researcher who left is never available, a retired or emeritus one only for consulting,
// and the claim must not rely on a date that has passed.
import type { DataIndex, Researcher } from '../../data/index.ts';
import { fold } from '../../data/normalize.ts';
import { fail, pass, type ClaimCheck } from './context.ts';

const ROLES: [string, RegExp][] = [
  ['doctoral supervision', /\bph\.?\s?d\b|doctoral|supervis/i],
  ['consulting', /consult|advis/i],
  ['contract research', /\bcontract/i],
  ['a joint project', /joint (research )?project|project partner|collaborative project|joint research/i],
  ['internships', /internship|student project/i],
  ['laboratory access', /laborator|\blab\b/i],
];

export function rolesIn(text: string): string[] {
  return ROLES.filter(([, re]) => re.test(text)).map(([name]) => name);
}

/** Text between quotation marks, in English or Serbian style. */
export function quotesIn(text: string): string[] {
  return [...text.matchAll(/["“„]([^"“”„]{6,}?)["”“]/g)].map((m) => m[1].trim());
}

const nameTokens = new WeakMap<DataIndex, Set<string>>();

/** The name a note is about, when its subject is another researcher in the dataset (R0128's note describes "Vesna Mitrović"). */
export function notesAboutOther(r: Researcher, ix: DataIndex): string | null {
  let known = nameTokens.get(ix);
  if (!known) {
    known = new Set([...ix.researchers.values()].flatMap((x) => fold(x.name).split(' ')).filter((t) => t.length > 2));
    nameTokens.set(ix, known);
  }
  const own = new Set(fold(r.name).split(' '));
  if (fold(r.notes).split(' ').some((t) => own.has(t))) return null;
  const subject = /(?:^|[.!?]\s+)(?:(?:Prof\.|Professor|Dr\.?)\s+)?(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)?)\s+(?:is|has|prefers|would|can|currently|expressed|welcomes|seeks|was|will)\b/u;
  const name = r.notes.match(subject)?.[1];
  if (!name) return null;
  const tokens = fold(name).split(' ');
  return tokens.every((t) => !own.has(t)) && tokens.some((t) => known.has(t)) ? name : null;
}

export const c5: ClaimCheck = (claim, { ix, hints, today }) => {
  const rid = claim.researcherId;
  const r = rid ? ix.researchers.get(rid) : undefined;
  if (!rid || !r) return fail('C5', claim.n, 'The claim names no researcher whose availability could be checked.');
  const hint = hints.get(rid)!;
  if (hint.status === 'left') return fail('C5', claim.n, `${rid}'s notes say: "${hint.statusText}" They are not available.`, { record: rid, mark: hint.statusText });

  const other = notesAboutOther(r, ix);
  const sources: { field: string; text: string }[] = [
    ...r.open_to.map((text) => ({ field: 'open_to', text })),
    ...(other ? [] : [{ field: 'notes', text: r.notes }]),
  ];
  const quotes = quotesIn(claim.text);
  if (!quotes.length) return fail('C5', claim.n, `Quote the words in ${rid}'s open_to or notes that support this role.`, { record: rid });

  const matched: { field: string; text: string; quote: string }[] = [];
  for (const quote of quotes) {
    const src = sources.find((s) => fold(s.text).includes(fold(quote)));
    if (src) {
      matched.push({ ...src, quote });
      continue;
    }
    const why = other && fold(r.notes).includes(fold(quote))
      ? `${rid}'s notes describe ${other}, not ${r.name}, so they cannot support this claim.`
      : `"${quote}" is not in ${rid}'s open_to or notes.`;
    return fail('C5', claim.n, why, { record: rid, mark: quote });
  }

  const offered = rolesIn(quotes.reduce((t, q) => t.replace(q, ''), claim.text));
  const supported = new Set(matched.flatMap((m) => rolesIn(m.text)));
  const unsupported = offered.filter((role) => !supported.has(role));
  if (unsupported.length) {
    return fail('C5', claim.n, `The claim offers ${unsupported.join(' and ')}, but the quoted words from ${rid}'s ${matched[0].field} support ${[...supported].join(', ') || 'no specific role'}.`, { record: rid, mark: matched[0].quote });
  }

  if (hint.status === 'emeritus' || hint.status === 'retired') {
    const roles = offered.length ? offered : [...supported];
    if (!roles.length || roles.some((role) => role !== 'consulting')) {
      return fail('C5', claim.n, `${rid} is ${hint.status}: "${hint.statusText}" Only a consulting role fits.`, { record: rid, mark: hint.statusText });
    }
  }

  const year = today.getFullYear();
  const past = [...claim.text.matchAll(/\b(19|20)\d{2}\b(?![^.]*\bonwards?\b)/g)].map((m) => Number(m[0])).find((y) => y < year);
  if (past) return fail('C5', claim.n, `The claim relies on ${past}, which has passed. Claim only what ${rid}'s notes say holds now.`, { record: rid, mark: String(past) });

  const first = matched[0];
  return pass('C5', claim.n, { detail: `Supported by ${rid}'s ${first.field}: "${first.quote}".`, record: rid, mark: first.quote });
};
