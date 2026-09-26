/** A tiny typed event bus for app-level events (docs/PLAN.md §3.3). */

export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  /** Subscribes; returns an unsubscribe function. */
  on<K extends keyof Events>(type: K, handler: (payload: Events[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as (payload: never) => void);
    return () => set.delete(handler as (payload: never) => void);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    for (const handler of [...(this.handlers.get(type) ?? [])]) {
      (handler as (p: Events[K]) => void)(payload);
    }
  }
}
