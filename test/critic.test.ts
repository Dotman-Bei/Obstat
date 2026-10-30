// The Critic against the real dataset. The demo pair is R0539 with Terramap Subotica's GPR challenge (C062-CH1).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { loadConfig } from '../src/config.ts';
import type { Claim, ReviewRequest, WriteProposalInput } from '../src/contract.ts';
import { notesAboutOther } from '../src/critic/checks/c5.ts';
import { review, type CriticDeps } from '../src/critic/critic.ts';
import { buildIdentities } from '../src/data/identities.ts';
import { loadIndex } from '../src/data/index.ts';
import type { ChallengeClass } from '../src/state.ts';

const { dataDir } = loadConfig();
const skip = existsSync(dataDir) ? false : `dataset not found at ${dataDir}`;
const ix = skip ? null! : loadIndex(dataDir);
const hints = skip ? null! : buildIdentities(ix);

function deps(over: Partial<CriticDeps> = {}): CriticDeps {
  const challengeClass = new Map<string, ChallengeClass>([['C062-CH1', { cls: 'research', reason: 'Automatic interpretation of GPR B-scans is an open signal-processing problem.', ids: ['C062-CH1'] }]]);
  return { ix, hints, challengeClass, commitments: new Map(), today: () => new Date('2026-10-31T09:00:00Z'), ...over };
}

const demoClaims: Claim[] = [
  { n: 1, kind: 'authored', text: 'R0539 developed machine-learning hyperbola detection for GPR B-scans.', researcherId: 'R0539', ids: ['SYN-PUB-01827'] },
  { n: 2, kind: 'project', text: 'R0539 took part in SYN-PRJ-0319.', researcherId: 'R0539', ids: ['SYN-PRJ-0319'] },
  { n: 3, kind: 'authored', text: 'Jeremić Mirjana published on hyperbola detection in GPR data.', researcherId: 'R0139', ids: ['SYN-PUB-01827'] },
  { n: 4, kind: 'available_for', text: 'R0539 is open to supervising an industrial PhD: "industrial PhD supervision – candidates with engineering or geomatics background".', researcherId: 'R0539', ids: ['R0539'] },
  { n: 5, kind: 'challenge', text: 'Terramap operators interpret B-scans by eye and miss about one in five hyperbolas.', researcherId: null, ids: ['C062-CH1'] },
];

function proposal(claims: Claim[], over: Partial<WriteProposalInput> = {}): WriteProposalInput {
  return {
    pairId: 'pair-2',
    researcherIds: ['R0539'],
    companyId: 'C062',
    challengeId: 'C062-CH1',
    format: 'industrial_phd',
    sections: {
      title: 'Automatic hyperbola picking in urban GPR surveys',
      problem: 'Terramap operators read B-scans by eye and miss about one in five buried utilities {5}.',
      researchQuestions: ['Can a detector trained on labelled B-scans match operator recall on Subotica roads?'],
      plan: 'Year 1 | Label 2,000 B-scans from Terramap archives | Labelled set\nYear 2 | Train and test the detector {1} | Detector and paper\nYear 3 | Field trial on live surveys | Thesis',
      eachSideBrings: { company: 'Survey archives and field crews.', faculty: 'Hyperbola detection research {1} and supervision {4}.' },
      whyThisPair: 'The method in SYN-PUB-01827 targets the exact step Terramap does by hand {1}.',
      agreedUpFront: 'Terramap keeps operational data on its premises; results may be published after review.',
    },
    claims,
    ...over,
  };
}

const request = (p: WriteProposalInput, round = 1): ReviewRequest => ({ reviewId: `rv_0${round}`, writerId: 'W2', pairId: p.pairId, round, callId: 'call_1', proposal: p });

