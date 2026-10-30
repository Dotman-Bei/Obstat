// S1 Run. Its question: where did the Critic hold a writer, and who kept working while it waited?
import { headlineHold, type Hold, type Model } from '../data/model.ts';
import { store } from '../data/store.ts';
import { Timeline, legend } from '../components/timeline.ts';
import { checkNames, clock, plural, secs, who } from '../lib/format.ts';
import { el, html, type Markup } from '../lib/html.ts';
import type { Screen } from './screen.ts';

const FEED_LINES = 9;
const HOLD_ROWS = 5;

/** "Writers 1 and 3", or the names joined when they are not all writers. */
function joinWriters(ids: string[]): string {
  const names = ids.map(who);
  if (names.length > 1 && names.every((n) => n.startsWith('Writer '))) {
    const nums = names.map((n) => n.slice(7));
    return `Writers ${nums.slice(0, -1).join(', ')} and ${nums.at(-1)}`;
  }
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

export function finding(m: Model): string {
  const h = headlineHold(m);
  if (!h) {
    if (!m.events.length) return 'Waiting for the trace.';
    return m.holds.length ? `${plural(m.holds.length, 'write')} held so far. None has failed yet.` : 'No write has been held yet.';
  }
  const fails = h.verdict!.claims;
  // Lead with a claim's own explanation (C3 or C4 names whose record it is) over C2's bare mismatch, as the hold screen does.
  const main = fails.find((c) => c.n !== 'proposal' && c.check !== 'C2') ?? fails.find((c) => c.check !== 'C2') ?? fails[0];
  const kept = [...new Set(m.loops
    .filter((l) => l.producer.startsWith('W') && l.producer !== h.writer && l.start <= h.start && (l.end ?? m.horizon) >= h.end!)
    .map((l) => l.producer))].sort();
  const keptText = kept.length ? ` ${joinWriters(kept)} kept working the whole time.` : '';
  const claim = main.n === 'proposal' ? 'the proposal' : `claim ${main.n}`;
  return `The Critic held ${who(h.writer)} for ${secs(h.end! - h.start)} and failed ${claim} on ${main.check}, ${checkNames[main.check].toLowerCase()}.${keptText}`;
}

export function resultPill(h: Hold): Markup {
  if (!h.verdict) return html`<span class="pill">Checking</span>`;
  if (h.verdict.pass) return html`<span class="pill pos">Passed</span>`;
  const checks = [...new Set(h.verdict.claims.map((c) => c.check))].join(', ');
  return html`<span class="pill neg">Failed ${checks}</span>`;
}

export function runScreen(): Screen {
  const root = el(html`<div class="stack run">
    <header class="title-row" style="margin-bottom:0">
      <div><h1>Run</h1><p class="sub" data-finding>&nbsp;</p></div>
      <p class="stamp" data-stamp></p>
    </header>
    <section class="kpis" aria-label="Counters" data-kpis></section>
    <section class="panel" aria-labelledby="tl-h">
      <header class="tl-head"><h2 id="tl-h">Loops by participant</h2>${legend()}</header>
      <p class="readout" data-readout aria-live="polite"></p>
      <div class="timeline" data-timeline></div>
      <p class="panel-foot">Trace Observer and UI Bridge record every event. They run no loops, so they have no lane.</p>
    </section>
    <div class="pair">
      <section class="panel" aria-labelledby="holds-h">
        <header><h2 id="holds-h">Latest holds</h2><a class="card-link" href="#/holds" data-all-holds>View all</a></header>
        <div data-holds></div>
      </section>
      <section class="panel" aria-labelledby="trace-h">
        <header><h2 id="trace-h">Trace</h2><span class="meta">Newest first, as in out/trace.jsonl</span></header>
        <ol class="feed" data-feed></ol>
      </section>
    </div>
  </div>`);

  const $ = (k: string) => root.querySelector<HTMLElement>(`[data-${k}]`)!;
  let model: Model | null = null;
  const pinned = (): { t: number; hold: Hold } | null => {
    const h = model && headlineHold(model);
    return h ? { t: timeline.momentIn(h), hold: h } : null;
  };
  const timeline: Timeline = new Timeline($('timeline'), $('readout'), pinned);
  let lastFeedTop = -1;

  function render(m: Model, reason: string) {
    model = m;
    timeline.update(m, { start: store.start, end: store.end, horizon: store.horizon });
    $('stamp').textContent = store.mode === 'live' ? `Live · ${plural(m.events.length, 'trace line')}`
      : store.playing ? `Replaying at ${store.speed}×` : `Replay of ${store.source} · ${plural(m.events.length, 'line')}`;
    // The playhead moved but no new line arrived: only the bars grow.
    if (reason === 'tick') return;

    $('finding').textContent = finding(m);

    const c = m.counters;
    const pairs = new Set(m.holds.map((h) => h.pairId)).size;
    $('kpis').innerHTML = html`
      <div class="kpi"><div class="kpi-label">Loops running</div><div class="kpi-value">${c.running}</div><div class="kpi-note">${m.peak.n ? `Most at once: ${m.peak.n}, at ${clock(m.peak.at)}` : '—'}</div></div>
      <div class="kpi"><div class="kpi-label">Holds</div><div class="kpi-value">${c.holds}</div><div class="kpi-note">${c.holds ? `On ${plural(pairs, 'pair')}` : '—'}</div></div>
      <div class="kpi"><div class="kpi-label">Passed</div><div class="kpi-value">${c.passed}</div><div class="kpi-note">Released to write_proposal</div></div>
      <div class="kpi"><div class="kpi-label">Failed</div><div class="kpi-value">${c.failed}</div><div class="kpi-note">Sent back to the writer</div></div>
      <div class="kpi"><div class="kpi-label">Proposals written</div><div class="kpi-value">${c.written}</div><div class="kpi-note">${c.abandoned ? `${plural(c.abandoned, 'pair')} abandoned` : 'None abandoned'}</div></div>`.value;

    const latest = [...m.holds].sort((a, b) => b.start - a.start).slice(0, HOLD_ROWS);
    $('all-holds').textContent = `View all ${m.holds.length}`;
    $('all-holds').hidden = m.holds.length === 0;
    $('holds').innerHTML = latest.length
      ? html`<table class="rtable"><thead><tr><th>Hold</th><th>Writer</th><th>Pair</th><th class="n">Round</th><th class="n">Held for</th><th class="n">Result</th></tr></thead><tbody>
          ${latest.map((h) => html`<tr class="link-row" data-href="#/holds/${h.reviewId}">
            <td class="c-main"><a class="ref" href="#/holds/${h.reviewId}">${h.reviewId}</a></td>
            <td class="c-meta">${who(h.writer)}</td>
            <td class="c-meta">${h.pairId}</td>
            <td class="c-meta n"><span class="ph">Round </span>${h.round}</td>
            <td class="c-meta n">${h.end != null ? secs(h.end - h.start) : 'held'}</td>
            <td class="c-end n">${resultPill(h)}</td></tr>`)}
        </tbody></table>`.value
      : html`<p class="empty">No write has reached the gate yet.</p>`.value;

    const lines = m.events.slice(-FEED_LINES).reverse();
    const fresh = lastFeedTop >= 0 ? m.events.length - lastFeedTop : 0;
    lastFeedTop = m.events.length;
    $('feed').innerHTML = lines.length
      ? lines.map((e, i) => html`<li class="${i < fresh && store.playing ? 'fresh' : ''}"><time class="t">${clock(e.ms)}</time><span class="p">${e.producer}</span><span class="s" title="${e.type} · ${e.summary}"><b>${e.type}</b> ${e.summary}</span></li>`).join('')
      : html`<li class="empty">The trace is empty.</li>`.value;
  }

  root.addEventListener('click', (e) => {
    const row = (e.target as Element).closest<HTMLElement>('tr[data-href]');
    if (row && !(e.target as Element).closest('a')) location.hash = row.dataset.href!;
  });

  return {
    title: 'Run', nav: 'run', el: root,
    update: (m, reason) => render(m, reason),
    destroy: () => timeline.destroy(),
  };
}
