// npm run replay must reproduce the committed run: every model call answered from out/recording.jsonl, and the
// same proposals word for word. This fails when a change alters what the agents are sent (a prompt, a gate message,
// a dossier), which would leave the committed run unreplayable.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { loadRecording, replayModels, type ReplayStats } from '../src/replay/replay-runner.ts';
import { runObstat } from '../src/runtime.ts';

const { dataDir } = loadConfig();
const committed = 'out';
const skip = !existsSync(dataDir) ? 'dataset not found' : !existsSync(join(committed, 'recording.jsonl')) ? 'no committed recording' : false;

const proposals = (dir: string) => readdirSync(join(dir, 'proposals')).filter((f) => f.endsWith('.json')).sort().map((f) => {
  const { writtenAt: _w, writerId: _r, verdict, ...p } = JSON.parse(readFileSync(join(dir, 'proposals', f), 'utf8'));
  return JSON.stringify({ ...p, pass: verdict.pass });
});

test('the committed run replays with no key and no misses, to the same proposals', { skip, timeout: 120_000 }, async () => {
  const run = JSON.parse(readFileSync(join(committed, 'run.json'), 'utf8'));
  const started = readFileSync(join(committed, 'trace.jsonl'), 'utf8').split('\n').map((l) => (l.trim() ? JSON.parse(l) : null)).find((l) => l?.type === 'run.started');
  const stats: ReplayStats = { served: 0, missed: 0, misses: [] };
  const outDir = mkdtempSync(join(tmpdir(), 'obstat-replay-'));
  const { reason } = await runObstat({
    demo: run.stats.demo,
    print: false,
    log: () => {},
    today: new Date(run.stats.startedAt),
    models: replayModels(loadRecording(join(committed, 'recording.jsonl')), { paceMs: 20 }, stats),
    config: { outDir, models: started.data.models, callsPerMinute: 1_000_000, maxConcurrentCalls: 50 },
  });
  assert.equal(reason, 'run complete');
  assert.equal(stats.missed, 0, `requests with no recorded answer: ${stats.misses.length}`);
  assert.equal(stats.served, run.stats.calls);
  assert.deepEqual(proposals(outDir), proposals(committed));
});
