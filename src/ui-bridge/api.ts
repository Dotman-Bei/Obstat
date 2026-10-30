// The console's read endpoints (PRD §11.1), answered from a finished run's files: out/trace.jsonl, out/run.json and
// out/proposals/*.json, plus records from the in-memory index. Nothing is re-run and nothing is invented.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChallengeClass, CheckId, Claim, Pair, ProposalFormat, ProposalSections, TraceLine, Verdict, WriteProposalInput } from '../contract.ts';
import { getRecord, titleOf, type DataIndex } from '../data/index.ts';

interface RunFile { pairs: Pair[]; classes: Record<string, ChallengeClass>; verdicts: Verdict[] }
interface Written extends WriteProposalInput { writerId: string; verdict: Verdict; writtenAt: string }

export interface ProposalListItem {
  pairId: string; title: string; writerId: string; researcherId: string; researcherName: string; companyId: string; companyName: string;
  challengeId: string; format: ProposalFormat; status: 'written' | 'abandoned'; rounds: string[]; writtenAt?: string; abandonedAt?: string;
}
export interface Proposal extends ProposalListItem { sections: ProposalSections; claims: Claim[]; abandonReason?: string; replacedBy?: string }

export class RunApi {
  readonly lines: TraceLine[];
  private readonly ix: DataIndex;
  private readonly run: RunFile;
  private readonly written = new Map<string, Written>();
  readonly source: string;