test('the demo pair fails on claim 3 with C2 and C3, as PRD §9 shows', { skip }, async () => {
  const v = await review(request(proposal(demoClaims)), deps());
  assert.equal(v.pass, false);
  assert.deepEqual(v.claims.map((f) => `${f.n}:${f.check}`), ['3:C2', '3:C3']);
  const c3 = v.claims.find((f) => f.check === 'C3')!;
  assert.equal(c3.detail, 'SYN-PUB-01827 is attributed to R0539. R0139 and R0539 look like one person (reversed name order, same faculty). Cite R0539 or state both IDs.');
  assert.equal(v.checks.find((c) => c.check === 'C2' && c.target === 3)!.mark, 'R0539');
});

test('the revised demo pair passes and commits R0539 to the pair', { skip }, async () => {
  const fixed = demoClaims.map((c) => (c.n === 3 ? { ...c, text: 'Mirjana Jeremić published on hyperbola detection in GPR data.', researcherId: 'R0539' } : c));
  const d = deps();
  const v = await review(request(proposal(fixed), 2), d);
  assert.deepEqual(v.claims, []);
  assert.equal(v.pass, true);
  assert.deepEqual(d.commitments.get('R0539'), ['pair-2']);
});

test('stating both IDs of one person passes attribution', { skip }, async () => {
  const both = demoClaims.map((c) => (c.n === 3 ? { ...c, ids: ['SYN-PUB-01827', 'R0539'] } : c));
  const v = await review(request(proposal(both)), deps());
  assert.equal(v.pass, true, JSON.stringify(v.claims));
});

test('a namesake\'s paper fails C2 and C4, naming the other person', { skip }, async () => {
  const claims: Claim[] = [{ n: 1, kind: 'authored', text: 'Nina Mamužić published on pomology.', researcherId: 'R0128', ids: ['SYN-PUB-09418'] }];
  const v = await review(request(proposal(claims, { researcherIds: ['R0128'] })), deps());
  assert.deepEqual(v.claims.filter((f) => f.n === 1).map((f) => f.check), ['C2', 'C4']);
  const c4 = v.claims.find((f) => f.check === 'C4')!;
  assert.match(c4.detail, /SYN-PUB-09418 belongs to R0881 Nina Mamužić \(Faculty of Agriculture\)/);
});

test('C5: a researcher who left is not available', { skip }, async () => {
  const claims: Claim[] = [{ n: 1, kind: 'available_for', text: 'R0068 is open to "joint projects".', researcherId: 'R0068', ids: ['R0068'] }];
  const v = await review(request(proposal(claims, { researcherIds: ['R0068'] })), deps());
  assert.match(v.claims.find((f) => f.check === 'C5')!.detail, /Left the University of Novi Sad in March 2026/);
});

test('C5: an emeritus is available for consulting only', { skip }, async () => {
  const consulting: Claim[] = [{ n: 1, kind: 'available_for', text: 'R0079 is available for consulting: "consulting".', researcherId: 'R0079', ids: ['R0079'] }];
  const ok = await review(request(proposal(consulting, { researcherIds: ['R0079'] })), deps());
  assert.ok(ok.checks.find((c) => c.check === 'C5')!.pass);
  const phd: Claim[] = [{ n: 1, kind: 'available_for', text: 'R0881 could co-supervise a doctoral student, being "willing to consult".', researcherId: 'R0881', ids: ['R0881'] }];
  const no = await review(request(proposal(phd, { researcherIds: ['R0881'] })), deps());
  assert.ok(!no.checks.find((c) => c.check === 'C5')!.pass);
});

