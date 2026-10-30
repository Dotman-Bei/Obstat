// The hold timeline: one lane per participant, a bar per loop, held segments in the gate's teal and the Critic's
// review drawn as a teal outline. The cursor drops a line through every lane and the readout names the loops running
// at that moment, which is the concurrency proof drawn (PRD §11.2 S1).
import { activity, loopRunningAt, type Hold, type Loop, type Model } from '../data/model.ts';
import { clock, hhmm, participants, who } from '../lib/format.ts';
import { html, raw, type Markup } from '../lib/html.ts';

interface Range { start: number; end: number; horizon: number }
interface Row { pid: string; name: string; group: string; firstOfGroup: boolean; sub: number; y: number }

const PITCH = 24, BAR = 16, GROUP_GAP = 10, AXIS = 22;

/** Pack a lane's loops into sub-rows so loops that overlap (the Critic's reviews) never draw on top of each other. */
function pack(loops: Loop[], horizon: number): Map<string, number> {
  const ends: number[] = [];
  const out = new Map<string, number>();
  for (const l of [...loops].sort((a, b) => a.start - b.start)) {
    let r = ends.findIndex((e) => e <= l.start);
    if (r === -1) { r = ends.length; ends.push(0); }
    ends[r] = l.end ?? horizon;
    out.set(l.loopId, r);
  }
  return out;
}

export function legend(): Markup {
  const sw = (body: string) => raw(`<svg viewBox="0 0 16 10" aria-hidden="true">${body}</svg>`);
  return html`<div class="legend" aria-label="Key">
    <span>${sw('<rect x="0" y="1" width="16" height="8" rx="2" fill="var(--work)"/>')}Running</span>
    <span>${sw('<rect x="0" y="1" width="16" height="8" rx="2" fill="var(--accent)"/>')}Held by the gate</span>
    <span>${sw('<rect x="0.75" y="1.75" width="14.5" height="6.5" rx="2" fill="#fff" stroke="var(--accent)" stroke-width="1.5"/>')}Critic reviewing</span>
    <span>${sw('<circle cx="8" cy="5" r="4" fill="var(--text)"/>')}Proposal written</span>
    <span>${sw('<rect x="4" y="1" width="8" height="8" fill="#fff" stroke="var(--warning)" stroke-width="2"/>')}Pair abandoned</span>
  </div>`;
}

export class Timeline {
  private model!: Model;
  private range!: Range;
  private rows: Row[] = [];
  private x = (t: number) => t;
  private plot = { left: 0, right: 0 };
  private hover: { t: number; hold: Hold | null } | null = null;
  private resize = new ResizeObserver(() => this.draw());
  private width = 0;

  constructor(private host: HTMLElement, private readout: HTMLElement, private pinned: () => { t: number; hold: Hold | null } | null) {
    this.resize.observe(host);
    host.addEventListener('pointermove', (e) => this.onPointer(e));
    host.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    host.addEventListener('focusin', (e) => {
      const id = (e.target as Element).closest('[data-hold]')?.getAttribute('data-hold');
      const h = id && this.model.holds.find((x) => x.reviewId === id);
      if (h) { this.hover = { t: this.momentIn(h), hold: h }; this.drawCursor(); }
    });
    host.addEventListener('focusout', () => { this.hover = null; this.drawCursor(); });
  }

  destroy() { this.resize.disconnect(); }

  update(model: Model, range: Range) { this.model = model; this.range = range; this.draw(); }

  /** A moment inside a hold worth showing: the first tool call another loop makes while it waits. */
  momentIn(h: Hold): number {
    const end = h.end ?? this.model.horizon;
    const call = this.model.events.find((e) => e.ms > h.start && e.ms < end && e.loopId !== h.loopId && e.producer !== 'CR' && e.type === 'function_call.started');
    return call ? call.ms + 100 : h.start + Math.min(500, (end - h.start) / 2);
  }

