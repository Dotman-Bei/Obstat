// The sample run the console replays with no backend and no key (PRD §11.1 replay mode).
// It builds out/trace.jsonl-shaped lines from a timed schedule. Verdicts are not typed in: a small Critic below runs
// C1–C10 against the sample records, so every pass and fail in the trace follows from the data it cites.
// The API payloads (/api/summary, /api/proposals, /api/records) are computed from the same objects.
import type { CheckId, CheckResult, Claim, ParticipantId, Proposal, ProposalListItem, ReviewRequest, Summary, TraceLine, Verdict } from '../src/data/types.ts';
import { recordById } from './records.ts';
import { noMatch, pairs, type PairDraft } from './proposals.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Fixture check failed: ${msg}`);
}

// 09:11:00 CET on Saturday 31 October 2026 (CET is UTC+1 after 25 October).
const T0 = Date.UTC(2026, 9, 31, 8, 11, 0);
const iso = (s: number) => new Date(T0 + Math.round(s * 1000)).toISOString();

const lines: (TraceLine & { seq: number })[] = [];
const emit = (s: number, type: string, producer: ParticipantId, loopId: string | undefined, summary: string, data?: object) => {
  lines.push({ t: iso(s), type, producer, ...(loopId ? { loopId } : {}), summary, ...(data ? { data: data as Record<string, unknown> } : {}), seq: lines.length });
};

// ---------- identity hints the profilers write (PRD §2 traps) ----------
const sameAs: Record<string, string[]> = { R0139: ['R0539'], R0539: ['R0139'] };
const namesakes: Record<string, string[]> = { R0128: ['R0881'], R0881: ['R0128'] };

// ---------- the Critic's catalogue (PRD §9), run in code against the records ----------
const carriers: Record<string, { field: string; role: string }> = {
  publication: { field: 'authors', role: 'author' },
  patent: { field: 'inventors', role: 'inventor' },
  project: { field: 'participants', role: 'participant' },
};
const field = (id: string, key: string) => recordById.get(id)?.record[key];
const nameOf = (id: string) => recordById.get(id)?.title ?? id;

function carriedIds(recordId: string): string[] {
  const rec = recordById.get(recordId);
  const c = rec && carriers[rec.type];
  if (!rec || !c) return [];
  return ((rec.record[c.field] as { researcher_id: string | null }[]) ?? []).map((e) => e.researcher_id).filter((x): x is string => !!x);
}

/** Lines the C5 check reads differ by round: the writer rewords the availability claim each time. */
const c5Failures = [
  (r: string) => `${r}’s profile status is “left”, and the note says “${field(r, 'notes')}” The open_to entry predates the departure and cannot support a supervisor role.`,
  (r: string) => `No quote in ${r}’s notes supports an adviser role, and the profile status is “left”.`,
  (r: string) => `The claim still relies on ${r} being available. Drop it or choose another researcher.`,
];

