// The gate inside the real Mozaik 4.1.0 runtime. A scripted InferenceRunner stands in for the model, so loops, the
// interception and event delivery are Mozaik's own and no key is needed.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import {
  FunctionCallItem, ModelContext, ModelMessageItem, RuntimeState, SemanticEvent, createAgent, createHuman, defineRuntime,
  type FunctionCallOutputItem, type InferenceInput, type InferenceOutput, type InferenceRunner, type Tool,
} from '@mozaik-ai/core';
import { loadConfig } from '../src/config.ts';
import { writeProposalSchema, type ReviewRequest, type Verdict, type WriteProposalInput } from '../src/contract.ts';
import { criticHandler } from '../src/critic/critic.ts';
import { buildIdentities } from '../src/data/identities.ts';
import { loadIndex } from '../src/data/index.ts';
import { ObstatGate, verdictHandler, WRITE_PROPOSAL } from '../src/gate/obstat-gate.ts';
import { Reviews } from '../src/gate/wait-for-verdict.ts';
import { on } from '../src/situations.ts';
import { ObstatState } from '../src/state.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Step = { after: number; call?: [string, unknown]; say?: string };

/** Serves each loop's scripted turns in order, keyed by the model name the loop was started with. */
class ScriptRunner implements InferenceRunner {
  readonly scripts: Map<string, Step[]>;
  readonly toolsSeen: string[][] = [];
  private seq = 0;
  constructor(scripts: Record<string, Step[]>) {
    this.scripts = new Map(Object.entries(scripts));
  }
  async run(input: InferenceInput): Promise<InferenceOutput> {
    this.toolsSeen.push((input.tools ?? []).map((t) => t.name));
    const step = this.scripts.get(input.model)?.shift();
    if (!step) throw new Error(`no scripted turn left for ${input.model}`);
    await sleep(step.after);
    const item = step.call
      ? FunctionCallItem.rehydrate({ callId: `call_${++this.seq}`, name: step.call[0], args: typeof step.call[1] === 'string' ? step.call[1] : JSON.stringify(step.call[1]) })
      : ModelMessageItem.rehydrate({ text: step.say ?? 'done' });
    return { items: [item], tokenUsage: undefined, rowResponse: null };
  }
  async *stream(): AsyncGenerator<SemanticEvent> {
    throw new Error('streaming is not scripted');
  }
}

interface Logged { type: string; who: string; payload: any }

