// The Gemini thought-signature fix, against Mozaik's own Gemini mapper, offline.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FunctionCallItem, FunctionCallOutputItem, GeminiGenerateContent, ModelContext, UserMessageItem } from '@mozaik-ai/core';
import { keepThoughtSignatures, models } from '../src/providers.ts';

const response = (parts: unknown[]) => ({ candidates: [{ content: { role: 'model', parts } }] });

test('a function call\'s thought signature goes back with that call on the next turn', () => {
  const mapper = keepThoughtSignatures(new GeminiGenerateContent().endpointMapper);
  const out = mapper.toResponse(response([{ functionCall: { id: 'fc_1', name: 'lookup_record', args: { id: 'SYN-PUB-01827' } }, thoughtSignature: 'sig-A' }]));
  const call = out.items[0] as FunctionCallItem;
  const context = ModelContext.create().addContextItems([UserMessageItem.create('Look it up.'), call, FunctionCallOutputItem.create(call.callId, '{"title":"x"}')]);
  const request = mapper.toRequest({ model: 'gemini-3.5-flash', context });
  const parts = request.contents.flatMap((c: { parts: any[] }) => c.parts);
  assert.equal(parts.find((p: any) => p.functionCall).thoughtSignature, 'sig-A');
});

test('calls without an ID get distinct ones, so their signatures do not mix', () => {
  const mapper = keepThoughtSignatures(new GeminiGenerateContent().endpointMapper);
  const a = mapper.toResponse(response([{ functionCall: { name: 'lookup_record', args: {} }, thoughtSignature: 'sig-A' }])).items[0] as FunctionCallItem;
  const b = mapper.toResponse(response([{ functionCall: { name: 'lookup_record', args: {} }, thoughtSignature: 'sig-B' }])).items[0] as FunctionCallItem;
  assert.notEqual(a.callId, b.callId);
  assert.ok(a.callId && b.callId);
});

test('every Gemini model uses the fixed endpoint; other providers are untouched', () => {
  const list = models();
  const gemini = list.filter((m) => m.specification.provider === 'google');
  assert.ok(gemini.length > 0);
  assert.equal(new Set(gemini.map((m) => m.endpoint)).size, 1);
  const openai = list.find((m) => m.specification.name === 'gpt-5.5')!;
  assert.ok(!(openai.endpoint instanceof GeminiGenerateContent));
});

test('a dropped connection is retried like a rate limit; a bad request is not', async () => {
  const { describe } = await import('../src/llm.ts');
  assert.equal(describe(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })).retryMs, 10_000);
  assert.ok(describe({ status: 429, message: '{"error":{"code":429,"details":[{"retryDelay":"12s"}]}}' }).retryMs! >= 12_000);
  assert.equal(describe({ status: 400, message: '{"error":{"code":400,"message":"bad"}}' }).retryMs, null);
  assert.equal(describe({ status: 429, message: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }).daily, true);
});
