// Turns runtime events into trace lines: one JSON line per event for out/trace.jsonl and the console's /events stream
// (PRD §10), and a readable line for the terminal (PRD §16). Mozaik has no loop start or finish events, so a
// loop.started line is added at a loop's first event and loop.finished at its answer.
import type { SemanticEvent } from '@mozaik-ai/core';
import type { ReviewRequest, Verdict } from './contract.ts';
import type { ObstatState } from './state.ts';

export interface TraceLine {
  t: string;
  type: string;
  producer: string;
  loopId?: string;
  summary: string;
  data?: Record<string, unknown>;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export class TraceConverter {
  private readonly state: ObstatState;
  private readonly seen = new Set<string>();
  /** loopId -> the hold it is in, between interception.started and interception.finished. */
  private readonly openHold = new Map<string, { reviewId: string; pairId: string; round: number; malformed: boolean }>();
  private readonly toolOfCall = new Map<string, string>();
  private readonly closing = new Set<string>();

  constructor(state: ObstatState) {
    this.state = state;
  }

  nameOf(id: string): string {
    return this.state.participants.get(id)?.getManifest().name ?? id.slice(0, 8);
  }

  convert(event: SemanticEvent): TraceLine[] {
    const p = (event.payload ?? {}) as Record<string, any>;
    const producer = this.nameOf(event.producerId);
    const t = event.occurredAt.toISOString();
    const loopId: string | undefined = typeof p.loopId === 'string' ? p.loopId : undefined;
    const lines: TraceLine[] = [];

    if (loopId && !this.seen.has(loopId)) {
      this.seen.add(loopId);
      if (event.type !== 'loop.started') {
        const intent = this.state.loopIntent.get(producer);
        this.state.loopIntent.delete(producer);
        lines.push({ t, type: 'loop.started', producer, loopId, summary: intent?.label ?? 'loop', ...(intent?.data ? { data: intent.data } : {}) });
      }
    }
    // A writer's loop also passes through interception when it ends after writing its file; that is not a hold.
    let type = event.type;
    if (type === 'interception.started' && p.nextStateId !== 'function_call' && loopId) {
      this.closing.add(loopId);
      type = 'loop.closing';
    } else if (type === 'interception.finished' && loopId && this.closing.delete(loopId)) {
      type = 'loop.closed';
    }
    const [summary, data] = this.describe(type, p, loopId);
    lines.push({ t, type, producer, ...(loopId ? { loopId } : {}), summary, ...(data ? { data } : {}) });
    if (event.type === 'model.answer' && loopId) lines.push({ t, type: 'loop.finished', producer, loopId, summary: 'loop finished' });
    return lines;
  }

  private describe(type: string, p: Record<string, any>, loopId?: string): [string, Record<string, unknown>?] {
    switch (type) {
      case 'participant.joined':
        return [`${p.name} joined`];
      case 'loop.closing':
        return ['file written; the loop ends without another model turn'];
      case 'loop.closed':
        return ['loop closing'];
      case 'message_received.started':
        return ['task received'];
      case 'message_received.completed':
        return ['context ready'];
      case 'inference.started':
        return [`model turn (${p.model})`, { model: p.model }];
      case 'inference.completed': {
        const items = (p.items ?? []) as { type: string; name?: string; content?: { text: string } }[];
        if (typeof p.summary === 'string') return [p.summary];
        const call = items.find((i) => i.type === 'function_call');
        const tokens = p.tokenUsage?.totalTokens ?? 0;
        const what = call ? `chose ${call.name}` : items.some((i) => i.type === 'message') ? 'answered' : 'no output';
        return [`${what}${tokens ? `, ${tokens} tokens` : ''}`, { tokens }];
      }
      case 'function_call.started': {
        const { name, args, callId } = p.call ?? {};
        this.toolOfCall.set(callId, name);
        return [`${name} ${clip(oneLine(String(args ?? '')), 120)}`, { name, ...(name === 'write_proposal' ? {} : { args: clip(String(args ?? ''), 400) }) }];
      }
      case 'function_call.completed': {
        const name = this.toolOfCall.get(p.callId) ?? 'tool';
        const text = String(p.output?.text ?? '');
        return [`${name} returned${/^\{"error"/.test(text) ? ' an error' : ''} (${text.length} chars)`, { name }];
      }
      case 'model.answer':
        return [clip(oneLine(String(p.answer?.content?.text ?? '')), 160)];
      case 'interception.started': {
        const held = this.state.reviews.byCall.get(p.input?.call?.callId);
        let claims = 0;
        try {
          claims = JSON.parse(p.input?.call?.args ?? '{}').claims?.length ?? 0;
        } catch { /* malformed: counted as zero claims */ }
        if (held && loopId) this.openHold.set(loopId, held);
        return [`write_proposal held (${claims} claims)`, held ? { reviewId: held.reviewId, pairId: held.pairId, round: held.round, ...(held.malformed ? { malformed: true } : {}) } : undefined];
      }
      case 'interception.finished': {
        const held = loopId ? this.openHold.get(loopId) : undefined;
        if (loopId) this.openHold.delete(loopId);
        const released = p.nextStateId === 'function_call';
        const summary = released ? 'released: write_proposal runs' : p.nextStateId === 'model_message' ? 'pair abandoned; the loop ends' : 'returned to inference';
        return [summary, { ...(held ? { reviewId: held.reviewId, pairId: held.pairId, round: held.round } : {}), nextStateId: p.nextStateId }];
      }
      case 'claim.review.requested': {
        const r = p as ReviewRequest;
        return [`${r.reviewId}: ${r.pairId} round ${r.round}, ${r.proposal.claims.length} claims`, { ...r, claims: r.proposal.claims }];
      }
      case 'claim.review.completed': {
        const v = p as Verdict;
        const failures = v.claims.map((f) => `${f.n === 'proposal' ? 'proposal' : `claim ${f.n}`} ${f.check}`).join('; ');
        return [v.pass ? `${v.reviewId} pass` : `${v.reviewId} fail: ${failures}`, { ...v }];
      }
      default: {
        // Obstat's own events carry their summary.
        const { summary, ...rest } = p;
        return [typeof summary === 'string' ? summary : type, Object.keys(rest).length ? rest : undefined];
      }
    }
  }
}

// The terminal shows the story; trace.jsonl keeps every line. A hold is one HELD line (the request and the Critic's
// loop start say the same thing), and a loop's end is its answer line.
const TERMINAL_SKIP = new Set(['message_received.started', 'message_received.completed', 'inference.started', 'inference.completed',
  'function_call.completed', 'participant.joined', 'claim.review.requested', 'loop.finished', 'loop.closing', 'loop.closed']);

/** The readable terminal line, or null for lines the terminal skips. */
export function terminalLine(line: TraceLine): string | null {
  if (TERMINAL_SKIP.has(line.type) || (line.type === 'loop.started' && line.producer === 'CR')) return null;
  const time = line.t.slice(11, 21);
  const who = line.producer.padEnd(3);
  const d = (line.data ?? {}) as Record<string, any>;
  let text: string;
  switch (line.type) {
    case 'interception.started':
      text = `HELD ${line.summary}${d.reviewId ? ` [${d.reviewId}]` : ''}`;
      break;
    case 'claim.review.completed': {
      const v = d as unknown as Verdict;
      text = v.pass ? `PASS ${v.reviewId} (${v.pairId} round ${v.round})` : `${v.reviewId} ${v.claims.map((f) => `${f.n === 'proposal' ? 'proposal' : `claim ${f.n}`} FAIL ${f.check}: ${clip(f.detail, 110)}`).join(' | ')}`;
      break;
    }
    case 'interception.finished':
      text = d.nextStateId === 'function_call' ? 'released -> write_proposal' : d.nextStateId === 'model_message' ? 'pair abandoned, loop ends' : '-> inference (revising)';
      break;
    default:
      text = line.summary;
  }
  return `${time}  ${who} ${text}`;
}
