/**
 * One playing tab at a time. Every tab keeps its own copy of the save and writes it back, so
 * two open tabs would erase each other's progress (last writer wins).
 *
 * A newly opened tab claims the game over a BroadcastChannel before it loads the save. Older
 * tabs answer "held", write out what they have (the App flushes its save, then stops saving),
 * and answer "released". The new tab waits for that, so it loads the latest progress.
 */

export interface TabChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
  close(): void;
}

type TabMessage =
  | { type: 'claim'; id: string }
  | { type: 'held'; id: string; to: string }
  | { type: 'released'; id: string; to: string };

const isMessage = (data: unknown): data is TabMessage =>
  !!data &&
  typeof data === 'object' &&
  ['claim', 'held', 'released'].includes((data as TabMessage).type) &&
  typeof (data as TabMessage).id === 'string';

export interface TabGuardOptions {
  /** How long a claim waits for older tabs to answer (ms). */
  answerMs?: number;
  /** How long it waits for a tab that answered to write out its save (ms). */
  releaseMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  id?: string;
}

export class TabGuard {
  private activeValue = true;
  private readonly id: string;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  /** Tabs that answered this tab's claim and haven't released yet. */
  private readonly holders = new Set<string>();
  private onRelease: (() => void) | null = null;

  /**
   * `channel` null (no BroadcastChannel) means the guard can't see other tabs and stays active.
   * `onTakenOver` runs once, when another tab claims the game. The claiming tab waits for the
   * promise it returns (the save written out) before it loads.
   */
  constructor(
    private readonly channel: TabChannel | null,
    private readonly onTakenOver: () => void | Promise<void>,
    private readonly opts: TabGuardOptions = {},
  ) {
    this.id = opts.id ?? Math.random().toString(36).slice(2);
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    channel?.addEventListener('message', (e) => this.receive(e.data));
  }

  /**
   * Tells older tabs that this one plays now, and resolves once they have written out their
   * save (or didn't answer in time: then there are none, or they are frozen).
   */
  claim(): Promise<void> {
    if (!this.channel) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.onRelease = null;
        resolve();
      };
      this.onRelease = () => {
        if (this.holders.size === 0) finish();
      };
      this.channel!.postMessage({ type: 'claim', id: this.id } satisfies TabMessage);
      const answerMs = this.opts.answerMs ?? 50;
      this.setTimer(() => {
        if (this.holders.size === 0) finish();
      }, answerMs);
      this.setTimer(finish, answerMs + (this.opts.releaseMs ?? 1000));
    });
  }

  get active(): boolean {
    return this.activeValue;
  }

  private receive(data: unknown): void {
    if (!isMessage(data) || data.id === this.id) return;
    if (data.type === 'claim') {
      if (!this.activeValue) return; // dormant tabs no longer write
      this.activeValue = false;
      const to = data.id;
      this.post({ type: 'held', id: this.id, to });
      void Promise.resolve()
        .then(() => this.onTakenOver())
        .catch(() => {})
        .then(() => this.post({ type: 'released', id: this.id, to }));
      return;
    }
    if (data.to !== this.id || !this.onRelease) return;
    if (data.type === 'held') this.holders.add(data.id);
    else this.holders.delete(data.id);
    this.onRelease();
  }

  private post(message: TabMessage): void {
    this.channel?.postMessage(message);
  }
}

/** The shared channel, where the browser has one. */
export function tabChannel(name = 'tidepool-tabs'): TabChannel | null {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null;
}
