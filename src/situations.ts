// Small helpers for Mozaik situation handlers.
import { SituationSpecification, type SemanticEvent, type SituationContext, type SituationHandler } from '@mozaik-ai/core';

export class EventIs extends SituationSpecification {
  readonly types: ReadonlySet<string> | null;

  /** Matches the given event types; with none, matches every event. */
  constructor(...types: string[]) {
    super();
    this.types = types.length ? new Set(types) : null;
  }

  isSatisfiedBy({ event }: SituationContext): boolean {
    return !this.types || this.types.has(event.type);
  }
}

/** Mozaik calls handlers without awaiting them, so a rejection would go unhandled: report it instead. */
export function on<P = any>(
  types: string | string[],
  apply: (event: SemanticEvent<string, P>, ctx: SituationContext) => void | Promise<void>,
  onError: (error: unknown, event: SemanticEvent) => void = (e) => console.error(e),
): SituationHandler {
  const list = Array.isArray(types) ? types : [types];
  return {
    specification: new EventIs(...list),
    processor: {
      apply(ctx) {
        try {
          const done = apply(ctx.event as SemanticEvent<string, P>, ctx);
          if (done) done.catch((e) => onError(e, ctx.event));
        } catch (e) {
          onError(e, ctx.event);
        }
      },
    },
  };
}
