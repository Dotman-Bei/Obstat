// Matchmaker: reacts to profiles.ready and challenges.ready. Once every profile is ready and the first batches are
// classified, it shortlists pairs from code-retrieved candidates, each with evidence IDs; on pair.abandoned it finds a
// replacement. It answers in JSON, and code turns away pairs the gate would fail anyway (a second record, someone who
// left, an emeritus for a non-consulting role, a repeat, evidence that does not credit the researcher); if any are
// turned away it gets one more turn, told why. Emits pair.shortlisted.
// With --demo it also seeds the PRD's trap pair, R0139 with C062-CH1, as pair-2 (F5).
import { FORMATS, type ProposalFormat } from '../../contract.ts';
import { carriers } from '../../data/index.ts';
import { candidatesFor, terms } from '../../data/search.ts';
import { FAILED, PRIORITY } from '../../llm.ts';
import type { Pair } from '../../state.ts';
import { parseJson } from '../analyst/index.ts';
import { AgentRunner, emit, handle, type Ctx } from '../shared.ts';

const INSTRUCTION = `You are the Matchmaker in Obstat. You propose researcher–challenge pairs worth a joint project, an industrial PhD or contract research.
Pick pairs where the researcher's own work answers the company's stated problem. Prefer specific overlaps (a method, a material, a measurement) over a shared buzzword.
For each pair give: researcherId, challengeId, format (industrial_phd, joint_project or contract_research), evidence (one to three publication, project or patent IDs from that researcher's candidate line) and why (one sentence about the work and the problem).
Never use a researcher or a challenge twice. Never rank or compare people.`;

const SCHEMA = {
  type: 'object',
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          researcherId: { type: 'string' }, challengeId: { type: 'string' }, format: { type: 'string', enum: [...FORMATS] },
          evidence: { type: 'array', items: { type: 'string' } }, why: { type: 'string' },
        },
        required: ['researcherId', 'challengeId', 'format', 'evidence', 'why'],
      },
    },
  },
  required: ['pairs'],
};

type Proposed = { researcherId: string; challengeId: string; format: ProposalFormat; evidence: string[]; why: string };

const SEED = { researcherIds: ['R0139'], challengeId: 'C062-CH1', format: 'industrial_phd' as ProposalFormat, evidence: ['SYN-PUB-01827'], why: 'Seeded by --demo: R0139\'s profile lists GPR hyperbola-detection work and Terramap misses about one in five hyperbolas.' };
const MAX_EXTRA = 3;
const ATTEMPTS = 2;

