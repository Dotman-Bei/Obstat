// S3 Proposals, the list. Its question: what has the run proposed so far, and what did it drop?
import { pairStatus, type Model, type PairStatus } from '../data/model.ts';
import { getJSON } from '../data/store.ts';
import type { ProposalListItem } from '../data/types.ts';
import { clock, formatNames, who } from '../lib/format.ts';
import { el, html, type Markup } from '../lib/html.ts';
import { ref } from '../lib/refs.ts';
import type { Screen } from './screen.ts';

type Tab = 'all' | 'written' | 'abandoned';

export function statusPill(s: PairStatus): Markup {
  switch (s) {
    case 'written': return html`<span class="pill pos">Written</span>`;
    case 'abandoned': return html`<span class="pill warn">Abandoned</span>`;
    case 'writing': return html`<span class="pill">Writing</span>`;
    case 'shortlisted': return html`<span class="pill">Shortlisted</span>`;
  }
}

export function proposalsScreen(query: URLSearchParams): Screen {
  const tab = (['written', 'abandoned'].includes(query.get('show') ?? '') ? query.get('show') : 'all') as Tab;
  const root = el(html`<div class="proposals"></div>`);
  let items: ProposalListItem[] | null = null;
  let error = '';
  let model: Model | null = null;

  const load = () => {
    error = '';
    getJSON<ProposalListItem[]>('/api/proposals')
      .then((x) => { items = x; })
      .catch((e: Error) => { error = e.message; })
      .finally(() => model && render(model));
  };

  function render(m: Model) {
    model = m;
    const rows = (items ?? [])
      .map((i) => ({ i, s: pairStatus(m, i.pairId) }))
      .filter((r): r is { i: ProposalListItem; s: PairStatus } => r.s !== null);
    const count = (s: PairStatus) => rows.filter((r) => r.s === s).length;
    const written = count('written'), abandoned = count('abandoned'), open = rows.length - written - abandoned;
    const shown = rows.filter((r) => tab === 'all' || r.s === tab);
    const holdsFor = (pairId: string) => m.holds.filter((h) => h.pairId === pairId);
    const when = (r: { i: ProposalListItem; s: PairStatus }) => m.points.find((p) => p.pairId === r.i.pairId)?.t;

    const sub = !items ? (error ? 'The proposal list could not be loaded.' : 'Loading proposals.')
      : !rows.length ? 'No pair has been shortlisted yet.'
      : [`${written} written`, abandoned && `${abandoned} abandoned after the round cap`, open && `${open} in progress`].filter(Boolean).join(', ') + '.';

    root.innerHTML = html`
      <header class="title-row"><div><h1>Proposals</h1><p class="sub">${sub}</p></div>
        <p class="stamp">Sorted by the time each was written or abandoned</p></header>
      <nav class="tabs" aria-label="Filter proposals">
        ${(['all', 'written', 'abandoned'] as Tab[]).map((t) => html`<a href="#/proposals${t === 'all' ? '' : `?show=${t}`}" ${t === tab ? html`aria-current="page"` : ''}>${t === 'all' ? 'All' : t === 'written' ? 'Written' : 'Abandoned'}<span class="count num">${t === 'all' ? rows.length : count(t)}</span></a>`)}
      </nav>
      ${error ? html`<p class="error">Couldn’t reach /api/proposals. <button type="button" data-retry>Retry</button></p>`
        : !items ? html`<table class="rtable"><tbody>${[0, 1, 2].map(() => html`<tr><td class="c-main"><span class="skeleton" style="width:320px">Loading</span></td><td class="c-end"><span class="skeleton" style="width:72px">Loading</span></td></tr>`)}</tbody></table>`
        : !shown.length ? html`<p class="empty">${tab === 'abandoned' ? 'No pair has been abandoned.' : 'No proposal has been written yet.'}</p>`
        : html`<table class="rtable proposals-table">
          <thead><tr><th>Proposal</th><th>Researcher</th><th>Company and challenge</th><th class="n">Rounds</th><th class="n">Result</th><th class="n">Time</th></tr></thead>
          <tbody>${shown.map((r) => {
            const hs = holdsFor(r.i.pairId);
            const t = when(r);
            return html`<tr class="link-row" data-href="#/proposals/${r.i.pairId}">
              <td class="c-main"><a class="row-title" href="#/proposals/${r.i.pairId}">${r.i.title}</a><span class="sub">${r.i.pairId} · ${formatNames[r.i.format]} · ${who(r.i.writerId)}</span></td>
              <td class="c-meta">${r.i.researcherName}<span class="sub">${ref(r.i.researcherId)}</span></td>
              <td class="c-meta">${r.i.companyName}<span class="sub">${ref(r.i.challengeId)}</span></td>
              <td class="c-meta n"><span class="ph">Rounds </span>${hs.length || '—'}</td>
              <td class="c-end n">${statusPill(r.s)}</td>
              <td class="c-meta n">${t ? clock(t) : '—'}</td>
            </tr>`;
          })}</tbody></table>`}`.value;
  }

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-retry]')) load();
    const row = t.closest<HTMLElement>('tr[data-href]');
    if (row && !t.closest('a')) location.hash = row.dataset.href!;
  });
  load();

  return {
    title: 'Proposals', nav: 'proposals', el: root,
    update: (m, reason) => { if (reason !== 'tick') render(m); },
  };
}