test('C5: the role needs a quote from the researcher\'s own words', { skip }, async () => {
  const run = async (text: string, rid = 'R0539') => (await review(request(proposal([{ n: 1, kind: 'available_for', text, researcherId: rid, ids: [rid] }], { researcherIds: [rid] })), deps())).checks.find((c) => c.check === 'C5')!;
  assert.match((await run('R0539 is open to an industrial PhD.')).detail!, /^Quote the words/);
  assert.match((await run('R0539 is open to "leading a startup".')).detail!, /is not in R0539's open_to or notes/);
  assert.match((await run('R0539 offers contract research: "industrial PhD supervision – candidates".')).detail!, /offers contract research/);
  assert.ok((await run('R0539 has room for another PhD candidate: "capacity for a third industrial PhD candidate exists from mid-2025 onward".')).pass);
  // R0128's note describes Vesna Mitrović, so it cannot speak for R0128
  const r0128 = ix.researchers.get('R0128')!.notes;
  const quote = r0128.slice(r0128.indexOf('partnerships'), r0128.indexOf('partnerships') + 40);
  assert.match((await run(`R0128 welcomes "${quote}".`, 'R0128')).detail!, /notes describe Vesna Mitrović/);
});

test('C5: a claim relying on a past year fails', { skip }, async () => {
  const claims: Claim[] = [{ n: 1, kind: 'available_for', text: 'R0539 can start a joint project in spring 2025: "joint projects – smart city underground asset management".', researcherId: 'R0539', ids: ['R0539'] }];
  const v = await review(request(proposal(claims)), deps());
  assert.match(v.claims.find((f) => f.check === 'C5')!.detail, /relies on 2025/);
});

test('only R0128 and R0191 have notes about someone else', { skip }, () => {
  const found = [...ix.researchers.values()].filter((r) => notesAboutOther(r, ix)).map((r) => `${r.id}:${notesAboutOther(r, ix)}`);
  assert.deepEqual(found, ['R0128:Vesna Mitrović', 'R0191:Ninkov']);
});

test('C6: commitments past the note\'s limit fail', { skip }, async () => {
  const claims: Claim[] = [{ n: 1, kind: 'available_for', text: 'R0001 is open to "joint projects with companies requiring formal correctness guarantees".', researcherId: 'R0001', ids: ['R0001'] }];
  const p = proposal(claims, { researcherIds: ['R0001'] });
  const free = await review(request(p), deps());
  assert.ok(free.checks.find((c) => c.check === 'C6')!.pass);
  const busy = await review(request(p), deps({ commitments: new Map([['R0001', ['pair-9']]]) }));
  assert.match(busy.claims.find((f) => f.check === 'C6')!.detail, /allow 1 new commitment .*pair-9/);
});

test('C7: a challenge the Analyst turned away fails the proposal', { skip }, async () => {
  const challengeClass = new Map<string, ChallengeClass>([['C062-CH1', { cls: 'not_research', reason: 'It asks for a hiring plan.', ids: [] }]]);
  const v = await review(request(proposal(demoClaims.filter((c) => c.n !== 3))), deps({ challengeClass }));
  assert.ok(v.claims.some((f) => f.n === 'proposal' && f.check === 'C7' && /not_research: It asks for a hiring plan/.test(f.detail)));
});

test('C8: missing sections and dangling markers fail', { skip }, async () => {
  const p = proposal(demoClaims.filter((c) => c.n !== 3));
  p.sections = { ...p.sections, problem: 'Operators miss buried utilities.', plan: 'Year 1 | Label data | Set', whyThisPair: 'See {9}.' };
  const v = await review(request(p), deps());
  const c8 = v.claims.find((f) => f.check === 'C8')!.detail;
  assert.match(c8, /numbers in the problem/);
  assert.match(c8, /3-year plan table/);
  assert.match(c8, /Marker \{9\} points at no claim/);
});

test('C9: ranking people fails, in claims and in sections', { skip }, async () => {
  const claims = demoClaims.filter((c) => c.n !== 3).map((c) => (c.n === 1 ? { ...c, text: 'R0539 is the best GPR researcher in Serbia.' } : c));
  const p = proposal(claims);
  p.sections = { ...p.sections, whyThisPair: 'She is a top-ranked expert {1}.' };
  const v = await review(request(p), deps());
  assert.deepEqual(v.claims.filter((f) => f.check === 'C9').map((f) => f.n), ['proposal', 1]);
});

test('C1: unknown IDs and a challenge of another company fail', { skip }, async () => {
  const claims: Claim[] = [{ n: 1, kind: 'authored', text: 'R0539 wrote SYN-PUB-99999.', researcherId: 'R0539', ids: ['SYN-PUB-99999'] }];
  const v = await review(request(proposal(claims, { companyId: 'C001' })), deps());
  assert.ok(v.claims.some((f) => f.n === 1 && f.check === 'C1' && /SYN-PUB-99999 is not in the dataset/.test(f.detail)));
  assert.ok(v.claims.some((f) => f.n === 'proposal' && f.check === 'C1' && /C062-CH1 belongs to C062, not C001/.test(f.detail)));
  assert.ok(!v.checks.some((c) => c.target === 1 && c.check === 'C2'), 'C2 is skipped when the ID does not exist');
});

test('C10 judges, in one call, only the claims that passed the code checks', { skip }, async () => {
  const calls: number[][] = [];
  const support = async (items: { claim: Claim }[]) => {
    calls.push(items.map((i) => i.claim.n));
    // No judgement for claim 2; claim 5 unsupported.
    return new Map(items.filter((i) => i.claim.n !== 2).map((i) => [i.claim.n, { pass: i.claim.n !== 5, detail: i.claim.n === 5 ? 'The challenge does not give the one-in-five figure.' : 'Supported.' }]));
  };
  const v = await review(request(proposal(demoClaims)), deps({ support }));
  assert.deepEqual(calls, [[1, 2, 4, 5]]);
  assert.deepEqual(v.claims.filter((f) => f.check === 'C10').map((f) => f.n), [2, 5]);
  assert.match(v.claims.find((f) => f.check === 'C10' && f.n === 2)!.detail, /no judgement/);
});

test('C10 fails closed when the model call fails', { skip }, async () => {
  const support = async () => { throw new Error('model unavailable'); };
  const v = await review(request(proposal(demoClaims)), deps({ support }));
  assert.deepEqual(v.claims.filter((f) => f.check === 'C10').map((f) => f.n), [1, 2, 4, 5]);
  assert.match(v.claims.find((f) => f.check === 'C10')!.detail, /could not run \(model unavailable\)/);
});

test('C3 at proposal level: researcherIds must name the canonical record', { skip }, async () => {
  const fixed = demoClaims.map((c) => (c.n === 3 ? { ...c, researcherId: 'R0539' } : c));
  const v = await review(request(proposal(fixed, { researcherIds: ['R0139'] })), deps());
  assert.deepEqual(v.claims.map((f) => `${f.n}:${f.check}`), ['proposal:C3']);
  assert.match(v.claims[0].detail, /R0139 is a second record of R0539/);
});

test('C8: marker lists count, and a pasted paragraph is not a claim', { skip }, async () => {
  const listed = proposal(demoClaims.filter((c) => c.n !== 3));
  listed.sections = { ...listed.sections, whyThisPair: 'The method targets the step Terramap does by hand {1, 5}.' };
  assert.ok((await review(request(listed), deps())).checks.find((c) => c.check === 'C8')!.pass);
  const dangling = proposal(demoClaims.filter((c) => c.n !== 3));
  dangling.sections = { ...dangling.sections, whyThisPair: 'See {1, 9}.' };
  assert.match((await review(request(dangling), deps())).claims.find((f) => f.check === 'C8')!.detail, /Marker \{9\} points at no claim/);
  const pasted = proposal(demoClaims.filter((c) => c.n !== 3).map((c) => (c.n === 5 ? { ...c, text: 'x'.repeat(401) } : c)));
  assert.match((await review(request(pasted), deps())).claims.find((f) => f.check === 'C8')!.detail, /Claim 5 is longer than 400 characters/);
});