function runChecks(req: ReviewRequest): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (check: CheckId, target: number | 'proposal', pass: boolean, detail: string, record?: string, mark?: string) =>
    out.push({ check, target, pass, detail, ...(record ? { record } : {}), ...(mark ? { mark } : {}) });

  for (const c of req.claims) {
    const missing = c.ids.filter((id) => !recordById.has(id));
    add('C1', c.n, missing.length === 0, missing.length ? `${missing.join(', ')} is not in the dataset.` : `${c.ids.join(', ')} ${c.ids.length > 1 ? 'are' : 'is'} in the index.`);
    if (missing.length) continue;

    let attributionFailed = false;
    if (c.researcherId && (c.kind === 'authored' || c.kind === 'patent' || c.kind === 'project')) {
      const rec = c.ids[0];
      const carried = carriedIds(rec);
      const { role } = carriers[recordById.get(rec)!.type];
      const ok = carried.includes(c.researcherId);
      attributionFailed = !ok;
      add('C2', c.n, ok,
        ok ? `${rec} lists ${c.researcherId} as ${role} ${carried.indexOf(c.researcherId) + 1}.` : `${rec}’s ${role} entries carry ${carried.join(', ')}, not ${c.researcherId}.`,
        rec, ok ? c.researcherId : carried[0]);

      const dup = carried.find((id) => sameAs[c.researcherId!]?.includes(id));
      add('C3', c.n, !dup,
        dup
          ? `${rec} is attributed to ${dup}. ${c.researcherId} and ${dup} look like one person (reversed name order, same faculty). Cite ${dup} or state both IDs.`
          : sameAs[c.researcherId] ? `${c.researcherId} has a duplicate record (${sameAs[c.researcherId].join(', ')}); this evidence is under ${c.researcherId}.` : `No other record of ${c.researcherId} is marked as the same person.`,
        rec, dup);

      const twin = carried.find((id) => namesakes[c.researcherId!]?.includes(id));
      add('C4', c.n, !twin,
        twin
          ? `Two researchers are named ${nameOf(twin)}. ${rec} belongs to ${twin} (${field(twin, 'faculty')}, ${(field(twin, 'research_areas') as string[])[0]}), not ${c.researcherId} (${field(c.researcherId, 'faculty')}, ${(field(c.researcherId, 'research_areas') as string[])[0]}).`
          : namesakes[c.researcherId] ? `A namesake exists (${namesakes[c.researcherId].join(', ')}); this evidence is ${c.researcherId}’s.` : `No other researcher has this name.`,
        rec, twin);
    }

    if (c.kind === 'available_for' && c.researcherId) {
      const r = c.researcherId;
      const status = field(r, 'status');
      const ok = status === 'active' && !!field(r, 'notes');
      add('C3', c.n, true, sameAs[r] ? `${r} has a duplicate record (${sameAs[r].join(', ')}); the note is read from ${r}.` : `No other record of ${r} is marked as the same person.`);
      add('C4', c.n, true, namesakes[r] ? `A namesake exists (${namesakes[r].join(', ')}); the note is ${r}’s own.` : `No other researcher has this name.`);
      add('C5', c.n, ok, ok ? `Supported by ${r}’s own note: “${field(r, 'notes')}”` : c5Failures[Math.min(req.round, 3) - 1](r), r, String(field(r, 'notes')));
      add('C6', c.n, true, `No other proposal passed by the gate commits ${r}.`);
    }

    if (c.kind === 'challenge') add('C7', c.n, true, `The Analyst classified ${c.ids[0]} as research.`, c.ids[0]);

    // C10 reads only the cited records; it is skipped when attribution already failed.
    if (!attributionFailed) add('C10', c.n, true, `The cited record supports the sentence.`, c.ids[0]);
  }
  add('C8', 'proposal', true, 'All six sections are present: problem with numbers, research questions, plan, what each side brings, why this pair, agreed up front.');
  add('C9', 'proposal', true, 'No comparative or ranking language about people.');
  return out;
}

const checkNames: Record<CheckId, string> = {
  C1: 'ID exists', C2: 'Attribution', C3: 'Duplicate profile', C4: 'Namesake', C5: 'Availability',
  C6: 'Capacity', C7: 'Research problem', C8: 'Sections complete', C9: 'No ranking of people', C10: 'Support',
};

function verdictFor(req: ReviewRequest): Verdict {
  const checks = runChecks(req);
  const failures = checks.filter((c) => !c.pass).map((c) => ({ n: c.target, check: c.check, pass: false as const, detail: c.detail! }));
  return { reviewId: req.reviewId, writerId: req.writerId, pairId: req.pairId, round: req.round, pass: failures.length === 0, claims: failures, checks };
}

// ---------- the schedule (seconds after 09:11:00) ----------
interface Hold { reviewId: string; pairId: string; round: number; start: number; end: number }
const holds: Hold[] = [
  { reviewId: 'rv_01', pairId: 'pair-2', round: 1, start: 96.2, end: 104.3 },
  { reviewId: 'rv_02', pairId: 'pair-3', round: 1, start: 104.9, end: 111.7 },
  { reviewId: 'rv_03', pairId: 'pair-1', round: 1, start: 108.0, end: 114.6 },
  { reviewId: 'rv_04', pairId: 'pair-3', round: 2, start: 124.3, end: 130.2 },
  { reviewId: 'rv_05', pairId: 'pair-2', round: 2, start: 127.9, end: 133.6 },
  { reviewId: 'rv_06', pairId: 'pair-4', round: 1, start: 136.0, end: 141.6 },
  { reviewId: 'rv_07', pairId: 'pair-4', round: 2, start: 152.4, end: 157.7 },
  { reviewId: 'rv_08', pairId: 'pair-4', round: 3, start: 168.9, end: 174.1 },
  { reviewId: 'rv_09', pairId: 'pair-5', round: 1, start: 207.5, end: 213.4 },
];

