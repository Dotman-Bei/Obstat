// Holds list. Its question: which writes were held, and which failed?
import type { Model } from '../data/model.ts';
import { checkNames, clock, plural, secs, who } from '../lib/format.ts';
import { el, html } from '../lib/html.ts';
import type { Screen } from './screen.ts';

type Tab = 'all' | 'failed' | 'passed';

export function holdsScreen(query: URLSearchParams): Screen {
  const tab = (['failed', 'passed'].includes(query.get('show') ?? '') ? query.get('show') : 'all') as Tab;
  const root = el(html`<div class="holds"></div>`);

  function render(m: Model) {
    const holds = [...m.holds].sort((a, b) => a.start - b.start);
    const failed = holds.filter((h) => h.verdict?.pass === false);
    const passed = holds.filter((h) => h.verdict?.pass === true);
    const shown = tab === 'failed' ? failed : tab === 'passed' ? passed : holds;
    const longest = holds.filter((h) => h.end != null).reduce((a, h) => Math.max(a, h.end! - h.start), 0);

    root.innerHTML = html`
      <header class="title-row"><div><h1>Holds</h1>
        <p class="sub">${holds.length
          ? `${plural(holds.length, 'write')} held, ${failed.length} failed and ${failed.length === 1 ? 'was' : 'were'} sent back to the writer.${longest ? ` The longest hold lasted ${secs(longest)}.` : ''}`
          : 'No write has reached the gate yet.'}</p></div>
        <p class="stamp">In the order the gate held them</p></header>
      <nav class="tabs" aria-label="Filter holds">
        ${(['all', 'failed', 'passed'] as Tab[]).map((t) => html`<a href="#/holds${t === 'all' ? '' : `?show=${t}`}" ${t === tab ? html`aria-current="page"` : ''}>${t === 'all' ? 'All' : t === 'failed' ? 'Failed' : 'Passed'}<span class="count num">${t === 'all' ? holds.length : t === 'failed' ? failed.length : passed.length}</span></a>`)}
      </nav>
      ${!shown.length ? html`<p class="empty">${tab === 'failed' ? 'No hold has failed.' : tab === 'passed' ? 'No hold has passed yet.' : 'No write has reached the gate yet.'}</p>`
        : html`<table class="rtable holds-table">
        <thead><tr><th>Hold</th><th>Writer</th><th>Pair</th><th class="n">Round</th><th class="n">Claims</th><th>Failed checks</th><th class="n">Held at</th><th class="n">Held for</th><th class="n">Result</th></tr></thead>
        <tbody>${shown.map((h) => {
          const fails = h.verdict?.claims ?? [];
          const byClaim = [...new Set(fails.map((f) => f.n))].map((n) => `${n === 'proposal' ? 'proposal' : `claim ${n}`}: ${fails.filter((f) => f.n === n).map((f) => f.check).join(', ')}`);
          return html`<tr class="link-row" data-href="#/holds/${h.reviewId}">
            <td class="c-main"><a class="ref" href="#/holds/${h.reviewId}">${h.reviewId}</a></td>
            <td class="c-meta">${who(h.writer)}</td>
            <td class="c-meta">${h.pairId}</td>
            <td class="c-meta n"><span class="ph">Round </span>${h.round}</td>
            <td class="c-meta n">${h.request?.claims.length ?? '—'}<span class="ph"> claims</span></td>
            <td class="c-meta">${byClaim.length ? html`<span title="${fails.map((f) => `${f.check} ${checkNames[f.check]}`).join('; ')}">${byClaim.join('; ')}</span>` : html`<span class="muted">—</span>`}</td>
            <td class="c-meta n">${clock(h.start)}</td>
            <td class="c-meta n">${h.end != null ? secs(h.end - h.start) : 'held'}</td>
            <td class="c-end n">${!h.verdict ? html`<span class="pill">Checking</span>` : h.verdict.pass ? html`<span class="pill pos">Passed</span>` : html`<span class="pill neg">Failed</span>`}</td>
          </tr>`;
        })}</tbody></table>`}`.value;
  }

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const row = t.closest<HTMLElement>('tr[data-href]');
    if (row && !t.closest('a')) location.hash = row.dataset.href!;
  });

  return { title: 'Holds', nav: 'holds', el: root, update: (m, reason) => { if (reason !== 'tick') render(m); } };
}
