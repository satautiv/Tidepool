/**
 * One playing tab at a time. Every tab keeps its own copy of the save and writes it back, so
 * two open tabs would erase each other's progress (last writer wins). A newly opened tab claims
 * the game over a BroadcastChannel; older tabs hear the claim and go dormant (the App stops
 * saving and offers "Play here", which reloads and claims it back).
 */

export interface TabChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
  close(): void;
}

interface ClaimMessage {
  type: 'claim';
  id: string;
}

const isClaim = (data: unknown): data is ClaimMessage =>
  !!data &&
  typeof data === 'object' &&
  (data as ClaimMessage).type === 'claim' &&
  typeof (data as ClaimMessage).id === 'string';

export class TabGuard {
  private activeValue = true;

  /**
   * `channel` null (no BroadcastChannel) means the guard can't see other tabs and stays active.
   * `onTakenOver` runs once, when another tab claims the game.
   */
  constructor(
    private readonly channel: TabChannel | null,
    private readonly onTakenOver: () => void,
    private readonly id: string = Math.random().toString(36).slice(2),
  ) {
    channel?.addEventListener('message', (e) => {
      if (!isClaim(e.data) || e.data.id === this.id || !this.activeValue) return;
      this.activeValue = false;
      this.onTakenOver();
    });
  }

  /** Tells older tabs that this one plays now. */
  claim(): void {
    this.channel?.postMessage({ type: 'claim', id: this.id } satisfies ClaimMessage);
  }

  get active(): boolean {
    return this.activeValue;
  }
}

/** The shared channel, where the browser has one. */
export function tabChannel(name = 'tidepool-tabs'): TabChannel | null {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null;
}
