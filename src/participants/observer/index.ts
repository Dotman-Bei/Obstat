// Trace Observer: handlers only. Appends one JSON line per event to out/trace.jsonl, prints a readable line, and marks
// a loop stalled when it has had no event for stallMs (issue #114). It never sends events or writes run state.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHuman, type Human } from '@mozaik-ai/core';
import { TraceConverter, terminalLine, type TraceLine } from '../../trace.ts';
import { handle, type Ctx } from '../shared.ts';

export interface Observer {
  participant: Human;
  /** Other consumers of the same lines (the UI Bridge). */
  subscribe(fn: (line: TraceLine) => void): void;
  /** The most loops that were running at once (T7). */
  peak(): number;
  stop(): void;
}

export function createObserver(ctx: Ctx, tracePath: string, opts: { print?: boolean } = {}): Observer {
  mkdirSync(dirname(tracePath), { recursive: true });
  writeFileSync(tracePath, '');
  const converter = new TraceConverter(ctx.state);
  const listeners: ((line: TraceLine) => void)[] = [];
  const lastSeen = new Map<string, { producer: string; at: number; stalled: boolean }>();
  let peak = 0;

  const write = (line: TraceLine) => {
    appendFileSync(tracePath, `${JSON.stringify(line)}\n`);
    if (opts.print !== false) {
      const text = terminalLine(line);
      if (text) console.log(text);
    }
    for (const fn of listeners) fn(line);
  };

  const participant = createHuman({
    name: 'TO',
    capabilities: ['observe'],
    handlers: [handle(ctx, [], (event) => {
      for (const line of converter.convert(event)) {
        if (line.loopId) {
          if (line.type === 'loop.finished') lastSeen.delete(line.loopId);
          else lastSeen.set(line.loopId, { producer: line.producer, at: Date.now(), stalled: false });
          peak = Math.max(peak, lastSeen.size);
        }
        write(line);
      }
    })],
  });
  ctx.rt.join(participant);

  const watch = setInterval(() => {
    const now = Date.now();
    for (const [loopId, s] of lastSeen) {
      if (s.stalled || now - s.at < ctx.config.stallMs) continue;
      s.stalled = true;
      ctx.state.loops.set(loopId, { participant: s.producer, loopId, lastEventAt: s.at, state: 'stalled' });
      write({ t: new Date().toISOString(), type: 'loop.stalled', producer: s.producer, loopId, summary: `no event for ${Math.round((now - s.at) / 1000)} s` });
    }
  }, 5_000);
  watch.unref();

  return {
    participant,
    subscribe: (fn) => listeners.push(fn),
    peak: () => peak,
    stop: () => clearInterval(watch),
  };
}
