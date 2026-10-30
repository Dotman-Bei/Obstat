import type { CheckId, ClaimKind, ParticipantId, ProposalFormat } from '../data/types.ts';

export interface Participant { id: ParticipantId; name: string; short: string; group: 'Reading' | 'Matching' | 'Writing' | 'Checking' }

/** Lanes in the order the work flows. Observers (Trace Observer, UI Bridge) run no loops, so they have no lane. */
export const participants: Participant[] = [
  { id: 'CO', name: 'Coordinator', short: 'Coord', group: 'Reading' },
  { id: 'P1', name: 'Profiler 1', short: 'P1', group: 'Reading' },
  { id: 'P2', name: 'Profiler 2', short: 'P2', group: 'Reading' },
  { id: 'P3', name: 'Profiler 3', short: 'P3', group: 'Reading' },
  { id: 'P4', name: 'Profiler 4', short: 'P4', group: 'Reading' },
  { id: 'AN', name: 'Industry Analyst', short: 'Analyst', group: 'Reading' },
  { id: 'MM', name: 'Matchmaker', short: 'Match', group: 'Matching' },
  { id: 'W1', name: 'Writer 1', short: 'W1', group: 'Writing' },
  { id: 'W2', name: 'Writer 2', short: 'W2', group: 'Writing' },
  { id: 'W3', name: 'Writer 3', short: 'W3', group: 'Writing' },
  { id: 'CR', name: 'Critic', short: 'Critic', group: 'Checking' },
];
const byId = new Map(participants.map((p) => [p.id, p]));
export const who = (id: string) => byId.get(id as ParticipantId)?.name ?? id;

export const checkNames: Record<CheckId, string> = {
  C1: 'ID exists', C2: 'Attribution', C3: 'Duplicate profile', C4: 'Namesake', C5: 'Availability',
  C6: 'Capacity', C7: 'Research problem', C8: 'Sections complete', C9: 'No ranking of people', C10: 'Support',
};
export const checkIds = Object.keys(checkNames) as CheckId[];

export const kindNames: Record<ClaimKind, string> = {
  authored: 'Authored', patent: 'Patent', project: 'Project', available_for: 'Availability',
  challenge: 'Challenge', company_fact: 'Company fact', other: 'Other',
};

export const formatNames: Record<ProposalFormat, string> = {
  industrial_phd: 'Industrial PhD', joint_project: 'Joint project', contract_research: 'Contract research',
};

// Times are shown in CET, where the event runs, whatever the viewer's clock says.
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const minuteFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', day: 'numeric', month: 'short', year: 'numeric' });

export const clock = (ms: number) => clockFmt.format(ms);
export const clockTenths = (ms: number) => `${clockFmt.format(ms)}.${Math.floor((ms % 1000) / 100)}`;
export const hhmm = (ms: number) => minuteFmt.format(ms);
export const day = (ms: number) => dayFmt.format(ms);

/** A duration in seconds with one decimal: 8.1 s. */
export const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
