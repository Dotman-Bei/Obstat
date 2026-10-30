// Every model call in the run goes through here. It keeps calls under the provider's per-minute limit, serves the
// Critic first (a held writer is waiting on it), retries rate limits after the delay the provider asks for, stops at
// the token budget (T10), and records every output so a replay can serve them without a key (T8).
// A call that still fails becomes a model message starting "[model call failed", so the loop ends cleanly instead of
// dying as an unhandled rejection that no participant would ever hear about.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  FunctionCallItem, FunctionCallOutputItem, ModelContext, ModelMessageItem,
  type InferenceInput, type InferenceOutput, type InferenceRunner, type SemanticEvent,
} from '@mozaik-ai/core';
import type { Model } from './providers.ts';

export const FAILED = '[model call failed';

export interface LlmOptions {
  callsPerMinute: number;
  maxConcurrent: number;
  maxRetries: number;
  /** 0 means no limit. */
  tokenBudget: number;
  /** Append each output here, keyed by its request, for replay. */
  recordTo?: string;
  log?: (line: string) => void;
}

/** Higher runs first. The Critic is 2, writers 1, everyone else 0. */
export const PRIORITY = { critic: 2, writer: 1, other: 0 } as const;

interface Waiting { priority: number; seq: number; start: () => void }

export class GuardedRunner implements InferenceRunner {
  readonly usage = { calls: 0, failed: 0, retries: 0, tokens: 0 };
  private readonly models: Map<string, Model>;
  private readonly opts: LlmOptions;
  private readonly priorities = new WeakMap<ModelContext, number>();
  private readonly queue: Waiting[] = [];
  private readonly started: number[] = [];
  private active = 0;
  private seq = 0;
  private timer: NodeJS.Timeout | null = null;
  private stopped: string | null = null;

  constructor(models: Model[], opts: LlmOptions) {
    this.models = new Map(models.map((m) => [m.specification.name, m]));
    this.opts = opts;
  }

  /** Mozaik's loops call run() with no say in order, so a loop's priority is registered on its context. */
  prioritize(context: ModelContext, priority: number): ModelContext {
    this.priorities.set(context, priority);
    return context;
  }

