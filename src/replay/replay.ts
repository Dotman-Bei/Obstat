// npm run replay: runs Obstat again with no API key, every model call answered from the committed run's recording.
// It writes to out-replay/ (the committed out/ is never touched), then checks the replay against the committed run:
// the same proposals, word for word, and the concurrency proof on the new trace.
//   --from <dir>   the recorded run (default: out)
//   --to <dir>     where the replay writes (default: out-replay)
//   --pace <ms>    delay before each recorded answer, so loops overlap as they did live (default: 300)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { prove } from '../proof/concurrency-proof.ts';
import { runObstat } from '../runtime.ts';
import type { TraceLine, WriteProposalInput } from '../contract.ts';
import { loadRecording, replayModels, type ReplayStats } from './replay-runner.ts';

const warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('mozaik cloud:')) return;
  warn(...args);
};

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const from = resolve(arg('--from', 'out'));
const to = resolve(arg('--to', 'out-replay'));
const paceMs = Number(arg('--pace', '300'));
if (from === to) {
  console.error('The replay must write somewhere other than the run it replays.');
  process.exit(1);
}
for (const f of ['recording.jsonl', 'run.json', 'trace.jsonl']) {
  if (!existsSync(join(from, f))) {
    console.error(`Missing ${join(from, f)}: replay needs a run made by npm start.`);
    process.exit(1);
  }
}

const run = JSON.parse(readFileSync(join(from, 'run.json'), 'utf8')) as { stats: { startedAt: string; demo: boolean } };
const lines = readFileSync(join(from, 'trace.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TraceLine);
const models = (lines.find((l) => l.type === 'run.started')?.data as { models?: { small: string; mid: string; strong: string } } | undefined)?.models;
if (!models) {
  console.error(`${join(from, 'trace.jsonl')} has no run.started line naming the models.`);
  process.exit(1);
}

const recording = loadRecording(join(from, 'recording.jsonl'));
const stats: ReplayStats = { served: 0, missed: 0, misses: [] };
const recorded = [...recording.values()].reduce((a, q) => a + q.length, 0);
console.log(`Replaying ${from} (${recorded} recorded model calls, run of ${run.stats.startedAt.slice(0, 10)}${run.stats.demo ? ', demo pair seeded' : ''}) into ${to}. No API key is used.\n`);

const { reason, state } = await runObstat({
  demo: run.stats.demo,
  today: new Date(run.stats.startedAt),
  models: replayModels(recording, { paceMs }, stats),
  config: { outDir: to, models, callsPerMinute: 1_000_000, maxConcurrentCalls: 50 },
});

// The proposals must match the committed ones word for word (the time they were written aside).
const proposals = (dir: string) => new Map(
  existsSync(join(dir, 'proposals'))
    ? readdirSync(join(dir, 'proposals')).filter((f) => f.endsWith('.json')).map((f) => {
      const { writtenAt: _w, verdict, writerId: _r, ...p } = JSON.parse(readFileSync(join(dir, 'proposals', f), 'utf8')) as WriteProposalInput & { writtenAt: string; writerId: string; verdict: { pass: boolean } };
      return [p.pairId, JSON.stringify({ ...p, pass: verdict.pass })] as const;
    })
    : [],
);
const before = proposals(from);
const after = proposals(to);
const same = [...before].filter(([id, p]) => after.get(id) === p).map(([id]) => id);
const differ = [...before.keys()].filter((id) => after.has(id) && after.get(id) !== before.get(id));
const missing = [...before.keys()].filter((id) => !after.has(id));
const extra = [...after.keys()].filter((id) => !before.has(id));

const proof = prove(readFileSync(join(to, 'trace.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TraceLine));

console.log(`\n${reason}. ${state.shortlist.filter((p) => p.status === 'written').length} proposals written to ${join(to, 'proposals')}.`);
console.log(`Model calls answered from the recording: ${stats.served}; with no recorded answer: ${stats.missed}.`);
console.log(`Proposals identical to the committed run: ${same.length} of ${before.size}${same.length ? ` (${same.join(', ')})` : ''}.`);
if (differ.length) console.log(`  Different: ${differ.join(', ')}`);
if (missing.length) console.log(`  Not written in the replay: ${missing.join(', ')}`);
if (extra.length) console.log(`  Written only in the replay: ${extra.join(', ')}`);
for (const c of proof.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}`);

const ok = stats.missed === 0 && same.length === before.size && !extra.length && proof.checks.every((c) => c.pass);
console.log(ok ? '\nThe replay reproduces the committed run.' : '\nThe replay does not fully reproduce the committed run (see above).');
process.exit(ok ? 0 : 1);
