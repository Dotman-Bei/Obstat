// Replay (PRD T8): the same Mozaik runtime, with every model call answered from a live run's recording instead of a
// provider. A live run writes out/recording.jsonl: one line per model call, keyed by a hash of the exact request
// (the model and the whole context; see requestKey in src/llm.ts). Here each request is looked up by that key.
// A request the recording does not hold is answered with a failure message, so the loop ends and the miss is
// counted: a replay never invents an answer.
import { readFileSync } from 'node:fs';
import { FunctionCallItem, InputTokenDetails, ModelMessageItem, OutputTokenDetails, TokenUsage, supportedModels, type InferenceInput, type InferenceOutput } from '@mozaik-ai/core';
import { FAILED, requestKey } from '../llm.ts';
import type { Model } from '../providers.ts';

type RecordedItem = { type: 'function_call'; callId: string; name: string; args: string } | { type: 'message'; text: string };
export interface Recorded { key: string; model: string; items: (RecordedItem | null)[]; tokens: number }

export interface ReplayStats { served: number; missed: number; misses: string[] }

/** The recording by request key. Identical requests (a resubmitted claim's support check) are served in order. */
export function loadRecording(path: string): Map<string, Recorded[]> {
  const byKey = new Map<string, Recorded[]>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as Recorded;
    byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  }
  return byKey;
}

function output(r: Recorded): InferenceOutput {
  const items = r.items.filter((i): i is RecordedItem => !!i).map((i) =>
    i.type === 'function_call' ? FunctionCallItem.rehydrate({ callId: i.callId, name: i.name, args: i.args }) : ModelMessageItem.rehydrate({ text: i.text }));
  const usage = new TokenUsage(0, 0, r.tokens, new InputTokenDetails(0), new OutputTokenDetails(0));
  return { items, tokenUsage: usage, rowResponse: null };
}

/**
 * One stand-in model per model name in the recording. paceMs spaces the answers so loops overlap the way they did
 * live; without it every hold would settle at once.
 */
export function replayModels(recording: Map<string, Recorded[]>, opts: { paceMs: number }, stats: ReplayStats): Model[] {
  const used = new Map<string, number>();
  const names = [...new Set([...recording.values()].flat().map((r) => r.model))];
  return names.map((name) => {
    const spec = supportedModels.find((m) => m.specification.name === name)?.specification;
    const endpoint = {
      endpointMapper: { toRequest: (x: InferenceInput) => x, toResponse: (x: unknown) => x as InferenceOutput },
      async infer(input: InferenceInput): Promise<InferenceOutput> {
        if (opts.paceMs) await new Promise((r) => setTimeout(r, opts.paceMs));
        const key = requestKey(input);
        const queue = recording.get(key);
        if (!queue?.length) {
          stats.missed += 1;
          stats.misses.push(key);
          return { items: [ModelMessageItem.rehydrate({ text: `${FAILED}: the recording holds no answer to this request]` })], tokenUsage: undefined, rowResponse: null };
        }
        const n = used.get(key) ?? 0;
        used.set(key, n + 1);
        stats.served += 1;
        return output(queue[Math.min(n, queue.length - 1)]);
      },
      async *stream(): AsyncGenerator<never> {
        throw new Error('replay does not stream');
      },
    };
    return { endpoint, specification: spec ?? { name, provider: 'replay', supportsReasoningEffort: false, supportedReasoningEfforts: [], supportsStreaming: false, contextWindowSize: 1_000_000, supportedContextItemTypes: [], maxOutputTokens: 100_000, supportsFunctionCalling: true, supportsStructuredOutput: true } } as unknown as Model;
  });
}
