// Shapes shared by writers, the gate, the Critic and the console (PRD §9, §10).

export const CLAIM_KINDS = ['authored', 'patent', 'project', 'available_for', 'challenge', 'company_fact', 'other'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const FORMATS = ['industrial_phd', 'joint_project', 'contract_research'] as const;
export type ProposalFormat = (typeof FORMATS)[number];

export interface Claim {
  n: number;
  kind: ClaimKind;
  text: string;
  researcherId: string | null;
  ids: string[];
}

export interface ProposalSections {
  title: string;
  problem: string;
  researchQuestions: string[];
  /** One row per line: "period | work | output". */
  plan: string;
  eachSideBrings: { company: string; faculty: string };
  whyThisPair: string;
  agreedUpFront: string;
}

/** The arguments of a write_proposal call. Factual sentences in sections carry {n} markers that point at claims. */
export interface WriteProposalInput {
  pairId: string;
  researcherIds: string[];
  companyId: string;
  challengeId: string;
  format: ProposalFormat;
  sections: ProposalSections;
  claims: Claim[];
}

export type CheckId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10';

export const CHECK_NAMES: Record<CheckId, string> = {
  C1: 'ID exists',
  C2: 'Attribution',
  C3: 'Duplicate profile',
  C4: 'Namesake',
  C5: 'Availability',
  C6: 'Capacity',
  C7: 'Research problem',
  C8: 'Sections complete',
  C9: 'No ranking of people',
  C10: 'Support',
};

/** One check run against one claim, or against the whole proposal. */
export interface CheckResult {
  check: CheckId;
  target: number | 'proposal';
  pass: boolean;
  detail?: string;
  /** The record that decided the check, and the value in it that decided it (the console highlights it). */
  record?: string;
  mark?: string;
}

export interface ClaimFailure { n: number | 'proposal'; check: CheckId; pass: false; detail: string }

export interface ReviewRequest {
  reviewId: string;
  /** Writer name as the trace shows it: W1, W2, W3. */
  writerId: string;
  pairId: string;
  round: number;
  callId: string;
  proposal: WriteProposalInput;
}

/** PRD §9 verdict: `claims` lists the failures, `checks` every check run. */
export interface Verdict {
  reviewId: string;
  writerId: string;
  pairId: string;
  round: number;
  pass: boolean;
  claims: ClaimFailure[];
  checks: CheckResult[];
}

const str = { type: 'string' } as const;

/** Strict JSON Schema for write_proposal: every field required, nothing extra. */
export const writeProposalSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pairId', 'researcherIds', 'companyId', 'challengeId', 'format', 'sections', 'claims'],
  properties: {
    pairId: str,
    researcherIds: { type: 'array', items: str },
    companyId: str,
    challengeId: str,
    format: { type: 'string', enum: [...FORMATS] },
    sections: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'problem', 'researchQuestions', 'plan', 'eachSideBrings', 'whyThisPair', 'agreedUpFront'],
      properties: {
        title: str,
        problem: str,
        researchQuestions: { type: 'array', items: str },
        plan: str,
        eachSideBrings: { type: 'object', additionalProperties: false, required: ['company', 'faculty'], properties: { company: str, faculty: str } },
        whyThisPair: str,
        agreedUpFront: str,
      },
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'kind', 'text', 'researcherId', 'ids'],
        properties: {
          n: { type: 'integer' },
          kind: { type: 'string', enum: [...CLAIM_KINDS] },
          text: str,
          researcherId: { type: ['string', 'null'] },
          ids: { type: 'array', items: str },
        },
      },
    },
  },
} as const;