let tokenSeed = 7;
const tokens = () => (tokenSeed = (tokenSeed * 37 + 11) % 97, 640 + tokenSeed * 13);

/** Alternate tool calls and model turns between a and b; the last model turn ends exactly at b. */
function work(p: ParticipantId, loopId: string, a: number, b: number, tools: [string, string][], turn = 7.5) {
  let t = a, i = 0;
  while (t < b - 0.05) {
    const tool = tools[i];
    if (tool && t + 1.2 < b - 1) {
      emit(t, 'function_call.started', p, loopId, tool[0]);
      emit(t + 1.2, 'function_call.completed', p, loopId, tool[1]);
      t += 1.2;
    }
    const end = i >= tools.length - 1 && b - t < turn * 1.6 ? b : Math.min(t + turn, b);
    emit(t, 'inference.started', p, loopId, 'model turn');
    emit(end, 'inference.completed', p, loopId, `${tokens().toLocaleString('en')} tokens`);
    t = end; i++;
  }
}

emit(0, 'loop.started', 'CO', 'lp_co_01', 'load dataset index');
emit(1.6, 'index.loaded', 'CO', 'lp_co_01', '1,047 researchers · 489 challenges · 41,882 publications', { researchers: 1047, challenges: 489 });
emit(1.8, 'run.started', 'CO', 'lp_co_01', 'shard plan: 4 profilers × ~262 researchers; 3 writers');
emit(1.8, 'loop.finished', 'CO', 'lp_co_01', 'index ready');

// Profilers: 1,047 researchers in four shards; the identity hints add up to the PRD §2 counts.
const shards = [
  { p: 'P1' as const, from: 'R0001', to: 'R0262', n: 262, a: 2.0, b: 38.4, dup: 3, ns: 1, stale: 6, cap: 71 },
  { p: 'P2' as const, from: 'R0263', to: 'R0524', n: 262, a: 2.1, b: 41.0, dup: 4, ns: 0, stale: 5, cap: 68 },
  { p: 'P3' as const, from: 'R0525', to: 'R0786', n: 262, a: 2.1, b: 35.2, dup: 2, ns: 1, stale: 7, cap: 70 },
  { p: 'P4' as const, from: 'R0787', to: 'R1047', n: 261, a: 2.2, b: 44.6, dup: 2, ns: 0, stale: 5, cap: 66 },
];
assert(shards.reduce((s, x) => s + x.n, 0) === 1047, 'shards cover 1,047 researchers');
assert(shards.reduce((s, x) => s + x.stale, 0) === 23, '23 stale profiles');
assert(shards.reduce((s, x) => s + x.cap, 0) === 275, '275 capacity notes');
assert(shards.reduce((s, x) => s + x.ns, 0) === 2, '2 namesake pairs');
for (const [i, s] of shards.entries()) {
  const loop = `lp_${s.p.toLowerCase()}_01`;
  emit(s.a, 'loop.started', s.p, loop, `shard ${i + 1} of 4: ${s.from}–${s.to}`);
  work(s.p, loop, s.a + 0.1, s.b - 0.4, [
    [`read_shard ${s.from}–${s.to}`, `${s.n} researchers read`],
    ['normalize_names', `${s.n} names normalized (Latin and Cyrillic)`],
    ['find_identity_hints', `${s.dup} possible duplicates · ${s.ns} namesake pair${s.ns === 1 ? '' : 's'}`],
    ['read_status_and_notes', `${s.stale} stale · ${s.cap} capacity notes`],
  ], 6.5);
  emit(s.b - 0.3, 'profiles.ready', s.p, loop, `${s.n} profiles · ${s.dup} possible duplicates · ${s.ns} namesake pair${s.ns === 1 ? '' : 's'} · ${s.stale} stale`, { shard: i + 1, profiles: s.n });
  emit(s.b, 'loop.finished', s.p, loop, 'shard done');
}