  private onPointer(e: PointerEvent) {
    if (!this.model) return;
    const r = this.host.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < this.plot.left || px > this.plot.right) { if (this.hover) { this.hover = null; this.drawCursor(); } return; }
    const t = this.range.start + ((px - this.plot.left) / (this.plot.right - this.plot.left)) * (this.range.end - this.range.start);
    if (t > this.range.horizon) { if (this.hover) { this.hover = null; this.drawCursor(); } return; }
    const id = (e.target as Element).closest?.('[data-hold]')?.getAttribute('data-hold');
    const hold = (id && this.model.holds.find((h) => h.reviewId === id)) || null;
    this.hover = { t, hold };
    this.drawCursor();
  }

  private draw() {
    if (!this.model) return;
    const w = this.host.clientWidth;
    if (!w) return;
    this.width = w;
    const phone = w < 560;
    const labelW = phone ? 52 : 196;
    this.plot = { left: labelW, right: w - 6 };
    const { start, end, horizon } = this.range;
    const span = Math.max(end - start, 1);
    this.x = (t: number) => this.plot.left + ((t - start) / span) * (this.plot.right - this.plot.left);

    // rows
    this.rows = [];
    let y = AXIS + 6, group = '';
    const lanePacks = new Map<string, Map<string, number>>();
    for (const p of participants) {
      const loops = this.model.loops.filter((l) => l.producer === p.id);
      const packed = pack(loops, horizon);
      lanePacks.set(p.id, packed);
      const subs = Math.max(1, ...[...packed.values()].map((v) => v + 1));
      if (p.group !== group && group) y += GROUP_GAP;
      for (let s = 0; s < subs; s++) {
        this.rows.push({ pid: p.id, name: phone ? p.short : p.name, group: p.group, firstOfGroup: p.group !== group && s === 0, sub: s, y });
        group = p.group;
        y += s < subs - 1 ? BAR + 4 : PITCH;
      }
    }
    const height = y + 2;
    const rowOf = (pid: string, sub: number) => this.rows.find((r) => r.pid === pid && r.sub === sub)!;

    // ticks: every 30 s on desktop, every minute on a phone, from a round clock time
    const step = phone || w < 900 ? 60_000 : 30_000;
    const ticks: number[] = [];
    for (let t = Math.ceil(start / step) * step; t <= end; t += step) ticks.push(t);

    const parts: Markup[] = [];
    for (const t of ticks) {
      const tx = this.x(t);
      parts.push(html`<line class="gridline" x1="${tx}" x2="${tx}" y1="${AXIS}" y2="${height}"/>`);
      const label = step >= 60_000 ? hhmm(t) : clock(t);
      const anchor = tx - this.plot.left < 30 ? 'start' : this.plot.right - tx < 30 ? 'end' : 'middle';
      parts.push(html`<text class="tick" x="${tx}" y="13" text-anchor="${anchor}">${label}</text>`);
    }
    for (const r of this.rows) {
      if (r.sub > 0) continue;
      if (r.firstOfGroup && !phone) parts.push(html`<text class="group-name" x="0" y="${r.y + 12}">${r.group}</text>`);
      parts.push(html`<text class="lane-name" x="${phone ? 0 : 76}" y="${r.y + 12.5}">${r.name}</text>`);
    }
    // loops
    for (const l of this.model.loops) {
      const r = rowOf(l.producer, lanePacks.get(l.producer)!.get(l.loopId)!);
      const x1 = this.x(l.start), x2 = Math.max(this.x(Math.min(l.end ?? horizon, horizon)), x1 + 2);
      if (l.producer === 'CR') {
        const h = this.model.holds.find((x) => x.criticLoop === l.loopId);
        parts.push(html`<rect class="bar-review" x="${x1 + 0.75}" y="${r.y + 0.75}" width="${Math.max(x2 - x1 - 1.5, 1)}" height="${BAR - 1.5}" rx="${x2 - x1 < 12 ? 1 : 3}"><title>Critic reviewing ${h?.reviewId ?? ''}</title></rect>`);
        if (h && x2 - x1 > 44) parts.push(html`<text class="bar-label dark" x="${x1 + 6}" y="${r.y + 11.5}">${h.reviewId}</text>`);
      } else {
        parts.push(html`<rect class="bar-run" x="${x1}" y="${r.y}" width="${x2 - x1}" height="${BAR}" rx="3"><title>${who(l.producer)} · ${l.loopId} · ${l.label}</title></rect>`);
      }
    }
    // holds, each a link to its detail
    for (const h of this.model.holds) {
      const lane = this.model.loops.find((l) => l.loopId === h.loopId);
      if (!lane) continue;
      const r = rowOf(h.writer, lanePacks.get(h.writer)!.get(h.loopId)!);
      // A hold the Critic settled in a second is still wide enough to see and to point at.
      const x1 = this.x(h.start), x2 = Math.max(this.x(Math.min(h.end ?? horizon, horizon)), x1 + 7);
      const verdict = h.verdict ? (h.verdict.pass ? 'passed' : 'failed') : 'Critic checking';
      parts.push(html`<rect class="bar-held" x="${x1}" y="${r.y}" width="${x2 - x1}" height="${BAR}" rx="3"/>`);
      if (x2 - x1 > 44) parts.push(html`<text class="bar-label" x="${x1 + 6}" y="${r.y + 11.5}">${h.reviewId}</text>`);
      parts.push(html`<a href="#/holds/${h.reviewId}" data-hold="${h.reviewId}" aria-label="${h.reviewId}: ${who(h.writer)} held, ${h.pairId} round ${h.round}, ${verdict}"><rect class="hold-hit" x="${x1 - 3}" y="${r.y - 4}" width="${x2 - x1 + 6}" height="${BAR + 8}"/></a>`);
      parts.push(html`<rect class="focus-ring" data-ring="${h.reviewId}" x="${x1 - 2}" y="${r.y - 2}" width="${x2 - x1 + 4}" height="${BAR + 4}" rx="4"/>`);
    }
    // outcomes
    for (const p of this.model.points) {
      const lane = this.model.loops.find((l) => l.loopId === p.loopId);
      if (!lane) continue;
      const r = rowOf(p.producer, lanePacks.get(p.producer)!.get(p.loopId)!);
      const px = this.x(p.t) + 6, cy = r.y + BAR / 2;
      parts.push(p.kind === 'written'
        ? html`<circle class="pt-written" cx="${px}" cy="${cy}" r="4"><title>${p.pairId}.md written at ${clock(p.t)}</title></circle>`
        : html`<rect class="pt-abandoned" x="${px - 4}" y="${cy - 4}" width="8" height="8"><title>${p.pairId} abandoned at ${clock(p.t)}</title></rect>`);
    }
    if (horizon < end) parts.push(html`<line class="playhead" x1="${this.x(horizon)}" x2="${this.x(horizon)}" y1="${AXIS - 2}" y2="${height}"/>`);
    parts.push(html`<line class="cursor" data-cursor x1="0" x2="0" y1="${AXIS}" y2="${height}" visibility="hidden"/>`);

    const label = `Timeline of ${this.model.loops.length} loops across ${participants.length} participants from ${clock(start)} to ${clock(end)}, with ${this.model.holds.length} holds.`;
    this.host.innerHTML = html`<svg width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="group" aria-label="${label}">${parts}</svg>`.value;
    this.drawCursor();
  }

  /** Only the cursor and the readout change on hover; the bars are left alone. */
  private drawCursor() {
    if (!this.model || !this.width) return;
    const at = this.hover ?? this.pinned();
    const line = this.host.querySelector<SVGLineElement>('[data-cursor]');
    this.host.querySelectorAll('.focus-ring.on').forEach((n) => n.classList.remove('on'));
    if (!at) {
      line?.setAttribute('visibility', 'hidden');
      this.readout.innerHTML = html`<span class="what">${this.model.loops.length ? `${this.model.loops.length} loops so far.` : 'Waiting for the first trace line.'}</span>`.value;
      return;
    }
    const cx = this.x(at.t);
    line?.setAttribute('x1', String(cx)); line?.setAttribute('x2', String(cx)); line?.setAttribute('visibility', 'visible');
    if (at.hold) this.host.querySelector(`[data-ring="${at.hold.reviewId}"]`)?.classList.add('on');

    const running = this.model.loops
      .filter((l) => loopRunningAt(l, at.t, this.model.horizon) && l.loopId !== at.hold?.loopId)
      .sort((a, b) => participants.findIndex((p) => p.id === a.producer) - participants.findIndex((p) => p.id === b.producer));
    const list = running.map((l, i) => html`${i ? ', ' : ''}<span class="who">${who(l.producer)}</span> <span class="what">(${activity(this.model, l, at.t)})</span>`);
    const head = at.hold
      ? html`<span class="who">${who(at.hold.writer)} held</span> <span class="what">(${at.hold.reviewId}, ${at.hold.pairId} round ${at.hold.round}).</span> ${running.length ? html`Running at this moment: ${list}.` : 'Nothing else was running.'}`
      : html`${running.length ? html`${running.length} running: ${list}.` : 'Nothing running.'}`;
    this.readout.innerHTML = html`<time>${clock(at.t)}</time><span>${head}</span>`.value;
  }
}
