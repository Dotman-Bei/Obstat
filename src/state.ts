// Shared state (PRD §10). Participants read and write it; none of them calls another.
import { RuntimeState } from '@mozaik-ai/core';
import type { ChallengeClass, Pair } from './contract.ts';
import type { IdentityHint } from './data/identities.ts';
import type { DataIndex } from './data/index.ts';
import { Reviews } from './gate/wait-for-verdict.ts';

export type { ChallengeClass, ChallengeClassName, Pair } from './contract.ts';

export interface LoopStatus { participant: string; loopId: string; lastEventAt: number; state: 'running' | 'stalled' | 'done' }

export class ObstatState extends RuntimeState {
  index: DataIndex;
  identities: Map<string, IdentityHint>;
  challengeClass = new Map<string, ChallengeClass>();
  shortlist: Pair[] = [];
  /** Researcher ID (canonical) -> pairs the gate has passed with them. */
  commitments = new Map<string, string[]>();
  reviews = new Reviews();
  loops = new Map<string, LoopStatus>();
  /** Writer name -> the pair it is writing now. */
  assignments = new Map<string, string>();
  /** Participant name -> what its next loop is for; the trace labels the loop with it. */
  loopIntent = new Map<string, { label: string; data?: Record<string, unknown> }>();
  /** Run progress the Coordinator reads to know when the run is over. */
  progress = { profilesReady: new Set<string>(), batchesDone: 0, batchesTotal: 0, shortlisting: false, matchmakerRuns: 0 };

  constructor(index: DataIndex, identities: Map<string, IdentityHint>) {
    super();
    this.index = index;
    this.identities = identities;
  }
}