/** Only the contract's fields: a provider without strict schemas can add stray ones, which are not saved. */
export function contractFields(p: WriteProposalInput): WriteProposalInput {
  const s = p.sections;
  return {
    pairId: p.pairId, researcherIds: p.researcherIds, companyId: p.companyId, challengeId: p.challengeId, format: p.format,
    sections: { title: s.title, problem: s.problem, researchQuestions: s.researchQuestions, plan: s.plan, eachSideBrings: { company: s.eachSideBrings.company, faculty: s.eachSideBrings.faculty }, whyThisPair: s.whyThisPair, agreedUpFront: s.agreedUpFront },
    claims: p.claims.map((c) => ({ n: c.n, kind: c.kind, text: c.text, researcherId: c.researcherId ?? null, ids: c.ids })),
  };
}

type Parsed = { ok: true; value: WriteProposalInput } | { ok: false; error: string };

/** Parses write_proposal arguments. A provider in strict mode already enforces the schema; this guards the rest. */
export function parseWriteProposal(args: string): Parsed {
  let v: any;
  try {
    v = JSON.parse(args);
  } catch (e) {
    return { ok: false, error: `the arguments are not valid JSON (${(e as Error).message})` };
  }
  const problems: string[] = [];
  const isStr = (x: unknown) => typeof x === 'string';
  const strs = (x: unknown) => Array.isArray(x) && x.every(isStr);
  if (!v || typeof v !== 'object') return { ok: false, error: 'the arguments are not an object' };
  for (const k of ['pairId', 'companyId', 'challengeId'] as const) if (!isStr(v[k])) problems.push(`${k} must be a string (it is ${v[k] === undefined ? 'missing' : JSON.stringify(v[k])})`);
  if (!strs(v.researcherIds) || !v.researcherIds.length) problems.push('researcherIds must list at least one ID');
  if (!FORMATS.includes(v.format)) problems.push(`format must be one of ${FORMATS.join(', ')}`);
  const s = v.sections;
  if (!s || typeof s !== 'object') problems.push('sections is missing');
  else {
    for (const k of ['title', 'problem', 'plan', 'whyThisPair', 'agreedUpFront'] as const) if (!isStr(s[k])) problems.push(`sections.${k} must be a string`);
    if (!strs(s.researchQuestions)) problems.push('sections.researchQuestions must be a list of strings');
    if (!s.eachSideBrings || !isStr(s.eachSideBrings.company) || !isStr(s.eachSideBrings.faculty)) problems.push('sections.eachSideBrings needs company and faculty');
  }
  if (!Array.isArray(v.claims) || !v.claims.length) problems.push('claims must list at least one claim');
  else {
    v.claims.forEach((c: any, i: number) => {
      if (!c || !Number.isInteger(c.n)) problems.push(`the claim at position ${i + 1} needs an integer n (it has ${JSON.stringify(c?.n) ?? 'none'})`);
      else if (!CLAIM_KINDS.includes(c.kind)) problems.push(`claim ${c.n} has unknown kind "${c.kind}"`);
      else if (!isStr(c.text) || !strs(c.ids) || !(c.researcherId === null || c.researcherId === undefined || isStr(c.researcherId))) problems.push(`claim ${c.n} needs text, ids and researcherId`);
      else c.researcherId ??= null;
    });
  }
  return problems.length ? { ok: false, error: problems.join('; ') } : { ok: true, value: v as WriteProposalInput };
}

/** One line of out/trace.jsonl, and one message on the console's /events stream. */
export interface TraceLine {
  t: string;
  type: string;
  producer: string;
  loopId?: string;
  summary: string;
  data?: Record<string, unknown>;
}

export type ChallengeClassName = 'research' | 'not_research' | 'no_uns_fit';

export interface ChallengeClass { cls: ChallengeClassName; reason: string; ids: string[] }

/** A researcher and a challenge the Matchmaker shortlisted, and how far its proposal got. */
export interface Pair {
  pairId: string;
  researcherIds: string[];
  companyId: string;
  challengeId: string;
  format: ProposalFormat;
  why: string;
  evidence: string[];
  status: 'shortlisted' | 'writing' | 'written' | 'abandoned';
  writerId?: string;
  reason?: string;
  replacedBy?: string;
}