// Industry Analyst: 489 challenges in three streamed batches.
const batches = [
  { at: 19.8, n: 163, research: 124, not: 32, none: 7 },
  { at: 36.1, n: 163, research: 123, not: 33, none: 7 },
  { at: 52.3, n: 163, research: 124, not: 31, none: 8 },
];
assert(batches.reduce((s, b) => s + b.n, 0) === 489, 'batches cover 489 challenges');
batches.forEach((b) => assert(b.research + b.not + b.none === b.n, 'batch classes add up'));
assert(batches.reduce((s, b) => s + b.not + b.none, 0) === noMatch.total, 'turned-away total matches the batches');
assert(batches.reduce((s, b) => s + b.not, 0) === noMatch.byClass[0].count, 'not_research total matches');
assert(noMatch.byReason.reduce((s, r) => s + r.count, 0) === noMatch.total, 'reasons add up to the turned-away total');
emit(2.0, 'loop.started', 'AN', 'lp_an_01', 'classify 489 challenges');
let prev = 2.1;
for (const [i, b] of batches.entries()) {
  work('AN', 'lp_an_01', prev, b.at - 0.1, [[`read_challenges batch ${i + 1}`, `${b.n} challenges read`]], 5.5);
  emit(b.at, 'challenges.ready', 'AN', 'lp_an_01', `batch ${i + 1} of 3: ${b.research} research · ${b.not} not_research · ${b.none} no_uns_fit`, { batch: i + 1, ...b });
  prev = b.at + 0.1;
}
emit(52.4, 'loop.finished', 'AN', 'lp_an_01', '489 classified');

// Matchmaker: four pairs up front, a fifth when pair-4 is abandoned.
const shortlist = (s: number, loop: string, p: PairDraft) =>
  emit(s, 'pair.shortlisted', 'MM', loop, `${p.pairId}: ${p.researcherId} × ${p.challengeId}`, { pairId: p.pairId, researcherId: p.researcherId, challengeId: p.challengeId });
const pair = (id: string) => pairs.find((p) => p.pairId === id)!;
emit(44.8, 'loop.started', 'MM', 'lp_mm_01', 'match profiles to research challenges');
work('MM', 'lp_mm_01', 44.9, 61.6, [['read_identity_hints', '11 possible duplicates · 2 namesake pairs · 23 stale'], ['find_candidates research challenges', '371 challenges, 1,047 profiles']], 6);
shortlist(61.7, 'lp_mm_01', pair('pair-1'));
work('MM', 'lp_mm_01', 61.8, 66.1, [], 4.3);
shortlist(66.2, 'lp_mm_01', pair('pair-2'));
shortlist(68.4, 'lp_mm_01', pair('pair-3'));
shortlist(70.9, 'lp_mm_01', pair('pair-4'));
emit(70.9, 'loop.finished', 'MM', 'lp_mm_01', '4 pairs shortlisted');

// Writers.
const requests = new Map<string, ReviewRequest>();
const verdicts = new Map<string, Verdict>();
const outcome = new Map<string, { writtenAt?: number; abandonedAt?: number }>();

function writerTools(p: PairDraft): [string, string][] {
  const pubs = p.rounds[0].filter((c) => c.kind === 'authored').length;
  return [
    [`read_challenge ${p.challengeId}`, `${p.challengeId} · ${nameOf(p.companyId)}`],
    [`lookup_researcher ${p.researcherId}`, `${nameOf(p.researcherId)} · ${field(p.researcherId, 'faculty')}`],
    [`lookup_publications ${p.researcherId}`, `${pubs + 2} publications`],
    [`lookup_projects ${p.researcherId}`, 'projects and patents read'],
    [`lookup_company ${p.companyId}`, `${nameOf(p.companyId)} · ${field(p.companyId, 'employees')} employees`],
  ];
}

