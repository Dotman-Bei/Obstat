// What every check reads, and small helpers they share.
import type { CheckId, CheckResult, Claim, WriteProposalInput } from '../../contract.ts';
import type { IdentityHint } from '../../data/identities.ts';
import { recordType, type DataIndex } from '../../data/index.ts';
import type { ChallengeClass } from '../../state.ts';

export interface CheckContext {
  ix: DataIndex;
  hints: Map<string, IdentityHint>;
  challengeClass: Map<string, ChallengeClass>;
  /** Canonical researcher ID -> pairs the gate has already passed with them. */
  commitments: Map<string, string[]>;
  proposal: WriteProposalInput;
  today: Date;
}

export type ClaimCheck = (claim: Claim, ctx: CheckContext) => CheckResult;
export type ProposalCheck = (ctx: CheckContext) => CheckResult;

type Extra = Pick<CheckResult, 'record' | 'mark' | 'detail'>;

export const pass = (check: CheckId, target: number | 'proposal', extra: Extra = {}): CheckResult => ({ check, target, pass: true, ...extra });
export const fail = (check: CheckId, target: number | 'proposal', detail: string, extra: Omit<Extra, 'detail'> = {}): CheckResult => ({ check, target, pass: false, detail, ...extra });

/** The publications, projects and patents among a claim's IDs. */
export function workIds(ids: string[]): string[] {
  return ids.filter((id) => ['publication', 'project', 'patent'].includes(recordType(id) ?? ''));
}

/** Which entries of a work credit people: "author entries" on a publication, and so on. */
export function entriesOf(id: string): string {
  return { publication: 'author entries', project: 'participant entries', patent: 'inventor entries' }[recordType(id) as 'publication'] ?? 'entries';
}

export function who(ix: DataIndex, id: string): string {
  const r = ix.researchers.get(id);
  return r ? `${id} ${r.name}` : id;
}
