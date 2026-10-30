// S2 Hold. Its question: why was this write held, and what did the writer change?
import { overlap, type Hold, type Model } from '../data/model.ts';
import { store } from '../data/store.ts';
import type { CheckId, CheckResult, Claim } from '../data/types.ts';
import { checkIds, checkNames, clock, clockTenths, kindNames, plural, secs, who } from '../lib/format.ts';
import { el, html, type Markup } from '../lib/html.ts';
import { linkIds, ref, type RefContext } from '../lib/refs.ts';
import type { Screen } from './screen.ts';

/** What to highlight when a claim's ID opens the drawer: the value that decided its checks. */
function markFor(h: Hold, n: number) {
  return (id: string): RefContext => {
    const checks = h.verdict?.checks.filter((c) => c.target === n && c.record === id && c.mark) ?? [];
    const decisive = checks.find((c) => !c.pass) ?? checks[0];
    return { mark: decisive?.mark, from: `${h.reviewId}.${n}` };
  };
}

/** The two versions of a sentence, one per line: words dropped are struck in the first, words added marked in the second. */
function diffWords(a: string, b: string): [Markup, Markup] {
  const x = a.split(/\s+/), y = b.split(/\s+/);
  const L = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const keepA = new Set<number>(), keepB = new Set<number>();
  for (let i = 0, j = 0; i < x.length && j < y.length;) {
    if (x[i] === y[j]) { keepA.add(i++); keepB.add(j++); }
    else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  // Consecutive changed words form one run, so a rewritten phrase reads as one mark.
  const line = (words: string[], keep: Set<number>, tag: 'del' | 'ins') => {
    const runs: { changed: boolean; words: string[] }[] = [];
    words.forEach((w, k) => {
      const changed = !keep.has(k);
      if (runs.at(-1)?.changed === changed) runs.at(-1)!.words.push(w); else runs.push({ changed, words: [w] });
    });
    return html`${runs.map((r, k) => {
      const text = r.words.join(' ');
      return html`${k ? ' ' : ''}${!r.changed ? text : tag === 'del' ? html`<del>${text}</del>` : html`<ins>${text}</ins>`}`;
    })}`;
  };
  return [line(x, keepA, 'del'), line(y, keepB, 'ins')];
}

function changes(from: Claim[], to: Claim[]) {
  return to.flatMap((b) => {
    const a = from.find((c) => c.n === b.n);
    if (a && a.text === b.text && a.researcherId === b.researcherId && a.ids.join() === b.ids.join()) return [];
    return [{ n: b.n, a, b }];
  });
}

function cell(results: CheckResult[], claim: string): Markup {
  if (!results.length) return html`<td class="cg-cell"><span class="cg-na" aria-hidden="true"></span><span class="visually-hidden">Not run on ${claim}</span></td>`;
  const fail = results.find((r) => !r.pass);
  const detail = (fail ?? results[0]).detail ?? '';
  return fail
    ? html`<td class="cg-cell" title="${detail}"><svg class="cg-fail" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3l-6 6"/></svg><span class="visually-hidden">Failed on ${claim}: ${detail}</span></td>`
    : html`<td class="cg-cell" title="${detail}"><span class="cg-pass" aria-hidden="true"></span><span class="visually-hidden">Passed on ${claim}</span></td>`;
}

function checkGrid(h: Hold): Markup {
  const claims = h.request!.claims;
  const checks = h.verdict?.checks ?? [];
  const rows = checkIds.map((id: CheckId) => {
    const forClaim = (n: number | 'proposal') => checks.filter((c) => c.check === id && c.target === n);
    return html`<tr><th scope="row"><span class="cg-id">${id}</span> ${checkNames[id]}</th>
      ${claims.map((c) => h.verdict ? cell(forClaim(c.n), `claim ${c.n}`) : html`<td class="cg-cell"><span class="skeleton cg-wait"></span></td>`)}
      ${h.verdict ? cell(forClaim('proposal'), 'the whole proposal') : html`<td class="cg-cell"><span class="skeleton cg-wait"></span></td>`}</tr>`;
  });
  return html`<table class="check-grid">
    <thead><tr><th><span class="visually-hidden">Check</span></th>${claims.map((c) => html`<th class="cg-cell" scope="col"><span class="visually-hidden">Claim </span>${c.n}</th>`)}<th class="cg-cell" scope="col">All</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

export function holdScreen(reviewId: string): Screen {
  const root = el(html`<div class="hold"></div>`);
  let lastKey = '';

  function render(m: Model) {
    const h = m.holds.find((x) => x.reviewId === reviewId);
    const key = `${m.events.length}`;
    if (key === lastKey) return;
    lastKey = key;

    if (!h) {
      root.innerHTML = html`<nav class="crumbs" aria-label="Breadcrumb"><a href="#/holds">Holds</a><span aria-hidden="true">/</span><span>${reviewId}</span></nav>
        <header class="title-row"><div><h1>Hold ${reviewId}</h1>
        <p class="sub">${!m.events.length ? 'Loading the trace.' : store.atEnd && store.done ? `There is no hold ${reviewId} in this run.` : `${reviewId} has not happened yet at ${clock(m.horizon)} in this replay.`}</p></div></header>
        <a class="card-link" href="#/holds">All holds</a>`.value;
      return;
    }

    const siblings = m.holds.filter((x) => x.pairId === h.pairId).sort((a, b) => a.round - b.round);
    const next = siblings.find((x) => x.round === h.round + 1);
    const prev = siblings.find((x) => x.round === h.round - 1);
    const claims = h.request?.claims ?? [];
    const v = h.verdict;
    const abandoned = m.events.find((e) => e.type === 'pair.abandoned' && (e.data as { pairId?: string })?.pairId === h.pairId);
    const written = m.points.find((p) => p.kind === 'written' && p.pairId === h.pairId);

    // the finding: what failed and what happened next
    let sub: string;
    if (!v) sub = `The Critic is checking ${plural(claims.length, 'claim')}. ${who(h.writer)} waits; the other writers keep going.`;
    else if (v.pass) sub = `Every check passed on ${plural(claims.length, 'claim')}. write_proposal ran${written ? ` and ${h.pairId}.md was written at ${clock(written.t)}` : ''}.`;
    else {
      const failedNs = [...new Set(v.claims.map((c) => c.n))];
      // Lead with a claim's own explanation (C3 or C4 says whose record it is) over C2's bare mismatch.
      const main = v.claims.find((c) => c.n !== 'proposal' && c.check !== 'C2') ?? v.claims.find((c) => c.check !== 'C2') ?? v.claims[0];
      const nums = failedNs.filter((n): n is number => n !== 'proposal');
      const where = [
        ...(failedNs.includes('proposal') ? ['the proposal'] : []),
        ...(nums.length === 1 ? [`claim ${nums[0]}`] : nums.length ? [`claims ${nums.slice(0, -1).join(', ')} and ${nums.at(-1)}`] : []),
      ].join(' and ');
      const first = main.detail.split(/(?<=\.)\s/)[0];
      const after = next?.verdict
        ? (next.verdict.pass ? ` Round ${next.round} passed ${secs(next.reviewEnd! - h.end!)} later.` : ` Round ${next.round} failed again.`)
        : next ? ` Round ${next.round} is with the Critic.` : abandoned ? ` Round cap reached: ${h.pairId} was abandoned.` : '';
      sub = `Failed on ${where} (${main.check}, ${checkNames[main.check].toLowerCase()}): ${first}${after}`;
    }

    const held = h.end != null ? h.end - h.start : m.horizon - h.start;
    const others = overlap(m, h).sort((a, b) => a.start - b.start);
    const during = (loopId: string) => {
      const evs = m.events.filter((e) => e.loopId === loopId && e.ms > h.start && e.ms < (h.end ?? m.horizon));
      const tools = evs.filter((e) => e.type === 'function_call.started').length;
      const turns = evs.filter((e) => e.type === 'inference.started').length;
      const ownHold = evs.find((e) => e.type === 'interception.started');
      const bits = [tools && plural(tools, 'tool call'), turns && plural(turns, 'model turn'), ownHold && `held from ${clock(ownHold.ms)}`].filter(Boolean);
      return bits.length ? bits.join(', ') : 'running';
    };

    const pairChange = next ? changes(claims, next.request?.claims ?? []) : prev ? changes(prev.request?.claims ?? [], claims) : [];
    const changeTitle = next ? `What the writer changed for round ${next.round}` : `What changed since round ${prev?.round}`;

    // The two columns should end together. The waiting panel goes to the shorter column; the diff joins the shorter
    // column too when that brings the ends closer, and otherwise runs full width below.
    // Rough heights in px: a claim row 75, a Critic detail 70, the notice 88, the checks panel 435, a waiting row 40,
    // a changed claim 80.
    let leftH = 80 + claims.reduce((s, c) => s + 75 + 70 * (v?.claims.filter((f) => f.n === c.n).length ?? 0), 0) + (abandoned && !next ? 88 : 0);
    let rightH = 435;
    const waitLeft = leftH < rightH;
    if (waitLeft) leftH += 134 + 40 * others.length; else rightH += 134 + 40 * others.length;
    const diffH = 94 + 80 * pairChange.length;
    const diffSide: 'left' | 'right' | 'below' = !pairChange.length ? 'below'
      : Math.abs(Math.min(leftH, rightH) + diffH - Math.max(leftH, rightH)) < Math.abs(leftH - rightH) ? (leftH < rightH ? 'left' : 'right') : 'below';
    const [ra, rb] = next ? [h.round, next.round] : [prev?.round ?? 0, h.round];
    const diffPanel = !pairChange.length ? html`` : html`<section class="panel diff-panel" aria-labelledby="diff-h">
      <header><h2 id="diff-h">${changeTitle}</h2><a class="card-link" href="#/holds/${(next ?? prev)!.reviewId}">Open round ${(next ?? prev)!.round}</a></header>
      ${pairChange.some(({ a, b }) => !a || a.text !== b.text) ? html`<div class="diff-head" aria-hidden="true"><span></span><span>Round ${ra}</span><span>Round ${rb}</span></div>` : ''}
      <ul class="diff">${pairChange.map(({ n, a, b }) => {
        // Same sentence, new ID: show the sentence once and mark only what changed.
        if (a && a.text === b.text) {
          return html`<li class="same">
            <span class="claim-n num">${n}</span>
            <div><p>${b.text}</p>
              ${a.researcherId !== b.researcherId ? html`<p class="claim-meta">Names <del class="id">${a.researcherId}</del> <ins class="id">${b.researcherId}</ins></p>` : ''}
              ${a.ids.join() !== b.ids.join() ? html`<p class="claim-meta">Cites <del class="id">${a.ids.join(', ')}</del> <ins class="id">${b.ids.join(', ')}</ins></p>` : ''}</div>
          </li>`;
        }
        const [before, after] = a ? diffWords(a.text, b.text) : [html`<span class="muted">Not in round ${ra}</span>`, html`<ins>${b.text}</ins>`];
        return html`<li>
          <span class="claim-n num">${n}</span>
          <div><span class="visually-hidden">Round ${ra}: </span><p>${before}</p>
            ${a && a.researcherId !== b.researcherId ? html`<p class="claim-meta">Names <del class="id">${a.researcherId}</del></p>` : ''}
            ${a && a.ids.join() !== b.ids.join() ? html`<p class="claim-meta">Cites <del class="id">${a.ids.join(', ')}</del></p>` : ''}</div>
          <div><span class="visually-hidden">Round ${rb}: </span><p>${after}</p>
            ${a && a.researcherId !== b.researcherId ? html`<p class="claim-meta">Names <ins class="id">${b.researcherId}</ins></p>` : ''}
            ${a && a.ids.join() !== b.ids.join() ? html`<p class="claim-meta">Cites <ins class="id">${b.ids.join(', ')}</ins></p>` : ''}</div>
        </li>`;
      })}</ul>
    </section>`;
    const waitPanel = html`<section class="panel" aria-labelledby="wait-h">
      <header><h2 id="wait-h">While it waited</h2><span class="meta">${secs(held)}${h.end == null ? ' so far' : ''}</span></header>
      <p class="wait-span">Held from <time>${clockTenths(h.start)}</time> to <time>${h.end != null ? clockTenths(h.end) : 'now'}</time>. ${others.length ? 'Running meanwhile:' : 'Nothing else was running.'}</p>
      <ul class="rows">
        ${others.map((l) => html`<li class="row"><span class="who">${who(l.producer)}</span><span class="what"><span class="task">${l.label}</span> · ${l.producer === 'CR' && l.loopId === h.criticLoop ? `reviewing ${h.reviewId}` : during(l.loopId)}</span></li>`)}
      </ul>
    </section>`;

    root.innerHTML = html`
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/holds">Holds</a><span aria-hidden="true">/</span><span class="id">${h.reviewId}</span></nav>
      <header class="title-row">
        <div><h1>${who(h.writer)} held, round ${h.round}</h1><p class="sub">${linkIds(sub)}</p></div>
        <a class="card-link" href="#/proposals/${h.pairId}">Proposal ${h.pairId}</a>
      </header>
      <nav class="tabs" aria-label="Rounds of ${h.pairId}">
        ${siblings.map((s) => html`<a href="#/holds/${s.reviewId}" ${s.reviewId === h.reviewId ? html`aria-current="page"` : ''}>Round ${s.round} · ${s.verdict ? (s.verdict.pass ? 'passed' : 'failed') : 'checking'}</a>`)}
      </nav>
      <div class="hold-grid">
        <div class="stack">
          <section class="panel" aria-labelledby="claims-h">
            <header><h2 id="claims-h">Claims</h2><span class="meta">${plural(claims.length, 'claim')} submitted with write_proposal</span></header>
            <ol class="claims">
              ${claims.map((c) => {
                const fails = v?.claims.filter((f) => f.n === c.n) ?? [];
                const status = !v ? html`<span class="pill">Checking</span>` : fails.length ? html`<span class="pill neg">Failed ${fails.map((f) => f.check).join(', ')}</span>` : html`<span class="pill pos">Passed</span>`;
                return html`<li class="claim ${fails.length ? 'is-failed' : ''}">
                  <span class="claim-n num">${c.n}</span>
                  <div class="claim-body">
                    <p>${c.text}</p>
                    <p class="claim-meta">${kindNames[c.kind]}${c.researcherId ? html` · names ${ref(c.researcherId, markFor(h, c.n)(c.researcherId))}` : ''} · cites ${c.ids.map((id, i) => html`${i ? ', ' : ''}${ref(id, markFor(h, c.n)(id))}`)}</p>
                    ${fails.map((f) => html`<p class="claim-why"><strong>${f.check} ${checkNames[f.check]}.</strong> ${linkIds(f.detail, markFor(h, c.n))}</p>`)}
                  </div>
                  <span class="claim-status">${status}</span>
                </li>`;
              })}
            </ol>
          </section>
          ${abandoned && !next ? html`<p class="notice">Round cap reached, so ${h.pairId} was abandoned. ${linkIds((abandoned.data as { reason?: string }).reason ?? '')}</p>` : ''}
          ${waitLeft ? waitPanel : ''}
          ${diffSide === 'left' ? diffPanel : ''}
        </div>
        <div class="stack">
          <section class="panel" aria-labelledby="checks-h">
            <header><h2 id="checks-h">Checks</h2><span class="meta">${v ? `${v.checks.length} checks run` : 'Running'}</span></header>
            ${checkGrid(h)}
            <p class="cg-key"><span><span class="cg-pass" aria-hidden="true"></span>Passed</span><span><svg class="cg-fail" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3l-6 6"/></svg>Failed</span><span><span class="cg-na" aria-hidden="true"></span>Not run on this claim</span></p>
          </section>
          ${waitLeft ? '' : waitPanel}
          ${diffSide === 'right' ? diffPanel : ''}
        </div>
      </div>
      ${diffSide === 'below' ? diffPanel : ''}`.value;
  }

  return { title: `Hold ${reviewId}`, nav: 'holds', el: root, update: (m, reason) => { if (reason !== 'tick') render(m); } };
}