  constructor(ix: DataIndex, outDir: string, source = 'out/trace.jsonl') {
    this.ix = ix;
    this.source = source;
    this.lines = readFileSync(join(outDir, 'trace.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TraceLine);
    this.run = JSON.parse(readFileSync(join(outDir, 'run.json'), 'utf8')) as RunFile;
    const dir = join(outDir, 'proposals');
    if (existsSync(dir)) {
      for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        const p = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Written;
        this.written.set(p.pairId, p);
      }
    }
  }

  record(id: string) {
    const hit = getRecord(this.ix, id);
    return hit && { id, type: hit.type, title: titleOf(hit.record), record: hit.record };
  }

  /** The last proposal a writer submitted for a pair, from the trace: what an abandoned pair got to. */
  private lastSubmitted(pairId: string): WriteProposalInput | undefined {
    return this.lines.filter((l) => l.type === 'claim.review.requested' && (l.data as any)?.pairId === pairId).map((l) => (l.data as any).proposal as WriteProposalInput).at(-1);
  }

  private item(pair: Pair): ProposalListItem & { proposal?: WriteProposalInput } {
    const w = this.written.get(pair.pairId);
    const proposal = w ?? this.lastSubmitted(pair.pairId);
    const researcherId = proposal?.researcherIds[0] ?? pair.researcherIds[0];
    const company = this.ix.companies.get(pair.companyId);
    const abandonedLine = this.lines.find((l) => l.type === 'pair.abandoned' && (l.data as any)?.pairId === pair.pairId);
    return {
      pairId: pair.pairId,
      title: proposal?.sections.title ?? `${this.ix.researchers.get(researcherId)?.name ?? researcherId} with ${company?.name ?? pair.companyId}`,
      writerId: w?.writerId ?? pair.writerId ?? '',
      researcherId,
      researcherName: this.ix.researchers.get(researcherId)?.name ?? researcherId,
      companyId: pair.companyId,
      companyName: company?.name ?? pair.companyId,
      challengeId: pair.challengeId,
      format: proposal?.format ?? pair.format,
      status: pair.status === 'written' ? 'written' : 'abandoned',
      rounds: this.run.verdicts.filter((v) => v.pairId === pair.pairId).map((v) => v.reviewId),
      ...(w ? { writtenAt: w.writtenAt } : {}),
      ...(abandonedLine ? { abandonedAt: abandonedLine.t } : {}),
      proposal,
    };
  }

  /** Pairs that reached a writer and ended written or abandoned, in shortlist order. */
  private settled(): Pair[] {
    return this.run.pairs.filter((p) => p.status === 'written' || p.status === 'abandoned');
  }

  proposals(): ProposalListItem[] {
    return this.settled().map((p) => {
      const { proposal: _, ...item } = this.item(p);
      return item;
    });
  }

  proposal(pairId: string): Proposal | undefined {
    const pair = this.settled().find((p) => p.pairId === pairId);
    if (!pair) return undefined;
    const { proposal, ...item } = this.item(pair);
    const empty: ProposalSections = { title: item.title, problem: '', researchQuestions: [], plan: '', eachSideBrings: { company: '', faculty: '' }, whyThisPair: '', agreedUpFront: '' };
    return {
      ...item,
      sections: proposal?.sections ?? empty,
      claims: proposal?.claims ?? [],
      ...(pair.status === 'abandoned' ? { abandonReason: pair.reason ?? '' } : {}),
      ...(pair.replacedBy ? { replacedBy: pair.replacedBy } : {}),
    };
  }

  summary() {
    const ix = this.ix;
    const name = (id: string) => ix.researchers.get(id)?.name ?? id;
    const items = this.proposals();
    const failed = new Map<CheckId, number>();
    for (const v of this.run.verdicts) for (const f of v.claims) failed.set(f.check, (failed.get(f.check) ?? 0) + 1);
    const writers = [...new Set(this.run.verdicts.map((v) => v.writerId))].sort();
    const turned = Object.entries(this.run.classes).filter(([, c]) => c.cls !== 'research') as [string, ChallengeClass & { cls: 'not_research' | 'no_uns_fit' }][];
    const reasons = new Map<string, number>();
    for (const [id, c] of turned) {
      const r = reasonGroup(c, ix.challenges.get(id)?.text ?? '');
      reasons.set(r, (reasons.get(r) ?? 0) + 1);
    }
    return {
      mode: 'replay' as const,
      source: this.source,
      researchers: ix.researchers.size,
      challenges: ix.challenges.size,
      proposed: items.filter((p) => p.status === 'written').map((p) => ({ pairId: p.pairId, researcherId: p.researcherId, researcherName: p.researcherName, challengeId: p.challengeId, companyName: p.companyName, format: p.format })),
      abandoned: items.filter((p) => p.status === 'abandoned').map((p) => {
        const pair = this.run.pairs.find((x) => x.pairId === p.pairId)!;
        return { pairId: p.pairId, researcherId: p.researcherId, researcherName: name(p.researcherId), challengeId: p.challengeId, reason: pair.reason ?? '', ...(pair.replacedBy ? { replacedBy: pair.replacedBy } : {}), lastReview: p.rounds.at(-1) ?? '' };
      }),
      failedChecks: [...failed].sort((a, b) => b[1] - a[1]).map(([check, count]) => ({ check, count })),
      holdsPerWriter: writers.map((w) => {
        const mine = this.run.verdicts.filter((v) => v.writerId === w);
        return { writerId: w, holds: mine.length, failed: mine.filter((v) => !v.pass).length };
      }),
      noMatch: {
        total: turned.length,
        byClass: (['not_research', 'no_uns_fit'] as const).map((cls) => ({ cls, count: turned.filter(([, c]) => c.cls === cls).length })).filter((x) => x.count),
        byReason: [...reasons].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
        items: turned.slice(0, 12).map(([id, c]) => {
          const ch = ix.challenges.get(id)!;
          return { challengeId: id, companyName: ix.companies.get(ch.companyId)?.name ?? ch.companyId, title: ch.text.length > 120 ? `${ch.text.slice(0, 119)}…` : ch.text, cls: c.cls, reason: c.reason };
        }),
      },
    };
  }
}

// The Analyst writes a free-text reason per challenge; the summary groups them by what the work actually is.
const GROUPS: [string, RegExp][] = [
  ['Hiring or staffing', /\bhir(e|ing)|recruit|staff|talent|turnover|retention|human resource|onboard/i],
  ['Funding, grants or investment', /fund|grant|invest|loan|financ|valuation|capital|subsid|voucher/i],
  ['Legal, tax or compliance paperwork', /legal|gdpr|\btax|\bvat\b|contract|complian|regulat|permit|licen[cs]|certif|audit|ifrs|accounting|bookkeep/i],
  ['Sales, marketing or market entry', /sales|market|pricing|go-to-market|partnership|customer acquisition|expan|export|brand|tender|procurement bid/i],
  ['Buying or procurement', /procure|purchas|supplier|vendor|\bbuy|sourcing/i],
  ['Routine software or IT work', /software|integration|migration|website|\bapp\b|deployment|implementation|it support|database/i],
];

function reasonGroup(c: ChallengeClass, challengeText: string): string {
  if (c.cls === 'no_uns_fit') return 'No researcher in the field';
  const text = `${c.reason} ${challengeText}`;
  return GROUPS.find(([, re]) => re.test(text))?.[0] ?? 'Other non-research work';
}
