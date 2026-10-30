// The gate (PRD §8). One instance per writer loop, passed to runLoop. It holds that writer's write_proposal call until
// the Critic answers; only that loop awaits, so every other loop keeps running.
//
// Rounds per pair: up to revisionCap failed rounds go back with the failures. After the last of them the writer is told
// to drop the failing claims and submit once more; if that final round fails too, the pair is abandoned and the
// writer's loop ends with the reason. Malformed arguments never reach the Critic and do not use up a round (providers
// without strict schemas slip now and then), but more than revisionCap of them abandons the pair too.
// handle() never throws and never returns "idle" (issue #113): a loop that is done ends through model_message.
import { FunctionCallItem, FunctionCallOutputItem, ModelMessageItem, SemanticEvent, type ExecutableTransition, type InferenceInput, type InterceptionHandler } from '@mozaik-ai/core';
import { CHECK_NAMES, parseWriteProposal, type ReviewRequest, type Verdict } from '../contract.ts';
import { on } from '../situations.ts';
import type { HeldCall, Reviews } from './wait-for-verdict.ts';

export const WRITE_PROPOSAL = 'write_proposal';

export interface GateOptions {
  /** The writer's participant ID: the sender of its review requests. */
  writerId: string;
  /** The writer's name in the trace (W1, W2, W3). */
  writerName: string;
  reviews: Reviews;
  sendEvent: (event: SemanticEvent, senderId: string) => void;
  timeoutMs: number;
  revisionCap: number;
}

export interface Abandonment { summary: string; pairId: string; writerId: string; reviewId: string; round: number; reasons: string[] }

export class ObstatGate implements InterceptionHandler {
  private readonly opts: GateOptions;
  private readonly rounds = new Map<string, number>();
  private readonly malformed = new Map<string, number>();
  private readonly held = new WeakMap<FunctionCallItem, HeldCall>();

  constructor(opts: GateOptions) {
    this.opts = opts;
  }

  /**
   * Mozaik announces interception.started right after this returns true and before handle() runs, so the review is
   * reserved here: the trace can then name it on that first line.
   */
  isSatisfiedBy(t: ExecutableTransition): boolean {
    if (t.nextStateId !== 'function_call' || t.input.call.name !== WRITE_PROPOSAL) return false;
    try {
      this.reserve(t.input.call);
    } catch {
      // handle() reserves again, and fails closed if it still cannot.
    }
    return true;
  }

  async handle(t: ExecutableTransition): Promise<ExecutableTransition> {
    if (t.nextStateId !== 'function_call') return t;
    const { call, inferenceInput } = t.input;
    try {
      return await this.hold(t, call, inferenceInput);
    } catch (e) {
      // Fail closed: nothing is written, the writer is told why and goes back to inference.
      return back(call, inferenceInput, `The gate could not check this call (${(e as Error).message}). Nothing was written. Call write_proposal again.`);
    }
  }

  private reserve(call: FunctionCallItem): HeldCall {
    const known = this.held.get(call);
    if (known) return known;
    const { reviews, writerName } = this.opts;
    const parsed = parseWriteProposal(call.args);
    const pairId = parsed.ok ? parsed.value.pairId : pairIdOf(call.args);
    const counter = parsed.ok ? this.rounds : this.malformed;
    const round = (counter.get(pairId) ?? 0) + 1;
    counter.set(pairId, round);
    const entry: HeldCall = { reviewId: reviews.nextId(), writerId: writerName, pairId, round, malformed: !parsed.ok, args: call.args };
    this.held.set(call, entry);
    reviews.byCall.set(call.callId, entry);
    return entry;
  }

  private async hold(t: ExecutableTransition, call: FunctionCallItem, input: InferenceInput): Promise<ExecutableTransition> {
    const { writerId, writerName, reviews, sendEvent, timeoutMs, revisionCap } = this.opts;
    const parsed = parseWriteProposal(call.args);
    const { reviewId, pairId, round } = this.reserve(call);

    let verdict: Verdict | null;
    if (!parsed.ok) {
      sendEvent(SemanticEvent.create('gate.rejected', writerId, { summary: `${reviewId}: write_proposal rejected before review: ${parsed.error}`, reviewId, writerId: writerName, pairId, attempt: round, error: parsed.error }), writerId);
      if (round <= revisionCap) return back(call, input, `write_proposal was not checked: ${parsed.error}. Nothing was written. Fix the arguments and call write_proposal again with the whole proposal.`);
      verdict = null;
    } else {
      // Open the review before asking: event delivery is synchronous, so a fast Critic could answer inside sendEvent.
      const waiting = reviews.open({ reviewId, writerId: writerName, pairId, round }, timeoutMs);
      const request: ReviewRequest = { reviewId, writerId: writerName, pairId, round, callId: call.callId, proposal: parsed.value };
      sendEvent(SemanticEvent.create('claim.review.requested', writerId, request), writerId);
      verdict = await waiting;
      if (!verdict) sendEvent(SemanticEvent.create('gate.timeout', writerId, { summary: `${reviewId}: the Critic did not answer within ${Math.round(timeoutMs / 1000)} s`, reviewId, writerId: writerName, pairId, round, timeoutMs }), writerId);
    }

    if (verdict?.pass) return t;

    if (round > revisionCap) {
      const reasons = verdict ? verdict.claims.map(failureLine) : [parsed.ok ? 'The Critic did not answer.' : `The arguments were malformed: ${parsed.error}`];
      const abandoned: Abandonment = { summary: `${pairId} abandoned after ${round} rounds`, pairId, writerId: writerName, reviewId, round, reasons };
      sendEvent(SemanticEvent.create('pair.abandoned', writerId, abandoned), writerId);
      // The writer has nothing left to do, so its loop ends here with the reason as its answer (a model_message, not idle).
      return end(`${pairId} abandoned after ${round} rounds; nothing was written. ${reasons.join(' ')}`);
    }

    const text = !verdict
      ? `The Critic did not answer within ${Math.round(timeoutMs / 1000)} s (${reviewId}, round ${round} of ${revisionCap}). The claims are unverified and nothing was written. Call write_proposal again.`
      : renderFailures(verdict, revisionCap);
    return back(call, input, text);
  }
}