function writerLoop(w: ParticipantId, loopId: string, p: PairDraft, start: number) {
  const mine = holds.filter((h) => h.pairId === p.pairId);
  assert(mine.length === p.rounds.length, `${p.pairId} has one hold per round`);
  emit(start, 'loop.started', w, loopId, `${p.pairId}: ${p.researcherId} × ${p.challengeId}`, { pairId: p.pairId });
  work(w, loopId, start + 0.05, mine[0].start, writerTools(p));
  for (const [i, h] of mine.entries()) {
    const claims = p.rounds[i];
    const req: ReviewRequest = { reviewId: h.reviewId, writerId: w, pairId: p.pairId, round: h.round, claims };
    const v = verdictFor(req);
    requests.set(h.reviewId, req);
    verdicts.set(h.reviewId, v);
    const crLoop = `lp_cr_${h.reviewId.slice(3)}`;
    emit(h.start, 'interception.started', w, loopId, `write_proposal held (${claims.length} claims)`, { reviewId: h.reviewId, pairId: p.pairId, round: h.round });
    emit(h.start + 0.02, 'claim.review.requested', w, loopId, `${h.reviewId} · round ${h.round} · ${claims.length} claims`, req);
    emit(h.start + 0.05, 'loop.started', 'CR', crLoop, `${h.reviewId}: ${w} · ${p.pairId} round ${h.round}`, { reviewId: h.reviewId });
    emit(h.start + 0.4, 'checks.code.completed', 'CR', crLoop, `C1–C9 run on ${claims.length} claims`);
    emit(h.start + 0.6, 'inference.started', 'CR', crLoop, 'C10 support check');
    emit(h.end - 0.6, 'inference.completed', 'CR', crLoop, `${tokens().toLocaleString('en')} tokens`);
    const failed = [...new Set(v.claims.map((c) => c.n))];
    const failSummary = failed.map((n) => `claim ${n} (${v.claims.filter((c) => c.n === n).map((c) => `${c.check} ${checkNames[c.check].toLowerCase()}`).join(', ')})`).join('; ');
    emit(h.end - 0.05, 'claim.review.completed', 'CR', crLoop, v.pass ? `${h.reviewId} pass` : `${h.reviewId} fail: ${failSummary}`, v);
    emit(h.end - 0.03, 'loop.finished', 'CR', crLoop, v.pass ? 'pass' : 'fail');
    const next = mine[i + 1];
    emit(h.end, 'interception.finished', w, loopId,
      v.pass ? 'released → write_proposal runs' : next ? 'returned → inference (revising)' : 'returned → inference (round cap: drop failing claims)',
      { reviewId: h.reviewId, next: v.pass ? 'function_call' : 'inference' });
    if (!v.pass && next) {
      work(w, loopId, h.end + 0.02, next.start, [[`lookup_researcher ${p.researcherId}`, 'identity hints re-read']], 7);
    }
  }
  const last = mine[mine.length - 1];
  if (verdicts.get(last.reviewId)!.pass) {
    emit(last.end + 0.05, 'function_call.started', w, loopId, 'write_proposal');
    emit(last.end + 0.45, 'function_call.completed', w, loopId, 'proposal rendered');
    emit(last.end + 0.5, 'proposal.written', w, loopId, `out/proposals/${p.pairId}.md written`, { pairId: p.pairId });
    outcome.set(p.pairId, { writtenAt: last.end + 0.5 });
  } else {
    assert(p.abandoned, `${p.pairId} failed its last round, so it must be abandoned`);
    emit(last.end + 0.4, 'pair.abandoned', w, loopId, `${p.pairId} abandoned after ${mine.length} rounds`, { pairId: p.pairId, reason: p.abandoned.reason });
    emit(last.end + 0.5, 'replacement.requested', w, loopId, `Matchmaker asked to replace ${p.pairId}`, { pairId: p.pairId });
    outcome.set(p.pairId, { abandonedAt: last.end + 0.4 });
  }
  emit(last.end + 0.7, 'loop.finished', w, loopId, `${p.pairId} done`);
  return last.end + 0.7;
}

writerLoop('W1', 'lp_w1_01', pair('pair-1'), 62.0);
writerLoop('W2', 'lp_w2_01', pair('pair-2'), 66.5);
writerLoop('W3', 'lp_w3_01', pair('pair-3'), 68.8);
const w1Free = writerLoop('W1', 'lp_w1_02', pair('pair-4'), 116.0);
emit(w1Free + 0.3, 'loop.started', 'MM', 'lp_mm_02', 'replace pair-4 (C009-CH2)');
work('MM', 'lp_mm_02', w1Free + 0.4, 186.2, [['find_candidates C009-CH2', '3 profiles; R0068 excluded (left)']], 5.5);
shortlist(186.3, 'lp_mm_02', pair('pair-5'));
emit(186.3, 'loop.finished', 'MM', 'lp_mm_02', 'pair-5 shortlisted');
const end = writerLoop('W1', 'lp_w1_03', pair('pair-5'), 186.8);
emit(end + 0.5, 'run.completed', 'CO', undefined, '4 proposals written · 1 pair abandoned · 9 holds');

// ---------- what the endpoints serve ----------
lines.sort((a, b) => a.t.localeCompare(b.t) || a.seq - b.seq);
export const trace: TraceLine[] = lines.map(({ seq: _seq, ...l }) => l);

