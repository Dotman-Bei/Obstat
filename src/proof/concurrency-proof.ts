// npm run proof [trace]: the concurrency proof (PRD T7), computed from out/trace.jsonl alone. Prints the most loops that
// ran at once, the peaks for writers and profilers, and for each hold which other loops were active and what they did
// while the writer waited. Exits non-zero when a PRD check fails.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TraceLine } from '../trace.ts';

interface Loop { loopId: string; producer: string; start: number; end: number; label: string }
interface Hold { reviewId: string; writer: string; loopId: string; pairId: string; round: number; start: number; end: number; result: string }

export interface Proof {
  peak: { n: number; at: number; loops: Loop[] };
  writerPeak: number;
  profilerPeak: number;
  holds: (Hold & { others: Loop[]; work: TraceLine[] })[];
  checks: { name: string; pass: boolean }[];
}

const ms = (l: TraceLine) => Date.parse(l.t);

function peakOf(loops: Loop[]): { n: number; at: number } {
  const edges = loops.flatMap((l) => [{ t: l.start, d: 1 }, { t: l.end, d: -1 }]).sort((a, b) => a.t - b.t || a.d - b.d);
  let n = 0;
  const best = { n: 0, at: 0 };
  for (const e of edges) {
    n += e.d;
    if (n > best.n) Object.assign(best, { n, at: e.t });
  }
  return best;
}

export function prove(lines: TraceLine[]): Proof {
  const end = Math.max(...lines.map(ms));
  const loops = new Map<string, Loop>();
  for (const l of lines) {
    if (l.type === 'loop.started' && l.loopId) loops.set(l.loopId, { loopId: l.loopId, producer: l.producer, start: ms(l), end, label: l.summary });
    if (l.type === 'loop.finished' && l.loopId && loops.has(l.loopId)) loops.get(l.loopId)!.end = ms(l);
  }
  const all = [...loops.values()];

  const holds: Hold[] = [];
  const open = new Map<string, Hold>();
  for (const l of lines) {
    const d = (l.data ?? {}) as Record<string, any>;
    if (l.type === 'interception.started' && d.reviewId && l.loopId) open.set(l.loopId, { reviewId: d.reviewId, writer: l.producer, loopId: l.loopId, pairId: d.pairId, round: d.round, start: ms(l), end, result: d.malformed ? 'rejected before review (malformed arguments)' : 'no verdict' });
    if (l.type === 'claim.review.completed' && d.reviewId) {
      const h = [...open.values()].find((x) => x.reviewId === d.reviewId);
      if (h) h.result = d.pass ? 'pass' : `fail: ${(d.claims as { n: number | string; check: string }[]).map((f) => `${f.n === 'proposal' ? 'proposal' : `claim ${f.n}`} ${f.check}`).join(', ')}`;
    }
    if (l.type === 'interception.finished' && l.loopId && open.has(l.loopId)) {
      const h = open.get(l.loopId)!;
      h.end = ms(l);
      holds.push(h);
      open.delete(l.loopId);
    }
  }

  const overlapping = (a: { start: number; end: number }, b: Loop) => b.start < a.end && b.end > a.start;
  const peak = peakOf(all);
  const detailed = holds.map((h) => ({
    ...h,
    others: all.filter((l) => l.loopId !== h.loopId && l.producer !== 'CR' && overlapping(h, l)),
    work: lines.filter((l) => l.producer !== h.writer && l.producer !== 'CR' && ['function_call.started', 'inference.started', 'interception.started'].includes(l.type) && ms(l) > h.start && ms(l) < h.end),
  }));
  const writerPeak = peakOf(all.filter((l) => /^W\d/.test(l.producer))).n;
  const profilerPeak = peakOf(all.filter((l) => /^P\d/.test(l.producer))).n;
  return {
    peak: { ...peak, loops: all.filter((l) => l.start <= peak.at && l.end > peak.at) },
    writerPeak,
    profilerPeak,
    holds: detailed,
    checks: [
      { name: 'at least 3 writer loops ran at once (T7)', pass: writerPeak >= 3 },
      { name: 'at least 2 profiler loops ran at once (T7)', pass: profilerPeak >= 2 },
      { name: 'at least 2 other writer loops were active during one hold (PRD §17)', pass: detailed.some((h) => h.others.filter((o) => /^W\d/.test(o.producer)).length >= 2) },
    ],
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const path = process.argv[2] ?? 'out/trace.jsonl';
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TraceLine);
  const p = prove(lines);
  const clock = (t: number) => new Date(t).toISOString().slice(11, 21);
  const secs = (a: number, b: number) => `${((b - a) / 1000).toFixed(1)} s`;
  console.log(`Concurrency proof from ${path} (${lines.length} trace lines)\n`);
  console.log(`Most loops at once: ${p.peak.n}, at ${clock(p.peak.at)}: ${p.peak.loops.map((l) => `${l.producer} (${l.label})`).join(', ')}`);
  console.log(`Most writer loops at once: ${p.writerPeak}. Most profiler loops at once: ${p.profilerPeak}.\n`);
  for (const h of p.holds) {
    console.log(`${h.reviewId}  ${h.writer} held ${secs(h.start, h.end)} (${clock(h.start)}–${clock(h.end)}), ${h.pairId} round ${h.round}: ${h.result}`);
    console.log(`  active meanwhile: ${h.others.map((o) => `${o.producer} ${o.label}`).join('; ') || 'nothing else'}`);
    const work = h.work.map((w) => `${w.producer} ${w.type === 'function_call.started' ? w.summary.split(' ')[0] : w.type === 'interception.started' ? 'held' : 'model turn'}`);
    if (work.length) console.log(`  work done meanwhile: ${work.join(', ')}`);
  }
  console.log('');
  for (const c of p.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}`);
  process.exit(p.checks.every((c) => c.pass) ? 0 : 1);
}
