// S3 Proposal. Its question: what is proposed, and does every claim stand on a cited record?
import { pairStatus, type Hold, type Model } from '../data/model.ts';
import { getJSON } from '../data/store.ts';
import type { Proposal } from '../data/types.ts';
import { clock, formatNames, kindNames, plural, who } from '../lib/format.ts';
import { el, html, raw, type Markup } from '../lib/html.ts';
import { linkIds, ref } from '../lib/refs.ts';
import { statusPill } from './proposals.ts';
import type { Screen } from './screen.ts';

/** Section text with `{n}` claim markers turned into small buttons that jump to the claim's row. */
/** {3} and {1, 2} become one marker button per claim. */
function withMarkers(text: string): Markup {
  return raw(text.split(/(\{\s*\d+(?:\s*,\s*\d+)*\s*\})/).map((part) => {
    const nums = /^\{[\d\s,]+\}$/.test(part) ? part.match(/\d+/g)! : null;
    return nums
      ? nums.map((n) => html`<button type="button" class="cite" data-claim="${n}" aria-label="Claim ${n}">${n}</button>`.value).join('')
      : html`${part}`.value;
  }).join(''));
}

export function proposalScreen(pairId: string): Screen {
  const root = el(html`<div class="proposal"></div>`);
  let p: Proposal | null = null;
  let error: { status?: number; message: string } | null = null;
  let model: Model | null = null;

  const load = () => {
    error = null;
    getJSON<Proposal>(`/api/proposals/${encodeURIComponent(pairId)}`)
      .then((x) => { p = x; })
      .catch((e: Error & { status?: number }) => { error = { status: e.status, message: e.message }; })
      .finally(() => model && render(model));
  };

  function render(m: Model) {
    model = m;
    const crumbs = html`<nav class="crumbs" aria-label="Breadcrumb"><a href="#/proposals">Proposals</a><span aria-hidden="true">/</span><span>${pairId}</span></nav>`;
    if (error) {
      root.innerHTML = html`${crumbs}<header class="title-row"><div><h1>${error.status === 404 ? `No proposal ${pairId}` : 'Proposal'}</h1>
        <p class="sub">${error.status === 404 ? 'This run has no pair with that ID.' : ''}</p></div></header>
        ${error.status === 404 ? html`<a class="card-link" href="#/proposals">All proposals</a>` : html`<p class="error">Couldn’t reach /api/proposals/${pairId}. <button type="button" data-retry>Retry</button></p>`}`.value;
      return;
    }
    if (!p) {
      root.innerHTML = html`${crumbs}<header class="title-row"><div><h1><span class="skeleton" style="width:420px">Loading the proposal</span></h1><p class="sub"><span class="skeleton" style="width:360px">&nbsp;</span></p></div></header>`.value;
      return;
    }

    const status = pairStatus(m, pairId);
    const holds = m.holds.filter((h) => h.pairId === pairId).sort((a, b) => a.round - b.round);
    const last: Hold | undefined = holds.at(-1);
    const s = p.sections;
    const lede = html`${formatNames[p.format]} · ${p.researcherName} (${ref(p.researcherId)}) with ${p.companyName} on ${ref(p.challengeId)}.`;

    if (status !== 'written' && status !== 'abandoned') {
      root.innerHTML = html`${crumbs}<header class="title-row"><div><h1>${s.title}</h1><p class="sub">${lede}</p></div></header>
        <p class="notice">${status === 'writing' ? `${who(p.writerId)} is still writing this proposal at ${clock(m.horizon)} in the replay.` : `This pair has not been taken up yet at ${clock(m.horizon)} in the replay.`}
        Press Instant to see the finished run.</p>`.value;
      return;
    }

    const verdictChecks = (n: number) => last?.verdict?.checks.filter((c) => c.target === n) ?? [];
    const writtenAt = m.points.find((x) => x.pairId === pairId)?.t;
    const plan = s.plan.split('\n').map((row) => row.split('|').map((c) => c.trim()));

    root.innerHTML = html`${crumbs}
      <header class="title-row">
        <div><h1>${s.title}</h1><p class="sub">${lede}</p></div>
        ${statusPill(status)}
      </header>
      <div class="proposal-grid">
        <article class="panel doc" aria-label="Proposal">
          ${status === 'abandoned' ? html`<p class="notice">Abandoned after ${plural(holds.length, 'round')}. ${linkIds(p.abandonReason ?? '')} This is the last draft the writer submitted; it was never written to out/proposals/.</p>` : ''}
          <section><h2>The problem</h2><p>${withMarkers(s.problem)}</p></section>
          <section><h2>Research questions</h2><ol class="rq">${s.researchQuestions.map((q) => html`<li>${q}</li>`)}</ol></section>
          <section><h2>Plan</h2>
            <div class="table-wrap"><table class="plan"><thead><tr><th>When</th><th>Work</th><th>Result</th></tr></thead>
            <tbody>${plan.map(([when, work, out]) => html`<tr><td>${withMarkers(when ?? "")}</td><td>${withMarkers(work ?? "")}</td><td>${withMarkers(out ?? "")}</td></tr>`)}</tbody></table></div>
          </section>
          <section><h2>What each side brings</h2>
            <div class="sides"><div><h3>${p.companyName}</h3><p>${withMarkers(s.eachSideBrings.company)}</p></div>
            <div><h3>Faculty</h3><p>${withMarkers(s.eachSideBrings.faculty)}</p></div></div>
          </section>
          <section><h2>Why this pair</h2><p>${withMarkers(s.whyThisPair)}</p></section>
          <section><h2>Agreed up front</h2><p>${s.agreedUpFront}</p></section>
          <section><h2 id="claims-h">Claims and their records</h2>
            <div class="table-wrap"><table class="claim-table rtable" aria-labelledby="claims-h">
              <thead><tr><th class="n">#</th><th>Claim</th><th>Records</th><th class="n">Critic</th></tr></thead>
              <tbody>${p.claims.map((c) => {
                const checks = verdictChecks(c.n);
                const failed = checks.filter((x) => !x.pass);
                const from = last ? `${last.reviewId}.${c.n}` : undefined;
                const markOf = (id: string) => checks.find((x) => x.record === id && x.mark)?.mark;
                return html`<tr id="claim-${c.n}" data-row="${c.n}">
                  <td class="c-meta n num"><span class="ph">Claim </span>${c.n}</td>
                  <td class="c-main">${c.text}<span class="sub">${kindNames[c.kind]}</span></td>
                  <td class="c-meta">${c.ids.map((id, i) => html`${i ? ', ' : ''}${ref(id, { mark: markOf(id) ?? c.researcherId, from })}`)}</td>
                  <td class="c-end n">${!checks.length ? html`<span class="muted">—</span>` : failed.length
                    ? html`<span class="pill neg">Failed ${failed.map((x) => x.check).join(', ')}</span>`
                    : html`<span class="pill pos" title="${checks.map((x) => x.check).join(', ')}">Passed ${checks.length}</span>`}</td>
                </tr>`;
              })}</tbody></table></div>
            <p class="panel-foot">“Passed 5” means five checks from C1–C10 ran on that claim and all passed, in ${last ? html`<a class="ref" href="#/holds/${last.reviewId}">${last.reviewId}</a>` : 'the last round'}. C8 and C9 run on the whole proposal.</p>
          </section>
        </article>
        <aside class="stack rail">
          <section class="panel" aria-labelledby="verdict-h">
            <header><h2 id="verdict-h">Verdict</h2></header>
            ${last?.verdict ? (last.verdict.pass
              ? html`<p class="verdict">Passed by the Critic in round ${last.round}.</p><p class="muted">${last.reviewId} · ${clock(last.reviewEnd!)}${writtenAt ? html` · written ${clock(writtenAt)}` : ''}</p>`
              : html`<p class="verdict">Failed in round ${last.round}, the last round allowed.</p><p class="muted">${last.reviewId} · ${clock(last.reviewEnd!)}</p>`)
              : html`<p class="muted">No verdict yet.</p>`}
            ${last ? html`<p style="margin-top:12px"><a class="card-link" href="#/holds/${last.reviewId}">Open the hold</a></p>` : ''}
          </section>
          <section class="panel" aria-labelledby="parties-h">
            <header><h2 id="parties-h">Parties</h2></header>
            <dl class="parties">
              <div><dt>Researcher</dt><dd>${p.researcherName}<span>${ref(p.researcherId)}</span></dd></div>
              <div><dt>Company</dt><dd>${p.companyName}<span>${ref(p.companyId)}</span></dd></div>
              <div><dt>Challenge</dt><dd>${ref(p.challengeId)}</dd></div>
              <div><dt>Written by</dt><dd>${who(p.writerId)}</dd></div>
            </dl>
          </section>
          <section class="panel" aria-labelledby="rounds-h">
            <header><h2 id="rounds-h">Rounds</h2><span class="meta">${plural(holds.length, 'hold')}</span></header>
            <ul class="round-list">${holds.map((h) => html`<li><a class="ref" href="#/holds/${h.reviewId}">${h.reviewId}</a><span>Round ${h.round}</span>${h.verdict ? (h.verdict.pass ? html`<span class="pill pos">Passed</span>` : html`<span class="pill neg">Failed ${[...new Set(h.verdict.claims.map((c) => c.check))].join(', ')}</span>`) : html`<span class="pill">Checking</span>`}</li>`)}</ul>
          </section>
        </aside>
      </div>`.value;
  }

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-retry]')) load();
    const cite = t.closest<HTMLElement>('[data-claim]');
    if (cite) {
      const row = root.querySelector<HTMLElement>(`[data-row="${cite.dataset.claim}"]`);
      if (row) {
        row.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
        row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
        row.querySelector<HTMLElement>('a.ref')?.focus({ preventScroll: true });
      }
    }
  });
  load();

  return { title: `Proposal ${pairId}`, nav: 'proposals', el: root, update: (m, reason) => { if (reason !== 'tick') render(m); } };
}
