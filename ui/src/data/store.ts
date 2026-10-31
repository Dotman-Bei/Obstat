// The console's one source of truth: the trace lines received on /events, and where playback stands.
// Playback is local to this browser. It never reaches the run (PRD §11.3: read-only).
import type { TraceLine } from './types.ts';

export type Speed = 1 | 4 | 'instant';
export interface Ev extends TraceLine { ms: number; i: number }

type Reason = 'events' | 'tick' | 'status';
type Listener = (reason: Reason) => void;

const state = {
  events: [] as Ev[],
  mode: 'replay' as 'replay' | 'live',
  source: 'out/trace.jsonl',
  connected: false,
  done: false,
  error: '' as string,
  speed: 'instant' as Speed,
  playing: false,
  /** Milliseconds of run time shown, counted from the first event. */
  cursor: Infinity,
};

const listeners = new Set<Listener>();
const notify = (r: Reason) => listeners.forEach((l) => l(r));
export const subscribe = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };

export const store = {
  get events() { return state.events; },
  get mode() { return state.mode; },
  get source() { return state.source; },
  get done() { return state.done; },
  get error() { return state.error; },
  get speed() { return state.speed; },
  get playing() { return state.playing; },
  get start() { return state.events[0]?.ms ?? 0; },
  get end() { return state.events.at(-1)?.ms ?? 0; },
  /** The last moment of the run that is on screen. */
  get horizon() { return Math.min(this.start + state.cursor, this.end); },
  get atEnd() { return state.cursor >= this.end - this.start; },
  /** Every line up to the horizon. */
  visible(): Ev[] {
    if (state.cursor === Infinity || this.atEnd) return state.events;
    const h = this.horizon;
    let lo = 0, hi = state.events.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (state.events[mid].ms <= h) lo = mid + 1; else hi = mid; }
    return state.events.slice(0, lo);
  },
};

// ---------- playback ----------
let raf = 0, last = 0, lastCount = -1, lastTick = 0;
function frame(now: number) {
  const dt = now - last; last = now;
  const total = store.end - store.start;
  state.cursor = Math.min(state.cursor + dt * (state.speed === 'instant' ? Infinity : state.speed), total);
  if (state.cursor >= total) state.playing = false;
  const count = store.visible().length;
  if (count !== lastCount) { lastCount = count; notify('events'); }
  if (now - lastTick > 90 || !state.playing) { lastTick = now; notify('tick'); }
  if (state.playing) raf = requestAnimationFrame(frame);
  else notify('status');
}

function play() {
  cancelAnimationFrame(raf);
  state.playing = true; last = performance.now(); lastCount = -1;
  raf = requestAnimationFrame(frame);
  notify('status');
}

export function setSpeed(speed: Speed) {
  state.speed = speed;
  if (speed === 'instant') {
    cancelAnimationFrame(raf);
    state.playing = false; state.cursor = Infinity;
    notify('events'); notify('status');
    return;
  }
  if (store.atEnd) state.cursor = 0;
  play();
}

export function replay() {
  if (state.speed === 'instant') state.speed = 1;
  state.cursor = 0;
  play();
}

// ---------- connection ----------
export function connect() {
  const es = new EventSource('/events');
  es.addEventListener('mode', (e) => {
    const m = JSON.parse((e as MessageEvent).data) as { mode: 'replay' | 'live'; source?: string };
    state.mode = m.mode;
    if (m.source) state.source = m.source;
    if (m.mode === 'live') { state.speed = 'instant'; state.cursor = Infinity; }
    notify('status');
  });
  let pending = false;
  es.onmessage = (e) => {
    const line = JSON.parse(e.data) as TraceLine;
    state.events.push({ ...line, ms: Date.parse(line.t), i: state.events.length });
    state.connected = true; state.error = '';
    // Batch the notifications: a replay sends a few hundred lines in one burst.
    if (!pending) { pending = true; queueMicrotask(() => { pending = false; notify('events'); }); }
  };
  es.addEventListener('done', () => { state.done = true; es.close(); notify('status'); });
  es.onerror = () => {
    if (state.done) return;
    state.error = state.connected ? 'Lost the connection to /events. Reconnecting.' : 'Couldn’t reach /events.';
    if (state.mode === 'replay' && !state.connected) es.close();
    notify('status');
  };
}

// ---------- read endpoints ----------
const cache = new Map<string, Promise<unknown>>();
export function getJSON<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(path).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error((body as { error?: string }).error ?? `${path} answered ${r.status}`), { status: r.status });
      return body;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}