function world<S extends RuntimeState & { reviews: Reviews }>(state: S, runner: InferenceRunner) {
  const rt = defineRuntime<S>();
  rt.initializeRuntime({ state, inferenceRunnerConfig: { runner } });
  const names = new Map<string, string>();
  const log: Logged[] = [];
  const writes: WriteProposalInput[] = [];
  const observer = createHuman({ name: 'TO', capabilities: [], handlers: [on([], (e) => { log.push({ type: e.type, who: names.get(e.producerId) ?? '?', payload: e.payload }); })] });
  rt.join(observer);
  names.set(observer.getId(), 'TO');

  const writeTool: Tool = { type: 'function', name: WRITE_PROPOSAL, description: 'Write the proposal file.', parameters: writeProposalSchema, strict: true, invoke: async (args: WriteProposalInput) => { writes.push(args); return { written: `out/proposals/${args.pairId}.md` }; } };
  const lookupTool: Tool = { type: 'function', name: 'lookup_record', description: 'Look up a dataset record.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, strict: true, invoke: async ({ id }: { id: string }) => ({ id }) };

  function writer(name: string, opts: { timeoutMs?: number; revisionCap?: number } = {}) {
    const agent = createAgent({ name, capabilities: [], instruction: 'Write one proposal.', tools: [writeTool, lookupTool], handlers: [verdictHandler(state.reviews)] });
    rt.join(agent);
    names.set(agent.getId(), name);
    const gate = new ObstatGate({ writerId: agent.getId(), writerName: name, reviews: state.reviews, sendEvent: rt.sendEvent, timeoutMs: opts.timeoutMs ?? 2000, revisionCap: opts.revisionCap ?? 3 });
    const context = ModelContext.create();
    return {
      agent,
      context,
      start: () => rt.runLoop(agent.getId(), `Write ${name}'s proposal.`, { model: name, tools: agent.getTools(), context }, gate),
    };
  }

  function participant(name: string, handlers: (selfId: string) => ReturnType<typeof on>[]) {
    const p = createHuman({ name, capabilities: [], handlers: [] });
    p.setHandlers(handlers(p.getId()));
    rt.join(p);
    names.set(p.getId(), name);
    return p;
  }

  async function until(done: () => boolean, ms = 5000) {
    const end = Date.now() + ms;
    while (!done()) {
      if (Date.now() > end) throw new Error(`timed out; events so far:\n${log.map((l) => `${l.who} ${l.type}`).join('\n')}`);
      await sleep(10);
    }
  }
  const answered = (name: string) => log.some((l) => l.type === 'model.answer' && l.who === name);
  const at = (pred: (l: Logged) => boolean, from = 0) => {
    const i = log.findIndex((l, k) => k >= from && pred(l));
    assert.ok(i >= 0, `event not found after #${from}`);
    return i;
  };
  return { rt, log, writes, writer, participant, until, answered, at };
}

class GateState extends RuntimeState {
  reviews = new Reviews();
}

const minimal = (pairId: string): WriteProposalInput => ({
  pairId, researcherIds: ['R0539'], companyId: 'C062', challengeId: 'C062-CH1', format: 'joint_project',
  sections: { title: 't', problem: 'p 1', researchQuestions: ['q'], plan: 'a | b | c\nd | e | f', eachSideBrings: { company: 'c', faculty: 'f' }, whyThisPair: 'w', agreedUpFront: 'a' },
  claims: [{ n: 1, kind: 'other', text: 'x', researcherId: null, ids: ['C062'] }],
});

function verdictFor(req: ReviewRequest, pass: boolean): Verdict {
  const failure = { n: 1, check: 'C2' as const, pass: false as const, detail: 'SYN-PUB-00001 carries R0001, not R0539.' };
  return { reviewId: req.reviewId, writerId: req.writerId, pairId: req.pairId, round: req.round, pass, claims: pass ? [] : [failure], checks: [{ check: 'C2', target: 1, pass, detail: pass ? 'ok' : failure.detail }] };
}

const { dataDir } = loadConfig();
const noData = existsSync(dataDir) ? false : `dataset not found at ${dataDir}`;

test('PRD §8.3: W2 is held, W1 keeps working, the real Critic fails claim 3, the revision passes, the file is written', { skip: noData }, async () => {
  const ix = loadIndex(dataDir);
  const state = new ObstatState(ix, buildIdentities(ix));
  state.challengeClass.set('C062-CH1', { cls: 'research', reason: 'Signal processing.', ids: [] });
  const claims = (rid: string) => [
    { n: 1, kind: 'authored', text: 'R0539 developed hyperbola detection for GPR B-scans.', researcherId: 'R0539', ids: ['SYN-PUB-01827'] },
    { n: 2, kind: 'project', text: 'R0539 took part in SYN-PRJ-0319.', researcherId: 'R0539', ids: ['SYN-PRJ-0319'] },
    { n: 3, kind: 'authored', text: 'Mirjana Jeremić published on hyperbola detection in GPR data.', researcherId: rid, ids: ['SYN-PUB-01827'] },
  ];
  const proposal = (rid: string) => ({
    ...minimal('pair-2'),
    format: 'industrial_phd',
    sections: { ...minimal('pair-2').sections, problem: 'Operators miss about one in five buried utilities.', plan: 'Year 1 | Label | Set\nYear 2 | Train {1} | Model\nYear 3 | Trial | Thesis', eachSideBrings: { company: 'Archives.', faculty: 'GPR detection {1} {3}.' } },
    claims: claims(rid),
  });
  const runner = new ScriptRunner({
    W2: [{ after: 10, call: [WRITE_PROPOSAL, proposal('R0139')] }, { after: 10, call: [WRITE_PROPOSAL, proposal('R0539')] }, { after: 5, say: 'pair-2 written' }],
    W1: [{ after: 40, call: ['lookup_record', { id: 'C011-CH2' }] }, { after: 40, call: ['lookup_record', { id: 'R0412' }] }, { after: 40, say: 'W1 done' }],
  });
  const w = world(state, runner);
  // The Critic answers after 120 ms, the way a real review takes time.
  w.participant('CR', (self) => [criticHandler({ criticId: self, state, sendEvent: (e, s) => setTimeout(() => w.rt.sendEvent(e, s), 120), today: () => new Date('2026-10-31') })]);
  const w2 = w.writer('W2');
  const w1 = w.writer('W1');
  w2.start();
  w1.start();
  await w.until(() => w.answered('W2') && w.answered('W1'));

  const { at, log } = w;
  const held = at((l) => l.who === 'W2' && l.type === 'interception.started');
  const asked = at((l) => l.who === 'W2' && l.type === 'claim.review.requested', held);
  const w1Working = at((l) => l.who === 'W1' && l.type === 'function_call.started', asked);
  const failed = at((l) => l.who === 'CR' && l.type === 'claim.review.completed' && !l.payload.pass, asked);
  const back = at((l) => l.who === 'W2' && l.type === 'interception.finished', failed);
  const heldAgain = at((l) => l.who === 'W2' && l.type === 'interception.started', back);
  const passed = at((l) => l.who === 'CR' && l.type === 'claim.review.completed' && l.payload.pass, heldAgain);
  const released = at((l) => l.who === 'W2' && l.type === 'interception.finished', passed);
  const writing = at((l) => l.who === 'W2' && l.type === 'function_call.started' && l.payload.call.name === WRITE_PROPOSAL, released);

  assert.ok(w1Working < failed, 'W1 made a tool call while W2 was held');
  assert.deepEqual(log[failed].payload.claims.map((f: Verdict['claims'][number]) => `${f.n}:${f.check}`), ['3:C2', '3:C3']);
  assert.equal(log[back].payload.nextStateId, 'inference');
  assert.equal(log[released].payload.nextStateId, 'function_call');
  assert.ok(writing > released);
  assert.equal(w.writes.length, 1);
  assert.equal(w.writes[0].claims[2].researcherId, 'R0539');
  assert.deepEqual(state.commitments.get('R0539'), ['pair-2']);

  // The writer read the Critic's reason, as a function_call_output in its own context.
  const output = w2.context.getItems().find((i): i is FunctionCallOutputItem => i.type === 'function_call_output');
  assert.match(output!.output.text, /claim 3, C3 duplicate profile: SYN-PUB-01827 is attributed to R0539/i);
  assert.ok(!log.some((l) => l.type === 'interception.finished' && l.payload.nextStateId === 'idle'), 'the gate never returns idle');
});

test('a Critic that never answers: the gate times out, fails closed and the loop continues', async () => {
  const state = new GateState();
  const runner = new ScriptRunner({ W2: [{ after: 5, call: [WRITE_PROPOSAL, minimal('pair-7')] }, { after: 5, say: 'gave up' }] });
  const w = world(state, runner);
  const w2 = w.writer('W2', { timeoutMs: 60 });
  w2.start();
  await w.until(() => w.answered('W2'));
  const timeout = w.at((l) => l.type === 'gate.timeout');
  assert.equal(w.log[timeout].payload.reviewId, 'rv_01');
  assert.equal(w.log[w.at((l) => l.type === 'interception.finished', timeout)].payload.nextStateId, 'inference');
  assert.equal(w.writes.length, 0);
  assert.equal(state.reviews.byId.get('rv_01')!.status, 'timeout');
});

test('a late verdict after the timeout is ignored', async () => {
  const reviews = new Reviews();
  const waiting = reviews.open({ reviewId: 'rv_01', writerId: 'W1', pairId: 'p', round: 1 }, 20);
  assert.equal(await waiting, null);
  assert.equal(reviews.resolve('rv_01', verdictFor({ reviewId: 'rv_01', writerId: 'W1', pairId: 'p', round: 1, callId: 'c', proposal: minimal('p') }, true)), false);
});

test('after the round cap and one final round, the pair is abandoned and the writer\'s loop ends without another model turn', async () => {
  const state = new GateState();
  const runner = new ScriptRunner({
    W3: [{ after: 5, call: [WRITE_PROPOSAL, minimal('pair-4')] }, { after: 5, call: [WRITE_PROPOSAL, minimal('pair-4')] }],
  });
  const w = world(state, runner);
  w.participant('CR', (self) => [on<ReviewRequest>('claim.review.requested', (e) => {
    const v = verdictFor(e.payload, false);
    state.reviews.record(v);
    w.rt.sendEvent(SemanticEvent.create('claim.review.completed', self, v), self);
  })]);
  const w3 = w.writer('W3', { revisionCap: 1 });
  w3.start();
  await w.until(() => w.answered('W3'));
  const abandoned = w.log.find((l) => l.type === 'pair.abandoned')!;
  assert.equal(abandoned.payload.pairId, 'pair-4');
  assert.equal(abandoned.payload.round, 2);
  assert.match(abandoned.payload.reasons[0], /Claim 1, C2 attribution/);
  assert.equal(w.log.filter((l) => l.type === 'claim.review.requested').length, 2);
  assert.equal(runner.toolsSeen.length, 2, 'no model turn after the abandonment');
  assert.equal(w.writes.length, 0);
  const outputs = w3.context.getItems().filter((i): i is FunctionCallOutputItem => i.type === 'function_call_output').map((i) => i.output.text);
  assert.match(outputs[0], /That was the last regular round/);
  assert.match(w.log.find((l) => l.type === 'model.answer')!.payload.answer.content.text, /pair-4 abandoned after 2 rounds/);
  assert.equal(w.log.find((l) => l.type === 'interception.finished' && l.payload.nextStateId === 'model_message') !== undefined, true);
});

test('malformed arguments go back to the writer without a review', async () => {
  const state = new GateState();
  const runner = new ScriptRunner({ W1: [{ after: 5, call: [WRITE_PROPOSAL, '{"pairId":"pair-1",'] }, { after: 5, say: 'stopped' }] });
  const w = world(state, runner);
  const w1 = w.writer('W1');
  w1.start();
  await w.until(() => w.answered('W1'));
  assert.ok(w.log.some((l) => l.type === 'gate.rejected' && l.payload.pairId === 'pair-1'));
  assert.ok(!w.log.some((l) => l.type === 'claim.review.requested'));
  const out = w1.context.getItems().find((i): i is FunctionCallOutputItem => i.type === 'function_call_output')!;
  assert.match(out.output.text, /not valid JSON/);
});

test('handle() never throws: a failure inside the gate returns the writer to inference', async () => {
  const gate = new ObstatGate({ writerId: 'w', writerName: 'W1', reviews: new Reviews(), sendEvent: () => { throw new Error('boom'); }, timeoutMs: 50, revisionCap: 3 });
  const call = FunctionCallItem.rehydrate({ callId: 'call_1', name: WRITE_PROPOSAL, args: JSON.stringify(minimal('pair-1')) });
  const context = ModelContext.create();
  const t = await gate.handle({ nextStateId: 'function_call', input: { call, inferenceInput: { model: 'm', tools: [], context } } });
  assert.equal(t.nextStateId, 'inference');
  assert.match((context.getItems()[1] as FunctionCallOutputItem).output.text, /could not check this call \(boom\)/);
});

test('malformed calls do not use up rounds, and each held call has its review reserved before the hold is announced', async () => {
  const state = new GateState();
  const runner = new ScriptRunner({
    W1: [
      { after: 5, call: [WRITE_PROPOSAL, '{"pairId":"pair-3",'] },
      { after: 5, call: [WRITE_PROPOSAL, minimal('pair-3')] },
      { after: 5, call: [WRITE_PROPOSAL, minimal('pair-3')] },
      { after: 5, say: 'stopped' },
    ],
  });
  const w = world(state, runner);
  const reservedAtStart: (string | undefined)[] = [];
  w.participant('probe', () => [on('interception.started', (e) => { reservedAtStart.push(state.reviews.byCall.get((e.payload as any).input.call.callId)?.reviewId); })]);
  w.participant('CR', (self) => [on<ReviewRequest>('claim.review.requested', (e) => {
    const v = verdictFor(e.payload, false);
    state.reviews.record(v);
    w.rt.sendEvent(SemanticEvent.create('claim.review.completed', self, v), self);
  })]);
  const w1 = w.writer('W1', { revisionCap: 1 });
  w1.start();
  await w.until(() => w.answered('W1'));
  assert.deepEqual(reservedAtStart, ['rv_01', 'rv_02', 'rv_03']);
  assert.deepEqual(w.log.filter((l) => l.type === 'claim.review.requested').map((l) => l.payload.round), [1, 2]);
  assert.equal(w.log.find((l) => l.type === 'pair.abandoned')!.payload.round, 2);
});
