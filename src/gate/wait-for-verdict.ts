// Pending reviews, kept in RuntimeState.reviews (PRD §8.2). The gate opens one before it asks the Critic; the
// verdict is matched by reviewId only, never by event order (issue #115). No answer in time resolves to null.
import type { Verdict } from '../contract.ts';

export interface PendingReview {
  reviewId: string;
  writerId: string;
  pairId: string;
  round: number;
  status: 'pending' | 'completed' | 'timeout';
  verdict?: Verdict;
  settle?: (verdict: Verdict | null) => void;
}

/** A held call's review, reserved when the gate claims the call so the trace can name it from the first line. */
export interface HeldCall { reviewId: string; writerId: string; pairId: string; round: number; malformed: boolean; args: string }

export class Reviews {
  readonly byId = new Map<string, PendingReview>();
  /** Call ID -> its held review. */
  readonly byCall = new Map<string, HeldCall>();
  private seq = 0;

  nextId(): string {
    this.seq += 1;
    return `rv_${String(this.seq).padStart(2, '0')}`;
  }

  /** Registers the review and returns its verdict, or null when timeoutMs passes first. Call before sending the request. */
  open(review: Omit<PendingReview, 'status' | 'settle' | 'verdict'>, timeoutMs: number): Promise<Verdict | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish(null), timeoutMs);
      const entry: PendingReview = { ...review, status: 'pending' };
      const finish = (verdict: Verdict | null) => {
        if (entry.status !== 'pending') return;
        clearTimeout(timer);
        entry.status = verdict ? 'completed' : 'timeout';
        entry.settle = undefined;
        resolve(verdict);
      };
      entry.settle = finish;
      this.byId.set(review.reviewId, entry);
    });
  }

  /** The Critic writes its verdict here before it announces it. */
  record(verdict: Verdict): void {
    const entry = this.byId.get(verdict.reviewId);
    if (entry && entry.status === 'pending') entry.verdict = verdict;
  }

  /** Called when claim.review.completed arrives. Returns false for an unknown, finished or timed-out review. */
  resolve(reviewId: string, fallback?: Verdict): boolean {
    const entry = this.byId.get(reviewId);
    if (!entry?.settle) return false;
    const verdict = entry.verdict ?? fallback;
    if (!verdict) return false;
    entry.verdict = verdict;
    entry.settle(verdict);
    return true;
  }
}
