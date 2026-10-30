// A whole Obstat pass offline: the real dataset, Mozaik loops, gate, Critic, trace and reports, with a stand-in model.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { prove } from '../src/proof/concurrency-proof.ts';
import { runObstat } from '../src/runtime.ts';
import { fakeModel } from './fake-model.ts';

const skip = existsSync(loadConfig().dataDir) ? false : 'dataset not found';

test('npm start, offline: three proposals, the demo hold fails on C2/C3 and is revised, and the trace shows it in order', { skip, timeout: 120_000 }, async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'obstat-'));
  const logs: string[] = [];
  const { reason, state, stats } = await runObstat({
    demo: true,
    print: false,
    models: [fakeModel],
    log: (l) => logs.push(l),
    config: { outDir, models: { small: 'fake', mid: 'fake', strong: 'fake' }, callsPerMinute: 10_000, maxConcurrentCalls: 10, criticTimeoutMs: 10_000 },
  });
  assert.equal(reason, 'run complete', logs.join('\n'));
  const written = state.shortlist.filter((p) => p.status === 'written');
  assert.equal(written.length, 3, JSON.stringify(state.shortlist, null, 1));

  // F2: no researcher (as one person) and no challenge repeated
  const people = written.map((p) => state.identities.get(p.researcherIds[0])!.canonicalId);
  assert.equal(new Set(people).size, 3);
  assert.equal(new Set(written.map((p) => p.challengeId)).size, 3);

  // The demo pair is pair-2, written by W2 after a failed round
  const demo = state.shortlist.find((p) => p.pairId === 'pair-2')!;
  assert.deepEqual([demo.researcherIds[0], demo.challengeId, demo.writerId], ['R0539', 'C062-CH1', 'W2'], 'the written pair names the canonical record');

  const lines = readFileSync(join(outDir, 'trace.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const at = (pred: (l: any) => boolean, from = 0) => { const i = lines.findIndex((l, k) => k >= from && pred(l)); assert.ok(i >= 0, 'missing trace line'); return i; };
  const held = at((l) => l.producer === 'W2' && l.type === 'interception.started');
  assert.equal(lines[held].data.pairId, 'pair-2');
  const failed = at((l) => l.type === 'claim.review.completed' && l.data.pairId === 'pair-2' && !l.data.pass, held);
  assert.deepEqual(lines[failed].data.claims.filter((f: any) => f.n === 1).map((f: any) => f.check), ['C2', 'C3']);
  const back = at((l) => l.producer === 'W2' && l.type === 'interception.finished', failed);
  assert.equal(lines[back].data.nextStateId, 'inference');
  const passed = at((l) => l.type === 'claim.review.completed' && l.data.pairId === 'pair-2' && l.data.pass, back);
  at((l) => l.type === 'proposal.written' && l.data.pairId === 'pair-2', passed);

  // Every loop that started also finished; every Critic review is its own loop with its review ID
  const started = lines.filter((l) => l.type === 'loop.started').map((l) => l.loopId);
  const finished = new Set(lines.filter((l) => l.type === 'loop.finished').map((l) => l.loopId));
  assert.deepEqual(started.filter((id) => !finished.has(id)), []);
  assert.ok(lines.filter((l) => l.type === 'loop.started' && l.producer === 'CR').every((l) => /^rv_\d+$/.test(l.data.reviewId)));
  assert.ok(lines.every((l) => l.t && l.type && l.producer && typeof l.summary === 'string'));
  assert.ok(stats.maxConcurrentLoops >= 3, `peak ${stats.maxConcurrentLoops}`);
  assert.deepEqual(prove(lines).checks.filter((c) => !c.pass), [], 'npm run proof passes on this trace');

  // The free-tier budget: 4 profiler briefs, 3 Analyst batches, 1 shortlist, 3 writes plus the demo revision, and one
  // support check per review. Writers end after writing without another model turn.
  assert.equal(stats.calls, 4 + 3 + 1 + 4 + 4, `model calls: ${stats.calls}`);
  assert.equal(lines.filter((l) => l.type === 'loop.closing').length, 3);
  assert.ok(!lines.some((l) => l.type === 'interception.started' && !l.data?.reviewId), 'every hold line names its review');

  // Files: proposals with a claim table, summary, no-match, run snapshot, recording
  const files = readdirSync(join(outDir, 'proposals')).sort();
  assert.deepEqual(files.filter((f) => f.endsWith('.md')), written.map((p) => `${p.pairId}.md`).sort());
  const md = readFileSync(join(outDir, 'proposals', 'pair-2.md'), 'utf8');
  assert.match(md, /## Claims and evidence/);
  assert.ok(md.includes('**Researcher** Mirjana Jeremić (R0539)'), 'the revised proposal names the canonical record');
  assert.match(md, /\| 1 \| R0539 worked on SYN-PUB-01827\. \| authored \| R0539 \| SYN-PUB-01827 \| Pass/);
  assert.match(readFileSync(join(outDir, 'summary.md'), 'utf8'), /## Pairs proposed \(3\)/);
  assert.match(readFileSync(join(outDir, 'no-match.md'), 'utf8'), /## Not a research problem \(\d+\)/);
  assert.ok(JSON.parse(readFileSync(join(outDir, 'run.json'), 'utf8')).verdicts.length >= 4);
  assert.ok(readFileSync(join(outDir, 'recording.jsonl'), 'utf8').trim().split('\n').length > 10);
});
