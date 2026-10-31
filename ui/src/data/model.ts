// Everything the screens show is derived here from the trace lines on screen. No figure is stored twice.
import type { Ev } from './store.ts';
import type { ParticipantId, ReviewRequest, Verdict } from './types.ts';

export interface Loop { loopId: string; producer: ParticipantId; start: number; end: number | null; label: string; events: Ev[] }
export interface Hold {
  reviewId: string; writer: ParticipantId; loopId: string; pairId: string; round: number;
  start: number; end: number | null;
  request?: ReviewRequest; verdict?: Verdict;
  criticLoop?: string; reviewStart?: number; reviewEnd?: number | null;
}
export interface Point { producer: ParticipantId; loopId: string; t: number; kind: 'written' | 'abandoned'; pairId: string }

export interface Model {
  events: Ev[];
  loops: Loop[];
  holds: Hold[];
  points: Point[];
  horizon: number;
  counters: { running: number; holds: number; passed: number; failed: number; written: number; abandoned: number };
  peak: { n: number; at: number };
}

let memo: { key: string; model: Model } | null = null;

export function derive(events: Ev[], horizon: number): Model {
  const key = `${events.length}:${events.at(-1)?.i ?? -1}:${Math.round(horizon / 100)}`;
  if (memo?.key === key) return memo.model;

  const loops = new Map<string, Loop>();
  const holds = new Map<string, Hold>();
  const points: Point[] = [];
  for (const e of events) {
    if (e.loopId) {
      let l = loops.get(e.loopId);
      if (!l) { l = { loopId: e.loopId, producer: e.producer, start: e.ms, end: null, label: e.summary, events: [] }; loops.set(e.loopId, l); }
      l.events.push(e);
      if (e.type === 'loop.finished') l.end = e.ms;
    }
    const d = e.data as Record<string, unknown> | undefined;
    switch (e.type) {
      case 'interception.started':
        // A call the gate rejected as malformed never reached the Critic; it shows in the feed, not as a hold.
        if (!d?.reviewId || d.malformed) break;
        holds.set(d!.reviewId as string, { reviewId: d!.reviewId as string, writer: e.producer, loopId: e.loopId!, pairId: d!.pairId as string, round: d!.round as number, start: e.ms, end: null });
        break;
      case 'claim.review.requested': { const h = holds.get(d!.reviewId as string); if (h) h.request = d as unknown as ReviewRequest; break; }
      case 'loop.started':
        if (e.producer === 'CR' && d?.reviewId) { const h = holds.get(d.reviewId as string); if (h) { h.criticLoop = e.loopId; h.reviewStart = e.ms; h.reviewEnd = null; } }
        break;
      case 'claim.review.completed': { const h = holds.get(d!.reviewId as string); if (h) { h.verdict = d as unknown as Verdict; h.reviewEnd = e.ms; } break; }
      case 'interception.finished': { const h = holds.get(d!.reviewId as string); if (h) h.end = e.ms; break; }
      case 'proposal.written': points.push({ producer: e.producer, loopId: e.loopId!, t: e.ms, kind: 'written', pairId: d!.pairId as string }); break;
      case 'pair.abandoned': points.push({ producer: e.producer, loopId: e.loopId!, t: e.ms, kind: 'abandoned', pairId: d!.pairId as string }); break;
    }
  }

  const loopList = [...loops.values()];
  const holdList = [...holds.values()];
  // The concurrency proof (T7): the most loops running at once, from loop starts and ends.
  const edges = loopList.flatMap((l) => [{ t: l.start, d: 1 }, { t: l.end ?? horizon, d: -1 }]).sort((a, b) => a.t - b.t || a.d - b.d);
  let n = 0; const peak = { n: 0, at: 0 };
  for (const x of edges) { n += x.d; if (n > peak.n) { peak.n = n; peak.at = x.t; } }

  const model: Model = {
    events, loops: loopList, holds: holdList, points, horizon, peak,
    counters: {
      running: loopList.filter((l) => l.end == null).length,
      holds: holdList.length,
      passed: holdList.filter((h) => h.verdict?.pass === true).length,
      failed: holdList.filter((h) => h.verdict?.pass === false).length,
      written: points.filter((p) => p.kind === 'written').length,
      abandoned: points.filter((p) => p.kind === 'abandoned').length,
    },
  };
  memo = { key, model };
  return model;
}

export const loopRunningAt = (l: Loop, t: number, horizon: number) => l.start <= t && t < (l.end ?? horizon + 1);

/** What a loop was doing at moment t, in the trace's own words. */
export function activity(m: Model, l: Loop, t: number): string {
  const hold = m.holds.find((h) => h.loopId === l.loopId && h.start <= t && t < (h.end ?? m.horizon + 1));
  if (hold) return `held, ${hold.reviewId}`;
  if (l.producer === 'CR') {
    const h = m.holds.find((x) => x.criticLoop === l.loopId);
    return h ? `checking ${h.reviewId}` : 'checking';
  }
  let lastEv: Ev | undefined;
  for (const e of l.events) { if (e.ms <= t) lastEv = e; else break; }
  if (!lastEv) return 'starting';
  if (lastEv.type === 'function_call.started') return `tool call, ${lastEv.summary.split(' ')[0]}`;
  if (lastEv.type === 'inference.started' || lastEv.type === 'function_call.completed' || lastEv.type === 'interception.finished') return 'model turn';
  return lastEv.summary;
}

/** Loops running during a hold, other than the held one: the overlap PRD §8.3 asks the trace to prove. */
export function overlap(m: Model, h: Hold) {
  const end = h.end ?? m.horizon;
  return m.loops.filter((l) => l.loopId !== h.loopId && l.start < end && (l.end ?? m.horizon + 1) > h.start);
}

export type PairStatus = 'written' | 'abandoned' | 'writing' | 'shortlisted';

/** Where a pair stands at the playhead, so lists follow the replay rather than the final state. */
export function pairStatus(m: Model, pairId: string): PairStatus | null {
  const point = m.points.find((p) => p.pairId === pairId);
  if (point) return point.kind;
  const has = (type: string) => m.events.some((e) => e.type === type && (e.data as { pairId?: string } | undefined)?.pairId === pairId);
  if (has('loop.started')) return 'writing';
  if (has('pair.shortlisted')) return 'shortlisted';
  return null;
}

/** The finding for the Run screen: the longest failed hold, and who kept working through it. */
/** The hold the Run screen leads with: one that caught a wrong person (C2, C3, C4) if any, else the longest failed one. */
export function headlineHold(m: Model): Hold | undefined {
  const failed = m.holds.filter((h) => h.verdict?.pass === false && h.end != null);
  const identity = (h: Hold) => (h.verdict!.claims.some((c) => c.check === 'C2' || c.check === 'C3' || c.check === 'C4') ? 1 : 0);
  return failed.sort((a, b) => identity(b) - identity(a) || (b.end! - b.start) - (a.end! - a.start))[0];
}
