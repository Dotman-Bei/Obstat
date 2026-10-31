// Identity hints per researcher: duplicate profiles (C3), namesakes (C4), stale status (C5) and capacity text (C6).
//
// Two records with the same normalized name are one person only with two more signals: the same faculty (in either
// language), and either a profile that lists works whose author entries carry the other ID, or a note saying the record
// was imported from a second source. Anything less is a namesake. A missed merge is safe, because C2 still checks the
// exact ID on the record; a false merge would make the Critic fail correct claims (PRD §18).
import type { DataIndex, Researcher } from './index.ts';
import { canonicalFaculty, fold, hasCyrillic, nameKey } from './normalize.ts';

export type Status = 'active' | 'emeritus' | 'retired' | 'left';

export interface IdentityHint {
  id: string;
  /** Other records of this same person. */
  sameAs: string[];
  /** The record whose works carry this person's ID; claims should cite this one. */
  canonicalId: string;
  /** Why the records were judged one person, e.g. "reversed name order", "same faculty". */
  sameAsSignals: string[];
  /** Different people who share this normalized name. */
  namesakes: string[];
  status: Status;
  /** The note sentences that set the status, verbatim, for C5 to quote. */
  statusText: string;
  /** The note sentences about availability and workload, verbatim, for C6 to read. */
  capacityText: string;
}

const LEFT = /\bleft (the )?(university|faculty)\b|\bno longer (works|employed|affiliated)\b/i;
const RETIRED = /\bretire(d|ment)\b/i;
const EMERITUS = /emerit|емерит/i;
const CAPACITY = /capacit|availab|workload|commitment|sabbatical|supervis|teaching load|new (collaboration|project|contract)|consult/i;
const SECOND_SOURCE = /imported from a second source/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

export function readStatus(r: Researcher): { status: Status; statusText: string } {
  const notes = sentences(r.notes);
  const quote = (re: RegExp) => notes.filter((s) => re.test(s)).join(' ');
  if (LEFT.test(r.notes)) return { status: 'left', statusText: quote(LEFT) };
  if (EMERITUS.test(r.title)) return { status: 'emeritus', statusText: quote(new RegExp(`${RETIRED.source}|${EMERITUS.source}`, 'i')) || `Title: ${r.title}.` };
  if (notes.some((s) => RETIRED.test(s) && !/\bnot retired\b/i.test(s))) return { status: 'retired', statusText: quote(RETIRED) };
  return { status: 'active', statusText: '' };
}

export function readCapacity(r: Researcher): string {
  return sentences(r.notes).filter((s) => CAPACITY.test(s)).join(' ');
}

/** Works on a's profile whose entries carry b and not a. */
function creditedToOther(ix: DataIndex, a: Researcher, b: Researcher): number {
  const theirs = new Set(ix.credited.get(b.id) ?? []);
  const mine = new Set(ix.credited.get(a.id) ?? []);
  return [...a.publications, ...a.projects, ...a.patents].filter((id) => theirs.has(id) && !mine.has(id)).length;
}

/** The signals that make a and b one person, or null when they are namesakes. */
export function sameSignals(ix: DataIndex, a: Researcher, b: Researcher): string[] | null {
  if (canonicalFaculty(a.faculty) !== canonicalFaculty(b.faculty)) return null;
  const ab = creditedToOther(ix, a, b);
  const ba = creditedToOther(ix, b, a);
  const imported = [a, b].filter((r) => SECOND_SOURCE.test(r.notes));
  if (!ab && !ba && !imported.length) return null;

  const signals: string[] = [];
  if (hasCyrillic(a.name) !== hasCyrillic(b.name)) signals.push('Latin and Cyrillic spellings');
  else if (fold(a.name) !== fold(b.name)) signals.push('reversed name order');
  signals.push(a.faculty === b.faculty ? 'same faculty' : 'same faculty, named in Serbian on one record');
  if (ab) signals.push(`${a.id} lists ${ab} ${ab === 1 ? 'work' : 'works'} credited to ${b.id}`);
  if (ba) signals.push(`${b.id} lists ${ba} ${ba === 1 ? 'work' : 'works'} credited to ${a.id}`);
  for (const r of imported) signals.push(`${r.id} is marked as imported from a second source`);
  return signals;
}

export function buildIdentities(ix: DataIndex): Map<string, IdentityHint> {
  const hints = new Map<string, IdentityHint>();
  const groups = new Map<string, Researcher[]>();
  for (const r of ix.researchers.values()) {
    hints.set(r.id, { id: r.id, sameAs: [], canonicalId: r.id, sameAsSignals: [], namesakes: [], ...readStatus(r), capacityText: readCapacity(r) });
    const key = nameKey(r.name);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const owned = (id: string) => ix.credited.get(id)?.length ?? 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        const ha = hints.get(a.id)!;
        const hb = hints.get(b.id)!;
        const signals = sameSignals(ix, a, b);
        if (!signals) {
          ha.namesakes.push(b.id);
          hb.namesakes.push(a.id);
          continue;
        }
        ha.sameAs.push(b.id);
        hb.sameAs.push(a.id);
        ha.sameAsSignals.push(...signals);
        hb.sameAsSignals.push(...signals);
      }
    }
    // The canonical record is the one the works themselves credit.
    for (const r of group) {
      const h = hints.get(r.id)!;
      if (!h.sameAs.length) continue;
      h.canonicalId = [r.id, ...h.sameAs].sort((x, y) => owned(y) - owned(x) || x.localeCompare(y))[0];
    }
  }
  return hints;
}
