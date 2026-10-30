// What every participant gets, and the agent wrapper they share.
import { DeveloperMessageItem, ModelContext, SemanticEvent, createAgent, type Agent, type defineRuntime, type InterceptionHandler, type Participant, type SituationHandler, type StructuredOutputFormat, type Tool } from '@mozaik-ai/core';
import type { Config } from '../config.ts';
import type { SearchIndex } from '../data/search.ts';
import type { GuardedRunner } from '../llm.ts';
import { on } from '../situations.ts';
import type { ObstatState } from '../state.ts';

export type Runtime = ReturnType<typeof defineRuntime<ObstatState>>;

export interface Ctx {
  config: Config;
  state: ObstatState;
  rt: Runtime;
  llm: GuardedRunner;
  search: SearchIndex;
  /** Seed the R0139 demo pair (PRD F5). */
  demo: boolean;
  today: Date;
  log: (line: string) => void;
}

/** Sends one of Obstat's own events. Its summary becomes the trace line's text. */
export function emit(ctx: Ctx, from: Participant, type: string, payload: { summary: string } & Record<string, unknown>): void {
  ctx.rt.sendEvent(SemanticEvent.create(type, from.getId(), payload), from.getId());
}

/** A handler wrapper that reports errors to the run's log instead of the console. */
export function handle<P = any>(ctx: Ctx, types: string | string[], apply: (event: SemanticEvent<string, P>) => void | Promise<void>): SituationHandler {
  return on<P>(types, (e) => apply(e), (error, event) => ctx.log(`handler for ${event.type} failed: ${(error as Error)?.stack ?? error}`));
}

export interface AgentSpec {
  name: string;
  instruction: string;
  tools?: Tool[];
  model: string;
  priority: number;
  handlers?: (self: AgentRunner) => SituationHandler[];
}

const LOOP_TIMEOUT_MS = 10 * 60_000;

/** An agent that runs one loop at a time, each with its own ModelContext (T4), and hears its own answer. */
export class AgentRunner {
  readonly agent: Agent;
  readonly name: string;
  private readonly ctx: Ctx;
  private readonly spec: AgentSpec;
  private pending: ((answer: string) => void) | null = null;

  constructor(ctx: Ctx, spec: AgentSpec) {
    this.ctx = ctx;
    this.spec = spec;
    this.name = spec.name;
    this.agent = createAgent({ name: spec.name, capabilities: [], instruction: spec.instruction, tools: spec.tools ?? [], handlers: [] });
    this.agent.setHandlers([
      handle(ctx, 'model.answer', (e) => {
        if (e.producerId !== this.agent.getId() || !this.pending) return;
        const resolve = this.pending;
        this.pending = null;
        resolve(String((e.payload as any)?.answer?.content?.text ?? ''));
      }),
      ...(spec.handlers?.(this) ?? []),
    ]);
    ctx.rt.join(this.agent);
  }

  get id(): string {
    return this.agent.getId();
  }

  get busy(): boolean {
    return this.pending !== null;
  }

  /** Runs one loop and resolves with its final answer. A loop that never answers resolves after a watchdog timeout. */
  run(message: string, opts: { label: string; data?: Record<string, unknown>; tools?: Tool[]; gate?: InterceptionHandler; structuredOutput?: StructuredOutputFormat }): Promise<string> {
    if (this.pending) throw new Error(`${this.name} is already running a loop`);
    const { state, llm, rt } = this.ctx;
    state.loopIntent.set(this.name, { label: opts.label, data: opts.data });
    const context = llm.prioritize(ModelContext.create(), this.spec.priority);
    context.addContextItem(DeveloperMessageItem.create(this.spec.instruction));
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!this.pending) return;
        this.pending = null;
        resolve(`[loop timed out after ${LOOP_TIMEOUT_MS / 60_000} minutes]`);
      }, LOOP_TIMEOUT_MS);
      this.pending = (answer) => {
        clearTimeout(timer);
        resolve(answer);
      };
      rt.runLoop(this.id, message, { model: this.spec.model, tools: opts.structuredOutput ? undefined : (opts.tools ?? this.spec.tools ?? []), structuredOutput: opts.structuredOutput, context }, opts.gate);
    });
  }
}

/** Wraps a tool's invoke so it returns { error } instead of throwing (T5). */
export function tool(spec: Omit<Tool, 'type' | 'strict' | 'invoke'> & { strict?: boolean; invoke: (args: any) => unknown | Promise<unknown> }): Tool {
  return {
    type: 'function',
    strict: spec.strict ?? true,
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    invoke: async (args) => {
      try {
        return await spec.invoke(args);
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  };
}