export function createMatchmaker(ctx: Ctx): AgentRunner {
  const { state, config } = ctx;
  const ix = state.index;
  const canon = (id: string) => state.identities.get(id)?.canonicalId ?? id;
  let seeded = !ctx.demo;
  const queue: { pairId: string; reasons: string[] }[] = [];

  // The demo pair counts as taken from the start, so the Matchmaker cannot pick R0539 or C062-CH1 before it is seeded.
  const pending = () => (seeded ? [] : [SEED]);
  const usedResearchers = () => new Set([...state.shortlist, ...pending()].flatMap((p) => p.researcherIds.map(canon)));
  const usedChallenges = () => new Set([...state.shortlist, ...pending()].map((p) => p.challengeId));

  function add(p: Omit<Pair, 'pairId' | 'status' | 'companyId'>): Pair {
    const pair: Pair = { ...p, pairId: `pair-${state.shortlist.length + 1}`, companyId: ix.challenges.get(p.challengeId)!.companyId, status: 'shortlisted' };
    state.shortlist.push(pair);
    emit(ctx, runner.agent, 'pair.shortlisted', {
      summary: `${pair.pairId}: ${pair.researcherIds.join(', ')} with ${pair.challengeId} (${pair.format})`,
      pairId: pair.pairId, researcherIds: pair.researcherIds, companyId: pair.companyId, challengeId: pair.challengeId, format: pair.format, evidence: pair.evidence, why: pair.why,
    });
    return pair;
  }

  /** Why the pair cannot be shortlisted, or null. */
  function problem(p: Proposed): string | null {
    const r = ix.researchers.get(p.researcherId);
    if (!r) return `${p.researcherId} is not in the dataset`;
    const hint = state.identities.get(r.id)!;
    if (hint.canonicalId !== r.id) return `${r.id} is a second record of ${hint.canonicalId}; use ${hint.canonicalId}`;
    if (hint.status === 'left') return `${r.id} has left the university`;
    if (hint.status !== 'active') return `${r.id} is ${hint.status} and available for consulting only`;
    const cls = state.challengeClass.get(p.challengeId);
    if (!cls) return `${p.challengeId} has not been classified yet`;
    if (cls.cls !== 'research') return `${p.challengeId} is classified ${cls.cls}`;
    if (!FORMATS.includes(p.format)) return `format must be one of ${FORMATS.join(', ')}`;
    if (usedResearchers().has(r.id)) return `${r.id} is already in a pair`;
    if (usedChallenges().has(p.challengeId)) return `${p.challengeId} is already in a pair`;
    if (!p.evidence?.length) return 'evidence is empty';
    const foreign = p.evidence.filter((id) => !carriers(ix, id).includes(r.id));
    if (foreign.length) return `${foreign.join(', ')} ${foreign.length === 1 ? 'does' : 'do'} not credit ${r.id}`;
    return null;
  }

  /** Shortlists valid pairs up to `wanted`, the demo pair going in second; returns what was turned away. */
  function accept(pairs: Proposed[], wanted: { n: number }): string[] {
    const rejected: string[] = [];
    for (const p of pairs) {
      if (wanted.n <= 0) break;
      const why = problem(p);
      if (why) {
        rejected.push(`${p.researcherId} with ${p.challengeId}: ${why}`);
        continue;
      }
      add({ researcherIds: [p.researcherId], challengeId: p.challengeId, format: p.format, evidence: p.evidence, why: p.why });
      wanted.n -= 1;
      // The demo pair goes in second, so Writer 2 takes it, as in PRD §8.3.
      if (!seeded) {
        seeded = true;
        add(SEED);
      }
    }
    return rejected;
  }

  /** One line per challenge: the problem and its closest researchers, each with works that credit them. */
  function candidateLines(limit: number): string {
    const used = usedResearchers();
    const rows = [...state.challengeClass].filter(([id, c]) => c.cls === 'research' && !usedChallenges().has(id)).map(([id]) => {
      const ch = ix.challenges.get(id)!;
      const cands = candidatesFor(ctx.search, state.identities, ch, config.candidates)
        .map((c) => ({ ...c, researcherId: canon(c.researcherId) }))
        .filter((c) => !used.has(c.researcherId) && state.identities.get(c.researcherId)?.status === 'active')
        .slice(0, 3);
      return { id, ch, cands, best: cands[0]?.score ?? 0, want: new Set(terms(`${ch.text} ${ch.detail}`)) };
    }).filter((r) => r.cands.length).sort((a, b) => b.best - a.best).slice(0, limit);

    return rows.map(({ id, ch, cands, want }) => {
      const company = ix.companies.get(ch.companyId)!;
      const people = cands.map((c) => {
        const r = ix.researchers.get(c.researcherId)!;
        const works = (ix.credited.get(r.id) ?? [])
          .map((wid) => ({ wid, title: ix.publications.get(wid)?.title ?? ix.projects.get(wid)?.title ?? ix.patents.get(wid)?.title ?? '' }))
          .map((w) => ({ ...w, hits: terms(w.title).filter((t) => want.has(t)).length }))
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 2)
          .map((w) => `${w.wid} "${w.title}"`);
        return `${r.id} ${r.name}, ${r.fields.slice(0, 2).join('; ')} (${c.score.toFixed(2)}): ${works.join('; ')}`;
      });
      return `${id} | ${company.name} | ${ch.text}\n   ${people.join('\n   ')}`;
    }).join('\n');
  }

  async function shortlistRun(count: number, why: string) {
    state.progress.shortlisting = true;
    state.progress.matchmakerRuns += 1;
    const wanted = { n: count };
    let feedback = '';
    try {
      for (let attempt = 1; attempt <= ATTEMPTS && wanted.n > 0 && !ctx.llm.stopReason; attempt++) {
        const answer = await runner.run(
          `${why} Shortlist exactly ${wanted.n} ${wanted.n === 1 ? 'pair' : 'pairs'}.${feedback}\nCandidates (challenge | company | problem, then its closest researchers with works that credit them):\n${candidateLines(40)}`,
          { label: count === 1 ? 'finding a replacement pair' : `shortlisting ${count} pairs`, structuredOutput: { name: 'shortlist', schema: SCHEMA } },
        );
        if (answer.startsWith(FAILED)) break;
        const rejected = accept(parseJson<{ pairs: Proposed[] }>(answer)?.pairs ?? [], wanted);
        feedback = rejected.length ? `\nTurned away last time: ${rejected.join('; ')}.` : '';
      }
      if (!seeded) {
        seeded = true;
        add(SEED);
      }
    } finally {
      state.progress.shortlisting = false;
    }
    const next = queue.shift();
    if (next) await replace(next);
  }

  async function replace(abandoned: { pairId: string; reasons: string[] }) {
    if (ctx.llm.stopReason) return;
    if (state.shortlist.length >= config.pairs + MAX_EXTRA) {
      ctx.log(`no replacement for ${abandoned.pairId}: the shortlist already has ${state.shortlist.length} pairs`);
      return;
    }
    if (runner.busy || state.progress.shortlisting) {
      queue.push(abandoned);
      return;
    }
    await shortlistRun(1, `${abandoned.pairId} was abandoned: ${abandoned.reasons.join(' ')}`);
  }

  // With --demo the shortlist waits until the Analyst has classified the demo challenge, so its hold shows only real
  // failures, not "not classified yet". If the Analyst turned it away, the demo pair is not seeded.
  const demoReady = () => {
    if (seeded) return true;
    const cls = state.challengeClass.get(SEED.challengeId);
    if (cls && cls.cls !== 'research') {
      ctx.log(`demo pair not seeded: the Analyst classified ${SEED.challengeId} as ${cls.cls}`);
      seeded = true;
    }
    return !!cls;
  };
  const ready = () => state.progress.profilesReady.size === config.profilers
    && state.progress.batchesDone >= Math.min(1, state.progress.batchesTotal || 1)
    && (demoReady() || state.progress.batchesDone === state.progress.batchesTotal);
  let started = false;

  const runner: AgentRunner = new AgentRunner(ctx, {
    name: 'MM',
    instruction: INSTRUCTION,
    model: config.models.mid,
    priority: PRIORITY.other,
    handlers: () => [
      handle(ctx, ['profiles.ready', 'challenges.ready'], async () => {
        if (started || !ready()) return;
        started = true;
        await shortlistRun(config.pairs - (seeded ? 0 : 1), 'Profiles are ready and the first challenge batches are classified.');
      }),
      handle<{ pairId: string; reasons: string[] }>(ctx, 'pair.abandoned', (e) => replace(e.payload)),
    ],
  });
  return runner;
}
