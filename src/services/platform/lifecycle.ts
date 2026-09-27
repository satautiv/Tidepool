/**
 * Page lifecycle (docs/PLAN.md §3.4, §13.4): one `hide`/`show` pair however the page is
 * backgrounded. On the web that is `visibilitychange` plus `pagehide`/`pageshow`; Capacitor's
 * app events join in T5.02.
 */

export interface LifecycleEnv {
  window: EventTarget;
  document: EventTarget & { visibilityState: DocumentVisibilityState };
}

type Handler = () => void;

export class Lifecycle {
  private hiddenValue: boolean;
  private readonly hideHandlers = new Set<Handler>();
  private readonly showHandlers = new Set<Handler>();

  constructor(env: LifecycleEnv) {
    this.hiddenValue = env.document.visibilityState === 'hidden';
    env.document.addEventListener('visibilitychange', () => {
      if (env.document.visibilityState === 'hidden') this.hide();
      else this.show();
    });
    env.window.addEventListener('pagehide', () => this.hide());
    env.window.addEventListener('pageshow', () => {
      if (env.document.visibilityState !== 'hidden') this.show();
    });
  }

  get hidden(): boolean {
    return this.hiddenValue;
  }

  /** Called once each time the page goes to the background. Returns an unsubscribe. */
  onHide(fn: Handler): () => void {
    this.hideHandlers.add(fn);
    return () => this.hideHandlers.delete(fn);
  }

  /** Called once each time the page comes back. Returns an unsubscribe. */
  onShow(fn: Handler): () => void {
    this.showHandlers.add(fn);
    return () => this.showHandlers.delete(fn);
  }

  private hide(): void {
    if (this.hiddenValue) return;
    this.hiddenValue = true;
    for (const fn of [...this.hideHandlers]) fn();
  }

  private show(): void {
    if (!this.hiddenValue) return;
    this.hiddenValue = false;
    for (const fn of [...this.showHandlers]) fn();
  }
}
