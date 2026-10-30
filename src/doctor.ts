// npm run doctor: one real tool-calling round per configured model, before a full run spends anything.
// Each model must call lookup_record twice, the second call depending on the first, so the second request carries the
// first call back (where a dropped Gemini thought signature fails). write_proposal is declared too, so a provider
// that rejects its schema fails here. --stock uses Mozaik's unpatched models, to show whether the fix is needed.
import { ModelContext, RuntimeState, createAgent, createHuman, defineRuntime, supportedModels, type Tool } from '@mozaik-ai/core';
import { loadConfig } from './config.ts';
import { writeProposalSchema } from './contract.ts';
import { getRecord, loadIndex, titleOf } from './data/index.ts';
import { WRITE_PROPOSAL } from './gate/obstat-gate.ts';
import { models } from './providers.ts';
import { on } from './situations.ts';

const config = loadConfig();
const stock = process.argv.includes('--stock');
const ix = loadIndex(config.dataDir);
const runtime = defineRuntime<RuntimeState>();
runtime.initializeRuntime({ state: new (class extends RuntimeState {})(), inferenceRunnerConfig: { supportedModels: stock ? supportedModels : models() } });

let current: { done: (r: string) => void; fail: (e: unknown) => void } | null = null;
process.on('unhandledRejection', (e) => current?.fail(e));
const calls: string[] = [];
let tokens = 0;
runtime.join(createHuman({
  name: 'doctor',
  capabilities: [],
  handlers: [on([], (e) => {
    const p = e.payload as any;
    if (e.type === 'function_call.started') calls.push(`${p.call.name}(${p.call.args})`);
    if (e.type === 'inference.completed') tokens += p.tokenUsage?.totalTokens ?? 0;
    if (e.type === 'model.answer') current?.done(p.answer.content.text);
  })],
}));

const lookup: Tool = {
  type: 'function', name: 'lookup_record', strict: true,
  description: 'Returns one dataset record by ID: a researcher (R0001), publication (SYN-PUB-00001), project, patent, company or challenge.',
  parameters: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string' } } },
  invoke: async ({ id }: { id: string }) => {
    const hit = getRecord(ix, id);
    return hit ? { id, type: hit.type, title: titleOf(hit.record), record: hit.record } : { error: `No record ${id}` };
  },
};
const write: Tool = { type: 'function', name: WRITE_PROPOSAL, strict: true, description: 'Not used in this check.', parameters: writeProposalSchema, invoke: async () => ({ error: 'not used' }) };

async function check(model: string): Promise<boolean> {
  calls.length = 0;
  tokens = 0;
  const agent = createAgent({ name: model, capabilities: [], instruction: 'You check facts with tools. Never guess an ID.', tools: [lookup, write], handlers: [] });
  runtime.join(agent);
  const started = Date.now();
  try {
    const answer = await new Promise<string>((done, fail) => {
      current = { done, fail };
      setTimeout(() => fail(new Error('no answer within 120 s')), 120_000);
      runtime.runLoop(agent.getId(), 'Look up SYN-PUB-01827. Then look up the researcher whose researcher_id is on its first author entry. Answer in one sentence: the paper title and that researcher\'s name and faculty.', { model, tools: agent.getTools(), context: ModelContext.create() });
    });
    const twoCalls = calls.filter((c) => c.startsWith('lookup_record')).length >= 2;
    const right = /Jeremi/.test(answer) && calls.some((c) => c.includes('R0539'));
    console.log(`${twoCalls && right ? 'PASS' : 'WARN'}  ${model}  ${((Date.now() - started) / 1000).toFixed(1)} s, ${tokens} tokens`);
    console.log(`      calls: ${calls.join(' -> ')}`);
    console.log(`      answer: ${answer.trim().slice(0, 220)}`);
    if (!twoCalls) console.log('      It answered without the second lookup, so the signature round trip was not exercised.');
    return twoCalls && right;
  } catch (e) {
    console.log(`FAIL  ${model}  after ${calls.length} tool call(s)`);
    console.log(`      ${String((e as Error)?.message ?? e).slice(0, 600)}`);
    return false;
  } finally {
    current = null;
  }
}

const roles = [...new Set(Object.values(config.models))];
console.log(`Checking ${roles.join(', ')}${stock ? ' with Mozaik\'s stock endpoints' : ''}\n`);
let ok = true;
for (const model of roles) ok = (await check(model)) && ok;
process.exit(ok ? 0 : 1);