// The PRD §8.3 order: while W2 is held, W1 keeps calling tools.
const rv01 = holds[0];
assert(lines.some((l) => l.producer === 'W1' && l.type === 'function_call.started' && l.t > iso(rv01.start) && l.t < iso(rv01.end)), 'W1 calls a tool during W2’s first hold');
assert(verdicts.get('rv_01')!.claims.some((c) => c.n === 3 && c.check === 'C3'), 'rv_01 fails claim 3 on C3');
assert(verdicts.get('rv_02')!.claims.some((c) => c.n === 2 && c.check === 'C4'), 'rv_02 fails claim 2 on C4');
assert(['rv_06', 'rv_07', 'rv_08'].every((r) => verdicts.get(r)!.claims.every((c) => c.check === 'C5')), 'pair-4 fails only on C5');
assert([...verdicts.values()].filter((v) => v.pass).length === 4, '4 holds pass');

function listItem(p: PairDraft): ProposalListItem {
  const o = outcome.get(p.pairId)!;
  return {
    pairId: p.pairId, title: p.sections.title, writerId: p.writerId, researcherId: p.researcherId, researcherName: nameOf(p.researcherId),
    companyId: p.companyId, companyName: nameOf(p.companyId), challengeId: p.challengeId, format: p.format,
    status: p.abandoned ? 'abandoned' : 'written',
    rounds: holds.filter((h) => h.pairId === p.pairId).map((h) => h.reviewId),
    ...(o.writtenAt != null ? { writtenAt: iso(o.writtenAt) } : {}),
    ...(o.abandonedAt != null ? { abandonedAt: iso(o.abandonedAt) } : {}),
  };
}

const byTime = (a: ProposalListItem, b: ProposalListItem) => (a.writtenAt ?? a.abandonedAt ?? '').localeCompare(b.writtenAt ?? b.abandonedAt ?? '');
export const proposalList = (): ProposalListItem[] => pairs.map(listItem).sort(byTime);

export function proposal(pairId: string): Proposal | undefined {
  const p = pairs.find((x) => x.pairId === pairId);
  if (!p) return undefined;
  return {
    ...listItem(p), sections: p.sections, claims: p.rounds[p.rounds.length - 1],
    ...(p.abandoned ? { abandonReason: p.abandoned.reason, replacedBy: p.abandoned.replacedBy } : {}),
  };
}

export function summary(): Summary {
  const items = proposalList();
  const written = items.filter((i) => i.status === 'written');
  assert(new Set(written.map((i) => i.researcherId)).size === written.length, 'no researcher repeated across proposals (F2)');
  assert(new Set(written.map((i) => i.challengeId)).size === written.length, 'no challenge repeated across proposals (F2)');
  const counts = new Map<CheckId, number>();
  for (const v of verdicts.values()) for (const c of v.claims) counts.set(c.check, (counts.get(c.check) ?? 0) + 1);
  const writers: ParticipantId[] = ['W1', 'W2', 'W3'];
  return {
    mode: 'replay', source: 'out/trace.jsonl', researchers: 1047, challenges: 489,
    proposed: written.map((i) => ({ pairId: i.pairId, researcherId: i.researcherId, researcherName: i.researcherName, challengeId: i.challengeId, companyName: i.companyName, format: i.format })),
    abandoned: pairs.filter((p) => p.abandoned).map((p) => ({
      pairId: p.pairId, researcherId: p.researcherId, researcherName: nameOf(p.researcherId), challengeId: p.challengeId,
      reason: p.abandoned!.reason, replacedBy: p.abandoned!.replacedBy, lastReview: holds.filter((h) => h.pairId === p.pairId).at(-1)!.reviewId,
    })),
    failedChecks: [...counts].map(([check, count]) => ({ check, count })).sort((a, b) => b.count - a.count || Number(a.check.slice(1)) - Number(b.check.slice(1))),
    holdsPerWriter: writers.map((w) => {
      const vs = [...verdicts.values()].filter((v) => v.writerId === w);
      return { writerId: w, holds: vs.length, failed: vs.filter((v) => !v.pass).length };
    }),
    noMatch: {
      total: noMatch.total, byClass: noMatch.byClass, byReason: noMatch.byReason,
      items: noMatch.items.map((i) => {
        const ch = recordById.get(i.challengeId)!;
        return { ...i, title: ch.title, companyName: nameOf(ch.record.company_id as string) };
      }),
    },
  };
}

export const record = (id: string) => recordById.get(id);
export type { Claim };