  async run(input: InferenceInput, priority = this.priorities.get(input.context) ?? PRIORITY.other): Promise<InferenceOutput> {
    if (this.stopped) return failed(this.stopped);
    const model = this.models.get(input.model);
    if (!model) return failed(`unsupported model ${input.model}`);
    for (let attempt = 0; ; attempt++) {
      await this.slot(priority);
      let wait = 0;
      try {
        const output = await model.endpoint.infer(input);
        this.usage.calls += 1;
        this.usage.tokens += output.tokenUsage?.totalTokens ?? 0;
        this.record(input, output);
        if (this.opts.tokenBudget && this.usage.tokens >= this.opts.tokenBudget) this.stop(`token budget of ${this.opts.tokenBudget} reached`);
        // With neither text nor a tool call, Mozaik's loop finds no next state and throws where nobody hears it.
        const usable = output.items.some((i) => i instanceof FunctionCallItem || i instanceof ModelMessageItem);
        return usable || input.structuredOutput ? output : { ...failed('the model returned no text and no tool call'), tokenUsage: output.tokenUsage };
      } catch (e) {
        const { message, retryMs, daily } = describe(e);
        if (daily) this.stop(`daily quota exhausted: ${message}`);
        if (daily || !retryMs || attempt >= this.opts.maxRetries) {
          this.usage.failed += 1;
          return failed(message);
        }
        wait = retryMs;
      } finally {
        this.active -= 1;
        this.pump();
      }
      // The slot is released before waiting, so other calls can use it meanwhile.
      this.usage.retries += 1;
      this.opts.log?.(`model call to ${input.model} rate-limited; retrying in ${Math.round(wait / 1000)} s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  async *stream(): AsyncGenerator<SemanticEvent> {
    throw new Error('Obstat does not stream inference');
  }

  /** Why the runner stopped serving calls, if it has. */
  get stopReason(): string | null {
    return this.stopped;
  }

  private stop(reason: string) {
    if (this.stopped) return;
    this.stopped = reason;
    this.opts.log?.(`model calls stopped: ${reason}`);
  }

  private slot(priority: number): Promise<void> {
    return new Promise((start) => {
      this.queue.push({ priority, seq: this.seq++, start });
      this.queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
      this.pump();
    });
  }

  private pump() {
    if (this.timer) return;
    const now = Date.now();
    while (this.started.length && now - this.started[0] > 60_000) this.started.shift();
    while (this.queue.length && this.active < this.opts.maxConcurrent && this.started.length < this.opts.callsPerMinute) {
      this.active += 1;
      this.started.push(now);
      this.queue.shift()!.start();
    }
    if (this.queue.length && this.started.length >= this.opts.callsPerMinute) {
      this.timer = setTimeout(() => { this.timer = null; this.pump(); }, 60_000 - (now - this.started[0]) + 50);
    }
  }

  private record(input: InferenceInput, output: InferenceOutput) {
    if (!this.opts.recordTo) return;
    mkdirSync(dirname(this.opts.recordTo), { recursive: true });
    const items = output.items.map(serializeItem);
    appendFileSync(this.opts.recordTo, `${JSON.stringify({ key: requestKey(input), model: input.model, items, tokens: output.tokenUsage?.totalTokens ?? 0 })}\n`);
  }
}

function failed(reason: string): InferenceOutput {
  return { items: [ModelMessageItem.rehydrate({ text: `${FAILED}: ${reason}]` })], tokenUsage: undefined, rowResponse: null };
}

/** The message, whether to retry and after how long, and whether a daily quota is spent. */
export function describe(e: unknown): { message: string; retryMs: number | null; daily: boolean } {
  const raw = String((e as Error)?.message ?? e);
  const status = (e as { status?: number })?.status ?? Number(raw.match(/"code":\s*(\d{3})/)?.[1] ?? raw.match(/\b(429|500|502|503|504)\b/)?.[1] ?? 0);
  const daily = status === 429 && /per ?day|PerDay|requests_per_day|daily/i.test(raw);
  const delay = raw.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)?.[1];
  // A dropped connection has no HTTP status; it is as worth retrying as a rate limit.
  const cause = String((e as { cause?: { code?: string } })?.cause?.code ?? '');
  const network = !status && /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|socket hang up|network/i.test(`${raw} ${cause}`);
  const retryable = status === 429 || status >= 500 || network;
  const retryMs = retryable ? (delay ? Math.ceil(Number(delay) * 1000) + 500 : network ? 10_000 : 15_000) : null;
  const message = raw.match(/"message":\s*"([^"]+)"/)?.[1] ?? raw;
  return { message: message.slice(0, 400), retryMs, daily };
}

type Serialized = { type: 'function_call'; callId: string; name: string; args: string } | { type: 'message'; text: string };

function serializeItem(item: InferenceOutput['items'][number]): Serialized | null {
  if (item instanceof FunctionCallItem) return { type: 'function_call', callId: item.callId, name: item.name, args: item.args };
  if (item instanceof ModelMessageItem) return { type: 'message', text: item.content.text };
  return null;
}

/**
 * A request's identity for replay: the model and the context's text, with review IDs blanked because they count
 * across the whole run and so differ when loops interleave differently.
 */
export function requestKey(input: InferenceInput): string {
  const text = input.context.getItems().map((item) => {
    if (item instanceof FunctionCallItem) return `call:${item.name}:${item.args}`;
    if (item instanceof FunctionCallOutputItem) return `out:${item.output.text}`;
    const content = (item as { content?: { text?: string } }).content;
    return `${item.getType()}:${content?.text ?? ''}`;
  }).join('\n').replace(/rv_\d+/g, 'rv_');
  return createHash('sha256').update(`${input.model}\n${text}`).digest('hex').slice(0, 32);
}
