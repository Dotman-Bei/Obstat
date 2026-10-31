// Shapes the console reads. They follow PRD §9–§11; where the PRD leaves a field open, docs/FRONTEND.md §3 fixes it.

export type ParticipantId = 'CO' | 'P1' | 'P2' | 'P3' | 'P4' | 'AN' | 'MM' | 'W1' | 'W2' | 'W3' | 'CR';

/** One line of out/trace.jsonl, and one SSE message on /events. */
export interface TraceLine {
  t: string;
  type: string;
  producer: ParticipantId;
  loopId?: string;
  summary: string;
  data?: Record<string, unknown>;
}

export type ClaimKind = 'authored' | 'patent' | 'project' | 'available_for' | 'challenge' | 'company_fact' | 'other';

export interface Claim {
  n: number;
  kind: ClaimKind;
  text: string;
  researcherId?: string;
  ids: string[];
}

export type CheckId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10';

/** One check run against one claim (or against the whole proposal, for C8). */
export interface CheckResult {
  check: CheckId;
  target: number | 'proposal';
  pass: boolean;
  detail?: string;
  /** The record that decided the check, and the value in it that decided it. */
  record?: string;
  mark?: string;
}

export interface ReviewRequest {
  reviewId: string;
  writerId: ParticipantId;
  pairId: string;
  round: number;
  claims: Claim[];
}

/** PRD §9 verdict shape: `claims` lists the failures; `checks` lists every check run. */
export interface Verdict {
  reviewId: string;
  writerId: ParticipantId;
  pairId: string;
  round: number;
  pass: boolean;
  claims: { n: number | 'proposal'; check: CheckId; pass: false; detail: string }[];
  checks: CheckResult[];
}

export type ProposalFormat = 'industrial_phd' | 'joint_project' | 'contract_research';

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

export interface ProposalListItem {
  pairId: string;
  title: string;
  writerId: ParticipantId;
  researcherId: string;
  researcherName: string;
  companyId: string;
  companyName: string;
  challengeId: string;
  format: ProposalFormat;
  status: 'written' | 'abandoned';
  rounds: string[];
  writtenAt?: string;
  abandonedAt?: string;
}

export interface Proposal extends ProposalListItem {
  sections: ProposalSections;
  claims: Claim[];
  abandonReason?: string;
  replacedBy?: string;
}

export type RecordType = 'researcher' | 'publication' | 'project' | 'patent' | 'company' | 'challenge';

export interface DatasetRecord {
  id: string;
  type: RecordType;
  title: string;
  record: Record<string, unknown>;
}

export interface Summary {
  mode: 'replay' | 'live';
  source: string;
  researchers: number;
  challenges: number;
  proposed: { pairId: string; researcherId: string; researcherName: string; challengeId: string; companyName: string; format: ProposalFormat }[];
  abandoned: { pairId: string; researcherId: string; researcherName: string; challengeId: string; reason: string; replacedBy?: string; lastReview: string }[];
  failedChecks: { check: CheckId; count: number }[];
  holdsPerWriter: { writerId: ParticipantId; holds: number; failed: number }[];
  noMatch: {
    total: number;
    byClass: { cls: 'not_research' | 'no_uns_fit'; count: number }[];
    byReason: { reason: string; count: number }[];
    items: { challengeId: string; companyName: string; title: string; cls: 'not_research' | 'no_uns_fit'; reason: string }[];
  };
}
