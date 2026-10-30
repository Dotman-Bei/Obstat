import type { Model } from '../data/model.ts';

export type NavId = 'run' | 'holds' | 'proposals' | 'summary';

export interface Screen {
  /** The screen's name, for the phone bar and the document title. */
  title: string;
  nav: NavId;
  el: HTMLElement;
  /** Called when the trace on screen changes ('events') or the playhead moves ('tick'). */
  update?(m: Model, reason: 'events' | 'tick' | 'status'): void;
  destroy?(): void;
}