/** The call and the gate's answer go into the writer's context, and the loop returns to inference. */
function back(call: FunctionCallItem, input: InferenceInput, text: string): ExecutableTransition {
  input.context.addContextItems([call, FunctionCallOutputItem.create(call.callId, text)]);
  return { nextStateId: 'inference', input };
}

/** Ends the loop with this text as its answer, without another model turn. */
function end(text: string): ExecutableTransition {
  return { nextStateId: 'model_message', input: { answer: ModelMessageItem.rehydrate({ text }) } };
}

/** True on the transition right after write_proposal wrote its file: the loop is back at inference with nothing left to do. */
function justWritten(t: ExecutableTransition): boolean {
  if (t.nextStateId !== 'inference') return false;
  const items = t.input.context.getItems();
  const out = items.at(-1);
  const call = items.at(-2);
  return out instanceof FunctionCallOutputItem && call instanceof FunctionCallItem && call.name === WRITE_PROPOSAL && /"written"\s*:/.test(out.output.text);
}

/**
 * What a writer loop runs with: the gate on write_proposal, and an end to the loop once the file is written, so no
 * model turn is spent saying so.
 */
export class WriterInterception implements InterceptionHandler {
  readonly gate: ObstatGate;

  constructor(gate: ObstatGate) {
    this.gate = gate;
  }

  isSatisfiedBy(t: ExecutableTransition): boolean {
    return this.gate.isSatisfiedBy(t) || justWritten(t);
  }

  async handle(t: ExecutableTransition): Promise<ExecutableTransition> {
    if (t.nextStateId === 'function_call') return this.gate.handle(t);
    const out = t.nextStateId === 'inference' ? (t.input.context.getItems().at(-1) as FunctionCallOutputItem) : undefined;
    const path = out?.output.text.match(/"written"\s*:\s*"([^"]+)"/)?.[1];
    return end(path ? `${path} written.` : 'Proposal written.');
  }
}

/** The pair a malformed call was for, read from the raw text when it is not valid JSON. */
function pairIdOf(args: string): string {
  return args.match(/"pairId"\s*:\s*"([^"]+)"/)?.[1] ?? 'unknown';
}

function failureLine(f: Verdict['claims'][number]): string {
  return `${f.n === 'proposal' ? 'Proposal' : `Claim ${f.n}`}, ${f.check} ${CHECK_NAMES[f.check].toLowerCase()}: ${f.detail}`;
}

/** What the held writer reads back: each failure, what passed, and what to do next. */
export function renderFailures(verdict: Verdict, revisionCap: number): string {
  const failed = new Set(verdict.claims.map((f) => f.n));
  const passed = [...new Set(verdict.checks.map((c) => c.target))].filter((n): n is number => typeof n === 'number' && !failed.has(n));
  const last = verdict.round >= revisionCap;
  return [
    `The Critic held this write_proposal call (${verdict.reviewId}, round ${verdict.round} of ${revisionCap}). Nothing was written.`,
    'Failed:',
    ...verdict.claims.map((f) => `- ${failureLine(f)}`),
    passed.length ? `Passed: claim${passed.length > 1 ? 's' : ''} ${passed.join(', ')}.` : '',
    last
      ? 'That was the last regular round. Drop every failed claim and every sentence marked with its number, then call write_proposal one final time with the whole proposal. If a required section cannot stand without them, the pair will be abandoned.'
      : 'Fix each failed claim: correct the ID, cite evidence whose entries carry the researcher\'s ID, or drop the claim and every sentence marked with its number. Then call write_proposal again with the whole proposal.',
  ].filter(Boolean).join('\n');
}

/** Resolves the gate's pending review when the Critic's verdict event arrives, matched by reviewId only. */
export function verdictHandler(reviews: Reviews) {
  return on<Verdict>('claim.review.completed', (event) => {
    reviews.resolve(event.payload.reviewId, event.payload);
  });
}
